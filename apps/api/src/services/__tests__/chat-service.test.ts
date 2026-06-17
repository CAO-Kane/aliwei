import { describe, it, expect, beforeEach } from "vitest";
import { resetChatModel } from "@/agents/base/model";
import { resetCheckpointer } from "@/agents/base/checkpointer";
import { streamChat } from "../chat-service";
import type { UIMessage } from "ai";

describe("streamChat with USE_LANGGRAPH", () => {
  beforeEach(() => {
    // Use unique DB per test invocation to avoid concurrent write collisions
    process.env.CHECKPOINTER_DB_PATH = `/tmp/aliwei-chat-${Date.now()}.db`;
    process.env.ALIBABA_BASE_URL = "http://localhost:9999";
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.MODEL_NAME = "qwen-test";
    process.env.USE_LANGGRAPH = "true";
    resetChatModel();
    resetCheckpointer();
  });

  it("routes toolId=jargon to langgraph and returns a text/event-stream Response", async () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "banding 是啥?" }] },
    ];
    const res = await streamChat({
      messages,
      toolId: "jargon",
      threadId: `test-jargon-${Date.now()}`,
      userId: "guest-test",
    });
    // Only check Response shape — don't consume body (LLM unreachable in test)
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();
  });

  it("routes toolId=weekly to langgraph and returns a Response", async () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "本周做了啥" }] },
    ];
    const res = await streamChat({
      messages,
      toolId: "weekly",
      threadId: `test-weekly-${Date.now()}`,
      userId: "guest-test",
    });
    expect(res).toBeInstanceOf(Response);
    res.body?.cancel();
  });
});
