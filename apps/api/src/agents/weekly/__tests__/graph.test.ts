import { describe, it, expect, beforeEach, vi } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createWeeklyGraph, weeklyStreamChat } from "../graph";
import { resetCheckpointer } from "../../base/checkpointer";
import * as os from "node:os";
import * as path from "node:path";

// 3 LLM nodes: collect_info / select_candidates / generate_report
// ask_style uses hardcoded interrupt — no LLM call

vi.mock("../../shared/tools", () => ({
  askUserTool: {
    name: "ask_user",
    invoke: vi.fn().mockResolvedValue(JSON.stringify({ selected: "✅ 适度黑话" })),
  },
}));

vi.mock("@aliwei/db", () => ({
  getAllJargon: vi.fn().mockReturnValue([
    { jargon: "对齐", shortDefinition: "先把话说成一个版本" },
    { jargon: "拉通", shortDefinition: "把散着的人和事串起来" },
  ]),
}));

vi.mock("../../shared/jargon-lookup-tool", () => ({
  jargonLookupTool: {
    invoke: vi.fn().mockResolvedValue(
      JSON.stringify({
        对齐: [
          {
            jargon: "对齐",
            definition: "统一认知与行动方向",
            useExample: "我们先对齐一下需求",
            badExample: "把对齐当成开会的借口",
          },
        ],
      }),
    ),
  },
}));

beforeEach(() => {
  process.env.CHECKPOINTER_DB_PATH = path.join(os.tmpdir(), `aliwei-test-weekly-${crypto.randomUUID()}.db`);
  resetCheckpointer();
});

describe("weekly graph", () => {
  it("returns a compiled graph", () => {
    const fake = new FakeListChatModel({ responses: ["草稿", "对齐", "最终周报"] });
    const g = createWeeklyGraph(fake as any);
    expect(g).toBeDefined();
    expect(typeof g.invoke).toBe("function");
  });

  it("runs full pipeline and populates state fields", async () => {
    const fake = new FakeListChatModel({
      responses: [
        new AIMessage("本周工作：完成项目A需求评审") as any,
        new AIMessage("对齐") as any,
        new AIMessage("## 本周工作\n完成项目A需求评审，通过对齐机制推进了进展。") as any,
      ],
    });

    const graph = createWeeklyGraph(fake as any);
    const result = (await graph.invoke(
      {
        messages: [new HumanMessage("本周完成了项目A的需求评审")],
        threadId: "t-w1",
        agentId: "weekly",
      } as any,
      { configurable: { thread_id: "t-w1" } },
    )) as any;

    expect(result.organizedContent).toBe("本周工作：完成项目A需求评审");
    expect(result.stylePreference).toBe("✅ 适度黑话");
    expect(result.candidateTerms).toBe("对齐");
    expect(result.verifiedEntries).toContain("对齐");
    const lastMsg = result.messages[result.messages.length - 1] as AIMessage;
    expect(lastMsg.content).toContain("本周工作");
  });

  it("skips verify_slang when select_candidates returns empty", async () => {
    const fake = new FakeListChatModel({
      responses: [
        new AIMessage("本周工作：完成项目A需求评审") as any,
        new AIMessage("") as any,
        new AIMessage("## 本周工作\n完成项目A的需求评审。") as any,
      ],
    });

    const graph = createWeeklyGraph(fake as any);
    const result = (await graph.invoke(
      {
        messages: [new HumanMessage("本周完成了项目A的需求评审")],
        threadId: "t-w2",
        agentId: "weekly",
      } as any,
      { configurable: { thread_id: "t-w2" } },
    )) as any;

    expect(result.verifiedEntries).toBe("");
  });

  it("strips code fences and prefixes from select_candidates output", async () => {
    const fake = new FakeListChatModel({
      responses: [
        new AIMessage("本周工作：完成项目A需求评审") as any,
        new AIMessage("```\n对齐、拉通\n```") as any,
        new AIMessage("## 本周工作\n完成对齐。") as any,
      ],
    });

    const graph = createWeeklyGraph(fake as any);
    const result = (await graph.invoke(
      {
        messages: [new HumanMessage("本周完成了项目A的需求评审")],
        threadId: "t-fence",
        agentId: "weekly",
      } as any,
      { configurable: { thread_id: "t-fence" } },
    )) as any;

    expect(result.verifiedEntries).toContain("对齐");
    expect(result.verifiedEntries).not.toContain("```");
  });

  it("weeklyStreamChat returns a Response with text/event-stream", async () => {
    const fake = new FakeListChatModel({
      responses: [
        new AIMessage("本周工作：完成项目A需求评审") as any,
        new AIMessage("对齐") as any,
        new AIMessage("## 本周工作\n完成了对齐。") as any,
      ],
    });
    const g = createWeeklyGraph(fake as any);

    const res = await weeklyStreamChat({
      graph: g,
      userMessage: new HumanMessage("总结本周工作"),
      threadId: "t-w3",
      agentId: "weekly",
    });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
