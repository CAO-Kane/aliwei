import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createReviewGraph } from "../graph";
import { searchPastReviewsTool } from "../tools";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-review.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("review graph", () => {
  it("runs search_past_reviews then final reply", async () => {
    const ai1 = new AIMessage("");
    ai1.tool_calls = [
      { name: "search_past_reviews", args: { keyword: "Q2" }, id: "rev-1", type: "tool_call" },
    ];
    const fake = new FakeListChatModel({
      responses: [ai1, new AIMessage("已参考 Q2 复盘")] as any,
    });
    const graph = createReviewGraph(fake as any);

    const result = await graph.invoke(
      { messages: [new HumanMessage("复盘 Q3")], threadId: "t-rev-1", toolId: "review" } as any,
      { configurable: { thread_id: "t-rev-1" } },
    ) as any;

    expect(result.messages.length).toBe(4);
    expect((result.messages[1] as AIMessage).tool_calls).toHaveLength(1);
  });

  it("searchPastReviewsTool returns array", async () => {
    const result = await searchPastReviewsTool.invoke({ keyword: "Q2" });
    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
