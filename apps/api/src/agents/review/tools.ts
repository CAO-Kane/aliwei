import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const searchPastReviewsTool = tool(
  async ({ keyword: _keyword }: { keyword: string }) => {
    return JSON.stringify([]);
  },
  {
    name: "search_past_reviews",
    description: "按关键词搜索历史复盘,辅助当前复盘参考过往经验。",
    schema: z.object({
      keyword: z.string().describe("搜索关键词"),
    }),
  },
);
