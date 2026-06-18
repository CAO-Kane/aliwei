import type { UIMessage } from "ai";
import { createThread, getThread, insertMessage, touchThread } from "@aliwei/db";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { getChatModel } from "@/agents/base/model";
import { createJargonGraph, jargonStreamChat } from "@/agents/jargon/graph";
import { createWeeklyGraph, weeklyStreamChat } from "@/agents/weekly/graph";
import { createOkrGraph, okrStreamChat } from "@/agents/okr/graph";
import { createReviewGraph, reviewStreamChat } from "@/agents/review/graph";
import { createStartGraph, startStreamChat } from "@/agents/start/graph";
import { streamGraphToUIMessageStream } from "@/agents/shared/stream-adapter";

type ChatRequest = {
  messages: UIMessage[];
  system?: string;
  tools?: Record<string, { description?: string; parameters: unknown }>;
  threadId?: string;
  agentId?: string | null; // renamed from toolId; null when no agent is active
  userId: string;
};

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// Exported for testing: spec §6 invariant — graph receives a single HumanMessage
// containing only the text of the last user turn.
export function lastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return lastUser ? extractText(lastUser) : "";
}

// Detects "this request is a resume of an interrupted ask_user tool" by
// finding an assistant message whose final tool part is a completed
// ask_user invocation (output-available) that hasn't been answered by a
// later user turn AND hasn't already been consumed by the LLM in this
// same assistant message.
//
// "Already consumed" means: after the tool-ask_user output-available part
// there is a later text part or another tool part — i.e. the LLM already
// saw the tool result and produced a response. Re-sending Command.resume
// in that case re-injects the same result, the LLM re-generates the same
// text, and the client loops indefinitely.
export function detectAskUserResume(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return null;
    if (m.role !== "assistant") continue;
    // Walk parts left-to-right so we can detect "tool followed by anything
    // else" — meaning the LLM has consumed it. Return the answer only if
    // ask_user output is the actual last semantically meaningful part.
    let askUserAnswer: string | null = null;
    let consumed = false;
    for (let j = 0; j < m.parts.length; j++) {
      const p = m.parts[j] as { type?: string; state?: string; output?: unknown };
      if (p.type === "tool-ask_user" && p.state === "output-available") {
        const out = p.output as { selected?: string } | undefined;
        if (typeof out?.selected === "string") {
          askUserAnswer = out.selected;
          consumed = false;
        }
      } else if (askUserAnswer !== null && isContentfulPart(p)) {
        // Anything content-bearing after the ask_user tool result means
        // the LLM already used it. Mark consumed.
        consumed = true;
      }
    }
    return consumed ? null : askUserAnswer;
  }
  return null;
}

export function detectSuggestAgentResume(messages: UIMessage[]): boolean | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return null;
    if (m.role !== "assistant") continue;
    let suggestAnswer: boolean | null = null;
    let consumed = false;
    for (let j = 0; j < m.parts.length; j++) {
      const p = m.parts[j] as { type?: string; state?: string; output?: unknown };
      if (p.type === "tool-suggest_agent" && p.state === "output-available") {
        const out = p.output as { confirmed?: boolean } | undefined;
        if (typeof out?.confirmed === "boolean") {
          suggestAnswer = out.confirmed;
          consumed = false;
        }
      } else if (suggestAnswer !== null && isContentfulPart(p)) {
        consumed = true;
      }
    }
    return consumed ? null : suggestAnswer;
  }
  return null;
}

// True if a part contributes content the LLM may have generated AFTER
// consuming an ask_user tool result. step-start is a structural marker
// (not content) so it does not count.
function isContentfulPart(p: { type?: string; state?: string }): boolean {
  if (!p.type) return false;
  if (p.type === "step-start") return false;
  if (p.type === "text") return true;
  if (p.type === "reasoning") return true;
  // Any other tool call (not the original ask_user) means the LLM moved on.
  if (p.type.startsWith("tool-") || p.type === "dynamic-tool") return true;
  return false;
}

type Streamer = (opts: {
  graph: ReturnType<typeof createJargonGraph>;
  userMessage: HumanMessage;
  threadId: string;
  agentId: string;
  onFinish?: (text: string) => void | Promise<void>;
}) => Promise<Response>;

const GRAPH_FACTORIES: Record<
  string,
  (model: ReturnType<typeof getChatModel>) => ReturnType<typeof createJargonGraph>
> = {
  jargon: createJargonGraph,
  weekly: createWeeklyGraph,
  okr: createOkrGraph,
  review: createReviewGraph,
  start: createStartGraph,
};

const STREAMERS: Record<string, Streamer> = {
  jargon: jargonStreamChat,
  weekly: weeklyStreamChat,
  okr: okrStreamChat,
  review: reviewStreamChat,
  start: startStreamChat,
};

export async function streamChat(req: ChatRequest) {
  const agentId = req.agentId ?? "start";
  const currentThreadId = req.threadId ?? crypto.randomUUID();

  const existingThread = req.threadId ? getThread(req.threadId) : null;
  if (!existingThread) {
    const firstUserMsg = req.messages.find((m) => m.role === "user");
    const title = firstUserMsg ? extractText(firstUserMsg).slice(0, 20) || "新对话" : "新对话";
    createThread({
      id: currentThreadId,
      userId: req.userId,
      title,
      agentId: agentId === "start" ? null : agentId,
    });
  }

  const model = getChatModel();
  const graph = (GRAPH_FACTORIES[agentId] ?? createStartGraph)(model);

  const onFinish = async (text: string) => {
    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text }],
    };
    insertMessage({
      id: assistantMessage.id,
      threadId: currentThreadId,
      role: "assistant",
      content: JSON.stringify(assistantMessage),
    });
  };

  // Resume branch: user just answered an ask_user or suggest_agent interrupt.
  // Feed the answer back into the paused graph instead of starting a new turn.
  const resumeAnswer = detectAskUserResume(req.messages);
  const suggestAgentAnswer = detectSuggestAgentResume(req.messages);
  const resumeValue: string | boolean | null = resumeAnswer ?? suggestAgentAnswer;

  if (resumeValue !== null) {
    const response = await streamGraphToUIMessageStream(
      graph,
      new Command({ resume: resumeValue }),
      currentThreadId,
      onFinish,
      { isResume: true },
    );
    touchThread(currentThreadId);
    return response;
  }

  const lastUserMessage = [...req.messages].reverse().find((m) => m.role === "user");
  if (lastUserMessage) {
    insertMessage({
      id: lastUserMessage.id,
      threadId: currentThreadId,
      role: "user",
      content: JSON.stringify(lastUserMessage),
    });
  }

  const streamer: Streamer = STREAMERS[agentId] ?? startStreamChat;
  const userMessage = new HumanMessage(lastUserText(req.messages));

  const response = await streamer({
    graph,
    userMessage,
    threadId: currentThreadId,
    agentId,
    onFinish,
  });
  touchThread(currentThreadId);
  return response;
}
