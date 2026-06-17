import { Hono } from "hono";
import type { JSONSchema7, UIMessage } from "ai";
import { streamChat } from "@/services/chat-service";

const app = new Hono();

type Body = {
  messages: UIMessage[];
  system?: string;
  tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  threadId?: string;
  agentId?: string;     // renamed from toolId
};

app.post("/", async (c) => {
  const body = (await c.req.json()) as Body;
  const userId = c.var.userId;

  const streamResponse = await streamChat({ ...body, userId });

  // Bridge Web Response back to Hono — preserve streaming body + headers
  return new Response(streamResponse.body, {
    status: streamResponse.status,
    headers: streamResponse.headers,
  });
});

export default app;
