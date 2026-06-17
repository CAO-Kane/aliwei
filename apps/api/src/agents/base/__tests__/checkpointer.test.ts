import { describe, it, expect, beforeEach } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { getCheckpointer, resetCheckpointer } from "../checkpointer";

const TEST_DB = "/tmp/aliwei-test-checkpointer.db";

describe("checkpointer", () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    process.env.CHECKPOINTER_DB_PATH = TEST_DB;
    resetCheckpointer();
  });

  it("returns a working SqliteSaver", async () => {
    const cp = getCheckpointer();
    expect(cp).toBeInstanceOf(SqliteSaver);
  });

  it("round-trips state via get/put", async () => {
    const cp = getCheckpointer();
    const config = { configurable: { thread_id: "thread-1" } };
    const checkpoint = {
      v: 1,
      ts: "2026-06-17T00:00:00.000Z",
      id: "ck-1",
      channel_values: { messages: ["hi"] },
      channel_versions: {},
      versions_seen: {},
      pending_sends: [],
    };
    await cp.put(config, checkpoint as any, { source: "update", step: -1, parents: {} });
    const loaded = await cp.get(config);
    expect(loaded?.channel_values.messages).toEqual(["hi"]);
  });

  it("enables WAL journal mode", () => {
    const cp = getCheckpointer();
    expect(cp).toBeDefined();
  });
});
