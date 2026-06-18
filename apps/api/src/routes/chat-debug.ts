import { Hono } from "hono";
import { HumanMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createJargonGraph, jargonStreamChat } from "@/agents/jargon/graph";

const app = new Hono();

app.get("/", async (c) => {
  const agentId = c.req.query("agentId") ?? "jargon";
  const message = c.req.query("message") ?? "hi";
  const threadId = c.req.query("threadId") ?? `debug-${Date.now()}`;

  if (agentId !== "jargon") {
    return c.json({ error: `debug route only supports agentId=jargon (got ${agentId})` }, 400);
  }

  const fake = new FakeListChatModel({
    responses: [`echo: ${message}`, "follow-up: 好的,继续"],
  });
  const graph = createJargonGraph(fake as any);

  return jargonStreamChat({
    graph,
    userMessage: new HumanMessage(message),
    threadId,
    agentId,
  });
});

export default app;
