import { describe, it, expect } from "vitest";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";
import { shouldContinue } from "../nodes";

describe("shouldContinue", () => {
  it("returns END when last message is HumanMessage", () => {
    const state = { messages: [new HumanMessage("hi")] } as any;
    expect(shouldContinue(state)).toBe(END);
  });

  it("returns END when last message is AIMessage without tool_calls", () => {
    const state = { messages: [new AIMessage("hello")] } as any;
    expect(shouldContinue(state)).toBe(END);
  });

  it("returns 'tools' when last AIMessage has tool_calls", () => {
    const ai = new AIMessage("");
    ai.tool_calls = [{ name: "ask_user", args: {}, id: "c1" }];
    const state = { messages: [ai] } as any;
    expect(shouldContinue(state)).toBe("tools");
  });

  it("returns END when last message is ToolMessage", () => {
    const state = { messages: [new ToolMessage({ content: "ok", tool_call_id: "c1" })] } as any;
    expect(shouldContinue(state)).toBe(END);
  });

  it("handles empty messages array", () => {
    const state = { messages: [] } as any;
    expect(shouldContinue(state)).toBe(END);
  });
});
