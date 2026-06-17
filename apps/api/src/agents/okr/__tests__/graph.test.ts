import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createOkrGraph } from "../graph";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-okr.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("okr graph", () => {
  it("returns AI reply directly", async () => {
    const fake = new FakeListChatModel({
      responses: [new AIMessage("已为你生成 OKR 建议")] as any,
    });
    const graph = createOkrGraph(fake as any);

    const result = await graph.invoke(
      { messages: [new HumanMessage("拆解 Q3 营收目标")], threadId: "t-okr-1", agentId: "okr" } as any,
      { configurable: { thread_id: "t-okr-1" } },
    ) as any;

    expect(result.messages.length).toBe(2);
    expect((result.messages[1] as AIMessage).content).toBe("已为你生成 OKR 建议");
  });
});
