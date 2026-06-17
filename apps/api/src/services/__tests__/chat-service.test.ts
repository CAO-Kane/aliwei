import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import { resetChatModel } from "@/agents/base/model";
import { resetCheckpointer } from "@/agents/base/checkpointer";
import { streamChat } from "../chat-service";
import type { UIMessage } from "ai";

const TEST_DB = "/tmp/aliwei-test-chat.db";

describe("streamChat with USE_LANGGRAPH", () => {
  beforeEach(() => {
    process.env.CHECKPOINTER_DB_PATH = TEST_DB;
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    process.env.ALIBABA_BASE_URL = "http://localhost:9999";
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.MODEL_NAME = "qwen-test";
    process.env.USE_LANGGRAPH = "true";
    resetChatModel();
    resetCheckpointer();
  });

  it("routes toolId=jargon through the langgraph path", async () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "banding 是啥?" }] },
    ];
    const res = await streamChat({
      messages,
      toolId: "jargon",
      threadId: "test-jargon-1",
      userId: "guest-test",
    });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("routes toolId=weekly to legacy streamText when USE_LANGGRAPH=true but weekly not migrated", async () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "本周做了啥" }] },
    ];
    const res = await streamChat({
      messages,
      toolId: "weekly",
      threadId: "test-weekly-1",
      userId: "guest-test",
    });
    expect(res).toBeInstanceOf(Response);
  });
});
