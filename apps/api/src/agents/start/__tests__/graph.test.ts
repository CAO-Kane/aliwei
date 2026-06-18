import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createStartGraph } from "../graph";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-start.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("start graph", () => {
  it("returns a text reply when the model does not call suggest_agent", async () => {
    const fake = new FakeListChatModel({
      responses: [new AIMessage("你好！我是阿里职场 AI 助手，请问有什么可以帮你？")] as any,
    });
    const graph = createStartGraph(fake as any);

    const result = (await graph.invoke(
      { messages: [new HumanMessage("你好")], threadId: "t-start-1", agentId: "start" } as any,
      { configurable: { thread_id: "t-start-1" } },
    )) as any;

    expect(result.messages.length).toBe(2);
    expect((result.messages[1] as AIMessage).content).toContain("你好");
  });
});
