import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import chatRouter from "../chat";
import { resetChatModel } from "@/agents/base/model";
import { resetCheckpointer } from "@/agents/base/checkpointer";

function buildApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as any, "test-user");
    await next();
  });
  app.route("/chat", chatRouter);
  return app;
}

// Smoke test: the legacy /chat/continue endpoint has been removed; resume is
// detected from the request body in POST /chat (last assistant part is a
// tool-ask_user output-available — see chat-service detectAskUserResume).
describe("POST /chat", () => {
  beforeEach(() => {
    process.env.CHECKPOINTER_DB_PATH = `/tmp/aliwei-chat-route-${Date.now()}.db`;
    process.env.ALIBABA_BASE_URL = "http://localhost:9999";
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.MODEL_NAME = "qwen-test";
    resetChatModel();
    resetCheckpointer();
  });

  it("legacy /chat/continue is gone (404)", async () => {
    const app = buildApp();
    const res = await app.request("/chat/continue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: "t-1", toolId: "jargon", answer: "yes" }),
    });
    expect(res.status).toBe(404);
  });

  it("accepts a resume request (last assistant part is tool-ask_user output)", async () => {
    const app = buildApp();
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: `t-resume-${Date.now()}`,
        toolId: "jargon",
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-ask_user",
                toolCallId: "tc-1",
                state: "output-available",
                input: { question: "详细还是简略?", options: ["详细", "简略"] },
                output: { selected: "详细" },
              },
            ],
          },
        ],
      }),
    });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();
  });
});
