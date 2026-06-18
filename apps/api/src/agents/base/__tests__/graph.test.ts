import { describe, it, expect, beforeEach, vi } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { BaseState } from "../state";
import { createBaseGraph } from "../graph";
import { resetCheckpointer } from "../checkpointer";
import { askUserTool } from "../../shared/tools";
import { jargonLookupTool } from "../../shared/jargon-lookup-tool";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-graph.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("createBaseGraph", () => {
  it("runs a no-tool round trip: HumanMessage → AIMessage", async () => {
    const fake = new FakeListChatModel({ responses: ["hello back"] });
    const graph = createBaseGraph({
      agentId: "jargon",
      stateAnnotation: BaseState,
      systemPromptFn: () => "you are a test",
      model: fake as any,
    });

    const result = await graph.invoke(
      { messages: [new HumanMessage("hi")], threadId: "t-1", agentId: "jargon" } as any,
      { configurable: { thread_id: "t-1" } },
    );

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBeInstanceOf(HumanMessage);
    expect(result.messages[1]).toBeInstanceOf(AIMessage);
    expect((result.messages[1] as AIMessage).content).toBe("hello back");
  });

  it("checkpointer restores state.messages on second invocation with same thread_id", async () => {
    const fake = new FakeListChatModel({ responses: ["first reply", "second reply"] });
    const graph = createBaseGraph({
      agentId: "jargon",
      stateAnnotation: BaseState,
      systemPromptFn: () => "you are a test",
      model: fake as any,
    });

    await graph.invoke(
      { messages: [new HumanMessage("hi")], threadId: "t-2", agentId: "jargon" } as any,
      { configurable: { thread_id: "t-2" } },
    );

    const second = await graph.invoke(
      { messages: [new HumanMessage("again")], threadId: "t-2", agentId: "jargon" } as any,
      { configurable: { thread_id: "t-2" } },
    );

    expect(second.messages.length).toBeGreaterThanOrEqual(4);
  });

  it("binds tools to the model so the LLM emits structured tool_calls (not JSON-in-content)", () => {
    const fake = new FakeListChatModel({ responses: ["irrelevant"] });
    const bindSpy = vi.spyOn(fake, "bindTools");

    const extraTool = {
      name: "extra_tool",
      description: "x",
      schema: { type: "object" } as any,
      invoke: async () => "",
    } as any;

    createBaseGraph({
      agentId: "okr",
      stateAnnotation: BaseState,
      systemPromptFn: () => "you are a test",
      model: fake as any,
      extraTools: [extraTool],
    });

    expect(bindSpy).toHaveBeenCalledTimes(1);
    const boundTools = bindSpy.mock.calls[0][0] as any[];
    const names = boundTools.map((t) => t.name);
    expect(names).toContain(askUserTool.name);
    expect(names).toContain(jargonLookupTool.name);
    expect(names).toContain("extra_tool");
  });
});
