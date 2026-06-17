import { Hono } from "hono";
import type { JSONSchema7, UIMessage } from "ai";
import { Command } from "@langchain/langgraph";
import { streamChat } from "@/services/chat-service";
import { getChatModel } from "@/agents/base/model";
import { createJargonGraph } from "@/agents/jargon/graph";
import { createWeeklyGraph } from "@/agents/weekly/graph";
import { createOkrGraph } from "@/agents/okr/graph";
import { createReviewGraph } from "@/agents/review/graph";
import { streamGraphToUIMessageStream } from "@/agents/shared/stream-adapter";

const app = new Hono();

type Body = {
  messages: UIMessage[];
  system?: string;
  tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  threadId?: string;
  toolId?: string;
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

const GRAPH_FACTORIES: Record<
  string,
  (model: ReturnType<typeof getChatModel>) => ReturnType<typeof createJargonGraph>
> = {
  jargon: createJargonGraph,
  weekly: createWeeklyGraph,
  okr: createOkrGraph,
  review: createReviewGraph,
};

app.post("/continue", async (c) => {
  const body = (await c.req.json()) as {
    threadId: string;
    toolId: string;
    answer: string;
  };

  const factory = GRAPH_FACTORIES[body.toolId];
  if (!factory) {
    return c.json({ error: `toolId ${body.toolId} not supported on /continue` }, 400);
  }

  const graph = factory(getChatModel());
  return streamGraphToUIMessageStream(
    graph,
    new Command({ resume: body.answer }),
    body.threadId,
  );
});

export default app;
