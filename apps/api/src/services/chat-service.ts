import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  convertToModelMessages,
  streamText,
  type JSONSchema7,
  type UIMessage,
} from "ai";
import {
  createThread,
  getThread,
  insertMessage,
  touchThread,
} from "@aliwei/db";
import { llmClient, MODEL_NAME } from "./llm-client";
import { streamWeeklyReport } from "@/agents/weekly-reporter";

const WEEKLY_TOOL_ID = "weekly";

// 每用户 5 分钟内最多触发 3 次周报（单次最多 16 次 LLM 调用，防止成本放大）
const weeklyRateLimitMap = new Map<string, number[]>();
const WEEKLY_RATE_WINDOW_MS = 5 * 60 * 1000;
const WEEKLY_RATE_MAX = 3;

function checkWeeklyRateLimit(userId: string): boolean {
  const now = Date.now();
  const prev = weeklyRateLimitMap.get(userId) ?? [];
  const recent = prev.filter((t) => now - t < WEEKLY_RATE_WINDOW_MS);
  if (recent.length >= WEEKLY_RATE_MAX) {
    weeklyRateLimitMap.set(userId, recent);
    return false;
  }
  weeklyRateLimitMap.set(userId, [...recent, now]);
  return true;
}

type ChatRequest = {
  messages: UIMessage[];
  system?: string;
  tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  threadId?: string;
  toolId?: string;
  userId: string;
};

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export async function streamChat(req: ChatRequest) {
  const currentThreadId = req.threadId ?? crypto.randomUUID();
  const existingThread = req.threadId ? getThread(req.threadId) : null;
  if (existingThread && existingThread.userId !== req.userId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!existingThread) {
    const firstUserMsg = req.messages.find((m) => m.role === "user");
    const title = firstUserMsg
      ? extractText(firstUserMsg).slice(0, 20) || "新对话"
      : "新对话";
    createThread({
      id: currentThreadId,
      userId: req.userId,
      title,
      toolId: req.toolId,
    });
  }

  const lastUserMessage = [...req.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUserMessage) {
    insertMessage({
      id: lastUserMessage.id,
      threadId: currentThreadId,
      role: "user",
      content: JSON.stringify(lastUserMessage),
    });
  }

  // 助手消息入库 + 线程刷新：抽成共享回调，单轮路径与周报 agent 复用
  const persistAssistant = (text: string) => {
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
    touchThread(currentThreadId);
  };

  // === 周报：多步 actor-critic agent，单独分流，不走通用单轮 streamText ===
  if (req.toolId === WEEKLY_TOOL_ID) {
    if (!checkWeeklyRateLimit(req.userId)) {
      return new Response(
        JSON.stringify({ error: "周报生成太频繁，请 5 分钟后再试" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    const rawInput = lastUserMessage ? extractText(lastUserMessage) : "";
    return streamWeeklyReport({
      rawInput,
      onAssistantFinish: persistAssistant,
    });
  }

  // === 通用单轮路径（原逻辑，仅把 onFinish 改为复用 persistAssistant）===
  const result = streamText({
    // .chat() forces /v1/chat/completions; default routes to /v1/responses,
    // which Aliyun/Moark-compatible endpoints do not implement.
    model: llmClient.chat(MODEL_NAME),
    messages: await convertToModelMessages(req.messages),
    system: req.system,
    tools: {
      ...frontendTools(req.tools ?? {}),
    },
    onFinish: ({ text }) => persistAssistant(text),
  });

  return result.toUIMessageStreamResponse();
}
