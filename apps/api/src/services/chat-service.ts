import type { UIMessage } from "ai";
import { createThread, getThread, insertMessage, touchThread } from "@aliwei/db";
import { HumanMessage } from "@langchain/core/messages";
import { getChatModel } from "@/agents/base/model";
import { createJargonGraph, jargonStreamChat } from "@/agents/jargon/graph";
import { createWeeklyGraph, weeklyStreamChat } from "@/agents/weekly/graph";
import { createOkrGraph, okrStreamChat } from "@/agents/okr/graph";
import { createReviewGraph, reviewStreamChat } from "@/agents/review/graph";
import { createStartGraph, startStreamChat } from "@/agents/start/graph";
import { streamGraphToUIMessageStream } from "@/agents/shared/stream-adapter";
import { decideResume } from "@/agents/shared/resume-policy";

type ChatRequest = {
  messages: UIMessage[];
  system?: string;
  tools?: Record<string, { description?: string; parameters: unknown }>;
  threadId?: string;
  agentId?: string | null; // null when no agent is active
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
  const decision = await decideResume(graph, currentThreadId, agentId);

  if (decision.kind === "resume") {
    const response = await streamGraphToUIMessageStream(
      graph,
      decision.command,
      currentThreadId,
      onFinish,
      { isResume: true, skipPrefix: decision.skipPrefix },
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
