import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createWeeklyGraph } from "../graph";
import { collectWeeklyItemsTool } from "../tools";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-weekly.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("weekly graph with collect_weekly_items tool", () => {
  it("runs tool → result → final AI message", async () => {
    const ai1 = new AIMessage("");
    ai1.tool_calls = [
      {
        name: "collect_weekly_items",
        args: { items: ["需求评审", "接口开发", "联调"] },
        id: "call-1",
        type: "tool_call",
      },
    ];

    const fake = new FakeListChatModel({
      responses: [ai1, new AIMessage("好的,本周工作已汇总")] as any,
    });

    const graph = createWeeklyGraph(fake as any);
    const result = await graph.invoke(
      { messages: [new HumanMessage("总结一下本周工作")], threadId: "t-w1", toolId: "weekly" } as any,
      { configurable: { thread_id: "t-w1" } },
    ) as any;

    expect(result.messages.length).toBe(4);
    expect(result.messages[0]).toBeInstanceOf(HumanMessage);
    expect((result.messages[1] as AIMessage).tool_calls).toHaveLength(1);
    expect(result.messages[2]).toBeInstanceOf(ToolMessage);
    expect((result.messages[3] as AIMessage).content).toBe("好的,本周工作已汇总");
  });

  it("collectWeeklyItemsTool returns joined items", async () => {
    const result = await collectWeeklyItemsTool.invoke({
      items: ["a", "b", "c"],
    });
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
  });
});
