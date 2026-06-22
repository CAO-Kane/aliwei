import { describe, it, expect } from "vitest";
import { StreamStateMachine, type StreamPhase } from "../stream-state";

function newMachine(): StreamStateMachine {
  return new StreamStateMachine();
}

describe("StreamStateMachine phase transitions", () => {
  it("starts in idle phase", () => {
    expect(newMachine().phase).toEqual({ kind: "idle" });
  });

  it("transitions idle -> llm_step on on_chat_model_start", () => {
    const m = newMachine();
    m.noteChatModelStart();
    expect(m.phase).toEqual({ kind: "llm_step" });
  });

  it("transitions llm_step -> llm_text_open after first text-start", () => {
    const m = newMachine();
    m.noteChatModelStart();
    m.noteTextStart();
    expect(m.phase).toEqual({ kind: "llm_text_open" });
  });

  it("tracks textOpen state separately from phase", () => {
    const m = newMachine();
    m.noteChatModelStart();
    m.noteTextStart();
    expect(m.isTextOpen).toBe(true);
    m.noteTextEnd();
    expect(m.isTextOpen).toBe(false);
  });

  it("tracks stepOpen state separately from phase", () => {
    const m = newMachine();
    m.noteChatModelStart();
    expect(m.isStepOpen).toBe(true);
    m.noteFinishStep();
    expect(m.isStepOpen).toBe(false);
  });

  it("skipToolEvents is true on resume mode until first chat_model_start", () => {
    const m = new StreamStateMachine({ isResume: true });
    expect(m.skipToolEvents).toBe(true);
    m.noteChatModelStart();
    expect(m.skipToolEvents).toBe(false);
  });
});

describe("StreamStateMachine tool event tracking", () => {
  it("inputSent has() returns false for unseen toolCallId", () => {
    const m = newMachine();
    expect(m.hasInputSent("tool-1")).toBe(false);
  });

  it("markInputSent() then hasInputSent() returns true", () => {
    const m = newMachine();
    m.markInputSent("tool-1");
    expect(m.hasInputSent("tool-1")).toBe(true);
  });
});

describe("StreamStateMachine prefix buffer", () => {
  it("starts empty", () => {
    expect(newMachine().prefixBuffer).toBe("");
  });

  it("appends chunks to prefixBuffer", () => {
    const m = newMachine();
    m.appendToPrefixBuffer("hel");
    m.appendToPrefixBuffer("lo");
    expect(m.prefixBuffer).toBe("hello");
  });

  it("clears prefixBuffer after consumePrefixBuffer()", () => {
    const m = newMachine();
    m.appendToPrefixBuffer("hello");
    m.consumePrefixBuffer();
    expect(m.prefixBuffer).toBe("");
  });
});
