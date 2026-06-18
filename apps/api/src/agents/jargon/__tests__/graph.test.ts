import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createJargonGraph, jargonStreamChat } from "../graph";
import { resetCheckpointer } from "../../base/checkpointer";
import * as fs from "node:fs";

const TEST_DB = "/tmp/aliwei-test-jargon.db";

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = TEST_DB;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  resetCheckpointer();
});

describe("jargon graph", () => {
  it("returns a compiled graph", () => {
    const fake = new FakeListChatModel({ responses: ["OK, that's a banding term."] });
    const g = createJargonGraph(fake as any);
    expect(g).toBeDefined();
    expect(typeof g.invoke).toBe("function");
    expect(typeof g.stream).toBe("function");
  });

  it("end-to-end jargonStreamChat returns a Response with text/event-stream", async () => {
    const fake = new FakeListChatModel({ responses: ["OK, that's a banding term."] });
    const g = createJargonGraph(fake as any);

    const res = await jargonStreamChat({
      graph: g,
      userMessage: new HumanMessage("banding 是啥?"),
      threadId: "t-jargon-1",
      agentId: "jargon",
    });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
