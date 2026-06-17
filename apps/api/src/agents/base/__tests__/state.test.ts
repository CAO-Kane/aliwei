import { describe, it, expect } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { BaseState, OkrState, ReviewState } from "../state";

describe("BaseState", () => {
  it("reduces messages by appending", () => {
    // In langgraph 1.x the reducer is stored as .operator (not .reducer):
    const reducer = (BaseState.spec.messages as any).operator;
    const a = reducer([], [new HumanMessage("hi")]);
    const b = reducer(a, [new AIMessage("hello")]);
    expect(b).toHaveLength(2);
    expect(b[0]).toBeInstanceOf(HumanMessage);
    expect(b[1]).toBeInstanceOf(AIMessage);
  });
});

describe("OkrState", () => {
  it("extends BaseState with okrDraft", () => {
    expect((OkrState.spec as any).okrDraft).toBeDefined();
  });
});

describe("ReviewState", () => {
  it("extends BaseState with references", () => {
    expect((ReviewState.spec as any).references).toBeDefined();
  });
});
