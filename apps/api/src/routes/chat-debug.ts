import { Hono } from "hono";
import { HumanMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createJargonGraph, jargonStreamChat } from "@/agents/jargon/graph";

const app = new Hono();

app.get("/", async (c) => {
  const toolId = c.req.query("toolId") ?? "jargon";
  const message = c.req.query("message") ?? "hi";
  const threadId = c.req.query("threadId") ?? `debug-${Date.now()}`;

  if (toolId !== "jargon") {
    return c.json({ error: `debug route only supports toolId=jargon (got ${toolId})` }, 400);
  }

  const fake = new FakeListChatModel({
    responses: [`echo: ${message}`, "follow-up: 好的,继续"],
  });
  const graph = createJargonGraph(fake as any);

  return jargonStreamChat({
    graph,
    userMessage: new HumanMessage(message),
    threadId,
    toolId,
  });
});

export default app;
