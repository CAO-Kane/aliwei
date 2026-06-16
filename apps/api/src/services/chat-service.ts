import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, streamText, type JSONSchema7, type UIMessage } from "ai";
import { createThread, getThread, insertMessage, touchThread } from "@aliwei/db";
import { getLlmClient, getModelName } from "./llm-client";

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
  if (!existingThread) {
    const firstUserMsg = req.messages.find((m) => m.role === "user");
    const title = firstUserMsg ? extractText(firstUserMsg).slice(0, 20) || "新对话" : "新对话";
    createThread({
      id: currentThreadId,
      userId: req.userId,
      title,
      toolId: req.toolId,
    });
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

  const result = streamText({
    // .chat() forces /v1/chat/completions; default routes to /v1/responses,
    // which Aliyun/Moark-compatible endpoints do not implement.
    model: getLlmClient().chat(getModelName()),
    messages: await convertToModelMessages(req.messages),
    system: req.system,
    tools: {
      ...frontendTools(req.tools ?? {}),
    },
    onFinish: ({ text }) => {
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
    },
  });

  return result.toUIMessageStreamResponse();
}
