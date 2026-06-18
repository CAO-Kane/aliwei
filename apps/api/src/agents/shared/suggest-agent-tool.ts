import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";

export const suggestAgentTool = tool(
  (input: { agentId: string; reason: string }) => {
    const confirmed = interrupt({
      agentId: input.agentId,
      reason: input.reason,
    });
    return JSON.stringify({ confirmed });
  },
  {
    name: "suggest_agent",
    description:
      "当你判断用户意图明确时，推荐切换到某个专项 agent。调用后用户会看到确认卡片；等待用户确认或拒绝后继续。",
    schema: z.object({
      agentId: z.enum(["weekly", "okr", "review", "jargon"]).describe("推荐的目标 agent"),
      reason: z.string().describe("一句话说明为什么推荐这个 agent，展示给用户"),
    }),
  },
);
