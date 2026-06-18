import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const collectWeeklyItemsTool = tool(
  async ({ items }: { items: string[] }) => {
    return `已收集 ${items.length} 项:\n${items.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`;
  },
  {
    name: "collect_weekly_items",
    description:
      "把用户列出的本周工作条目收集起来,准备生成周报。适合:用户逐条说本周做了什么时调用。",
    schema: z.object({
      items: z.array(z.string()).min(1).describe("本周工作条目列表"),
    }),
  },
);
