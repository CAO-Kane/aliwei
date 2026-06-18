import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import chatDebug from "../chat-debug";
import { resetChatModel } from "@/agents/base/model";
import { resetCheckpointer } from "@/agents/base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-debug.db";

function buildApp() {
  const app = new Hono();
  app.route("/chat/debug", chatDebug);
  return app;
}

describe("GET /chat/debug", () => {
  beforeEach(() => {
    process.env.CHECKPOINTER_DB_PATH = TEST_DB;
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    process.env.ALIBABA_BASE_URL = "http://localhost:9999";
    process.env.ALIBABA_API_KEY = "test-key";
    resetChatModel();
    resetCheckpointer();
  });

  it("returns the final assistant text from the graph (fake LLM)", async () => {
    const app = buildApp();
    const res = await app.request("/chat/debug?toolId=jargon&message=hi");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
