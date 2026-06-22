import { describe, it, expect, beforeEach } from "vitest";
import { resetChatModel } from "@/agents/base/model";
import { resetCheckpointer } from "@/agents/base/checkpointer";
import {
  streamChat,
  lastUserText,
} from "../chat-service";
import type { UIMessage } from "ai";

describe("streamChat", () => {
  beforeEach(() => {
    // Use unique DB per test invocation to avoid concurrent write collisions
    process.env.CHECKPOINTER_DB_PATH = `/tmp/aliwei-chat-${Date.now()}.db`;
    process.env.ALIBABA_BASE_URL = "http://localhost:9999";
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.MODEL_NAME = "qwen-test";
    resetChatModel();
    resetCheckpointer();
  });

  it("routes agentId=jargon to langgraph and returns a text/event-stream Response", async () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "banding 是啥?" }] },
    ];
    const res = await streamChat({
      messages,
      agentId: "jargon",
      threadId: `test-jargon-${Date.now()}`,
      userId: "guest-test",
    });
    // Only check Response shape — don't consume body (LLM unreachable in test)
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();
  });

  it("routes agentId=weekly to langgraph and returns a Response", async () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "本周做了啥" }] },
    ];
    const res = await streamChat({
      messages,
      agentId: "weekly",
      threadId: `test-weekly-${Date.now()}`,
      userId: "guest-test",
    });
    expect(res).toBeInstanceOf(Response);
    res.body?.cancel();
  });
});

// Spec §6 invariant: graph receives a single HumanMessage with the last user turn's text only.
describe("lastUserText", () => {
  it("extracts text from the last user message only", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "第一条" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "回复" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "第二条" }] },
    ];
    expect(lastUserText(messages)).toBe("第二条");
  });

  it("returns empty string when no user message", () => {
    const messages: UIMessage[] = [
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ];
    expect(lastUserText(messages)).toBe("");
  });

  it("concatenates multiple text parts", () => {
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [
          { type: "text", text: "part1 " },
          { type: "text", text: "part2" },
        ],
      },
    ];
    expect(lastUserText(messages)).toBe("part1 part2");
  });
});

