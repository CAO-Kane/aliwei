import { describe, it, expect, vi } from "vitest";
import { decideResume } from "../resume-policy";

function makeGraph(getStateResult: any) {
  return { getState: vi.fn().mockResolvedValue(getStateResult) } as any;
}

const SAMPLE_THREAD = "thread-1";

describe("decideResume", () => {
  it("returns new_conversation when getState returns null", async () => {
    const graph = makeGraph(null);
    const d = await decideResume(graph, SAMPLE_THREAD, "jargon");
    expect(d.kind).toBe("new_conversation");
  });

  it("returns new_conversation when no pending interrupts", async () => {
    const graph = makeGraph({
      values: { messages: [] },
      tasks: [],
    });
    const d = await decideResume(graph, SAMPLE_THREAD, "jargon");
    expect(d.kind).toBe("new_conversation");
  });

  it("returns resume for ask_user interrupt with unconsumed tool output", async () => {
    const graph = makeGraph({
      values: {
        messages: [
          { _getType: () => "human", content: "banding 是啥?" },
          { _getType: () => "ai", content: "", tool_calls: [{ name: "ask_user", args: { question: "详细还是简略?", options: ["详细", "简略"] }, id: "call-1" }] },
          { _getType: () => "tool", name: "ask_user", content: '{"selected":"详细"}' },
        ],
      },
      tasks: [{ interrupts: [{ value: { question: "详细还是简略?", options: ["详细", "简略"] } }] }],
    });
    const d = await decideResume(graph, SAMPLE_THREAD, "jargon");
    expect(d.kind).toBe("resume");
    if (d.kind === "resume") {
      // skipPrefix is the last AIMessage's content — empty string in this scenario
      // (the AIMessage that called ask_user has content="" because its only output
      // was the tool_call). When the graph resumes, Qwen echoes this content as
      // the first text-delta, and the stream adapter strips it.
      expect(d.skipPrefix).toBe("");
    }
  });

  it("skipPrefix captures the last AIMessage's text content for multi-text echoes", async () => {
    // Realistic scenario: AIMessage has text content that the LLM emitted
    // before deciding to call ask_user. On resume, the LLM echoes that text
    // (which may or may not be empty depending on the model's behavior).
    // The new extractLastAssistantText must return the full content of the
    // last AIMessage in langgraph state — which is what Qwen will echo.
    const lastAiText = "好的,让我确认一下:";
    const graph = makeGraph({
      values: {
        messages: [
          { _getType: () => "human", content: "帮我翻译 banding" },
          { _getType: () => "ai", content: lastAiText, tool_calls: [{ name: "ask_user", args: { question: "详细还是简略?", options: ["详细", "简略"] }, id: "call-1" }] },
          { _getType: () => "tool", name: "ask_user", content: '{"selected":"详细"}' },
        ],
      },
      tasks: [{ interrupts: [{ value: { question: "详细还是简略?", options: ["详细", "简略"] } }] }],
    });
    const d = await decideResume(graph, SAMPLE_THREAD, "jargon");
    expect(d.kind).toBe("resume");
    if (d.kind === "resume") {
      // Pin the exact skipPrefix value to lock the equivalence with the prior
      // UIMessage-from-step-start extraction. The last AIMessage has the
      // pre-tool-call text. When Qwen resumes, it may re-emit this text;
      // stream-adapter strips it via this skipPrefix.
      expect(d.skipPrefix).toBe(lastAiText);
    }
  });

  it("returns resume for suggest_agent interrupt with confirmed=true", async () => {
    const graph = makeGraph({
      values: {
        messages: [
          { _getType: () => "ai", content: "", tool_calls: [{ name: "suggest_agent", args: { agentId: "weekly", reason: "周报" }, id: "call-2" }] },
          { _getType: () => "tool", name: "suggest_agent", content: '{"confirmed":true}' },
        ],
      },
      tasks: [{ interrupts: [{ value: { agentId: "weekly", reason: "周报" } }] }],
    });
    const d = await decideResume(graph, SAMPLE_THREAD, "start");
    expect(d.kind).toBe("resume");
  });

  it("returns new_conversation when tool output has been consumed by later text part", async () => {
    // The "consumed" detection walks messages parts; in our simplified mock,
    // the tool output is followed by an ai text message, meaning LLM responded.
    const graph = makeGraph({
      values: {
        messages: [
          { _getType: () => "ai", content: "", tool_calls: [{ name: "ask_user", args: { question: "?", options: ["a", "b"] }, id: "call-1" }] },
          { _getType: () => "tool", name: "ask_user", content: '{"selected":"a"}' },
          { _getType: () => "ai", content: "好的,我用 a" },
        ],
      },
      tasks: [], // After resume, no pending interrupts
    });
    const d = await decideResume(graph, SAMPLE_THREAD, "jargon");
    expect(d.kind).toBe("new_conversation");
  });
});