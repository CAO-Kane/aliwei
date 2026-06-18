import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const breakdownOkrTool = tool(
  async ({ goal }: { goal: string }) => {
    return JSON.stringify({
      goal,
      objectives: [
        {
          title: `推进 ${goal} 的核心策略`,
          keyResults: [
            "KR1: 定义清晰的指标基线和目标值",
            "KR2: 拆解到可执行的周计划",
            "KR3: 设定关键里程碑和评审点",
          ],
        },
        {
          title: "补齐能力短板",
          keyResults: [
            "KR1: 列出 3 个需要补齐的能力",
            "KR2: 每周 1 次专项提升",
          ],
        },
      ],
    });
  },
  {
    name: "breakdown_okr",
    description: "把一个高层目标拆成 2-3 个 Objective + 每个 2-3 个 KR 的结构。",
    schema: z.object({
      goal: z.string().describe("要拆解的高层目标"),
    }),
  },
);

export const searchPastOkrsTool = tool(
  async ({ keyword: _keyword }: { keyword: string }) => {
    return JSON.stringify([]);
  },
  {
    name: "search_past_okrs",
    description: "按关键词搜索历史 OKR,避免重复。",
    schema: z.object({
      keyword: z.string().describe("搜索关键词"),
    }),
  },
);
