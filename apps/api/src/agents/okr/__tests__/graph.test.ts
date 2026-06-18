import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createOkrGraph } from "../graph";
import { breakdownOkrTool, searchPastOkrsTool } from "../tools";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-okr.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("okr graph", () => {
  it("runs breakdown_okr then final reply", async () => {
    const ai1 = new AIMessage("");
    ai1.tool_calls = [
      {
        name: "breakdown_okr",
        args: { goal: "Q3 营收+30%" },
        id: "okr-1",
        type: "tool_call",
      },
    ];
    const fake = new FakeListChatModel({
      responses: [ai1, new AIMessage("已拆解完毕")] as any,
    });
    const graph = createOkrGraph(fake as any);

    const result = await graph.invoke(
      { messages: [new HumanMessage("拆解 Q3 营收目标")], threadId: "t-okr-1", toolId: "okr" } as any,
      { configurable: { thread_id: "t-okr-1" } },
    ) as any;

    expect(result.messages.length).toBe(4);
    expect((result.messages[1] as AIMessage).tool_calls).toHaveLength(1);
  });

  it("breakdownOkrTool returns structured O/KR", async () => {
    const result = await breakdownOkrTool.invoke({ goal: "Q3 营收+30%" });
    const parsed = JSON.parse(result as string);
    expect(parsed.goal).toBe("Q3 营收+30%");
    expect(Array.isArray(parsed.objectives)).toBe(true);
    expect(parsed.objectives.length).toBeGreaterThan(0);
  });

  it("searchPastOkrsTool returns array of past OKRs", async () => {
    const result = await searchPastOkrsTool.invoke({ keyword: "营收" });
    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
