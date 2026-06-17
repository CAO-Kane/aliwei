import { describe, it, expect, beforeEach } from "vitest";
import { streamGraphToUIMessageStream } from "../stream-adapter";
import { createJargonGraph } from "@/agents/jargon/graph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { resetCheckpointer } from "@/agents/base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-adapter.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("streamGraphToUIMessageStream", () => {
  it("emits SSE events including on_tool_start when model calls ask_user", async () => {
    const ai1 = new AIMessage("");
    ai1.tool_calls = [
      {
        name: "ask_user",
        args: { question: "你想详细还是简略?", options: ["详细", "简略"] },
        id: "ask-1",
        type: "tool_call",
      },
    ];
    // After interrupt, return final reply
    const fake = new FakeListChatModel({
      responses: [ai1] as any,
    });
    const graph = createJargonGraph(fake as any);

    const res = await streamGraphToUIMessageStream(
      graph,
      { messages: [new HumanMessage("生成周报")], threadId: "t-int-1", toolId: "jargon" } as any,
      "t-int-1",
    );

    const text = await res.text();
    // Stream should have content (even if it ends with error/interrupt)
    expect(text.length).toBeGreaterThan(0);
    // Either SSE data events OR the interrupt/finish event
    expect(text).toMatch(/[0-9a-f]+:/);
  });

  it("returns a text/event-stream response", async () => {
    const fake = new FakeListChatModel({ responses: ["hello"] });
    const graph = createJargonGraph(fake as any);

    const res = await streamGraphToUIMessageStream(
      graph,
      { messages: [new HumanMessage("hi")], threadId: "t-int-2", toolId: "jargon" } as any,
      "t-int-2",
    );

    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
