import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createWeeklyGraph } from "../graph";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-weekly.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("weekly graph", () => {
  it("returns AI reply directly", async () => {
    const fake = new FakeListChatModel({
      responses: [new AIMessage("好的,本周工作已汇总")] as any,
    });

    const graph = createWeeklyGraph(fake as any);
    const result = await graph.invoke(
      { messages: [new HumanMessage("总结一下本周工作")], threadId: "t-w1", agentId: "weekly" } as any,
      { configurable: { thread_id: "t-w1" } },
    ) as any;

    expect(result.messages.length).toBe(2);
    expect(result.messages[0]).toBeInstanceOf(HumanMessage);
    expect((result.messages[1] as AIMessage).content).toBe("好的,本周工作已汇总");
  });
});
