import { describe, it, expect, beforeEach } from "vitest";
import { resetChatModel } from "@/agents/base/model";
import { resetCheckpointer } from "@/agents/base/checkpointer";
import {
  streamChat,
  lastUserText,
  detectAskUserResume,
  detectSuggestAgentResume,
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

describe("detectAskUserResume", () => {
  it("returns null when last message is from user", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ];
    expect(detectAskUserResume(messages)).toBeNull();
  });

  it("returns null when no ask_user tool output is present", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "hello" }] },
    ];
    expect(detectAskUserResume(messages)).toBeNull();
  });

  it("extracts the selected answer when last assistant part is a completed ask_user", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-ask_user",
            toolCallId: "tc-1",
            state: "output-available",
            input: { question: "?", options: ["a", "b"] },
            output: { selected: "a" },
          } as any,
        ],
      },
    ];
    expect(detectAskUserResume(messages)).toBe("a");
  });

  it("returns null if the user has already replied after the ask_user", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-ask_user",
            toolCallId: "tc-1",
            state: "output-available",
            input: { question: "?", options: ["a", "b"] },
            output: { selected: "a" },
          } as any,
        ],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "新问题" }] },
    ];
    expect(detectAskUserResume(messages)).toBeNull();
  });

  it("returns null when the LLM has already consumed the ask_user result (text after)", () => {
    // After resume, the same assistant message gains a text part. A second
    // POST should NOT re-trigger resume — that's the infinite-loop bug.
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-ask_user",
            toolCallId: "tc-1",
            state: "output-available",
            input: { question: "?", options: ["a", "b"] },
            output: { selected: "a" },
          } as any,
          { type: "text", text: "好的!你选择了 a" } as any,
        ],
      },
    ];
    expect(detectAskUserResume(messages)).toBeNull();
  });

  it("returns null when the LLM has already consumed via a follow-up tool call", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-ask_user",
            toolCallId: "tc-1",
            state: "output-available",
            input: { question: "?", options: ["a", "b"] },
            output: { selected: "a" },
          } as any,
          {
            type: "tool-some_other",
            toolCallId: "tc-2",
            state: "input-available",
            input: {},
          } as any,
        ],
      },
    ];
    expect(detectAskUserResume(messages)).toBeNull();
  });

  it("still returns the answer when ask_user is followed only by step-start markers", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "step-start" } as any,
          {
            type: "tool-ask_user",
            toolCallId: "tc-1",
            state: "output-available",
            input: { question: "?", options: ["a", "b"] },
            output: { selected: "a" },
          } as any,
        ],
      },
    ];
    expect(detectAskUserResume(messages)).toBe("a");
  });

  it("ignores ask_user parts that are still input-available (interrupt not yet resolved)", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "请采访我" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-ask_user",
            toolCallId: "tc-1",
            state: "input-available",
            input: { question: "?", options: ["a", "b"] },
          } as any,
        ],
      },
    ];
    expect(detectAskUserResume(messages)).toBeNull();
  });
});

describe("detectSuggestAgentResume", () => {
  it("returns null when last message is from user", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ];
    expect(detectSuggestAgentResume(messages)).toBeNull();
  });

  it("returns true when last assistant part is a confirmed suggest_agent", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "帮我写周报" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-suggest_agent",
            toolCallId: "tc-1",
            state: "output-available",
            input: { agentId: "weekly", reason: "用户想写周报" },
            output: { confirmed: true },
          } as any,
        ],
      },
    ];
    expect(detectSuggestAgentResume(messages)).toBe(true);
  });

  it("returns false when user declined", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "帮我写周报" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-suggest_agent",
            toolCallId: "tc-1",
            state: "output-available",
            input: { agentId: "weekly", reason: "用户想写周报" },
            output: { confirmed: false },
          } as any,
        ],
      },
    ];
    expect(detectSuggestAgentResume(messages)).toBe(false);
  });

  it("returns null when the LLM has already consumed the suggest_agent result (text after)", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "帮我写周报" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-suggest_agent",
            toolCallId: "tc-1",
            state: "output-available",
            input: { agentId: "weekly", reason: "用户想写周报" },
            output: { confirmed: true },
          } as any,
          { type: "text", text: "好的，已为你切换！" } as any,
        ],
      },
    ];
    expect(detectSuggestAgentResume(messages)).toBeNull();
  });
});
