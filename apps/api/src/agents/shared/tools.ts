import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";

export const askUserTool = tool(
  (input: { question: string; options: string[] }) => {
    const answer = interrupt({
      question: input.question,
      options: input.options,
    });
    return JSON.stringify({ selected: answer });
  },
  {
    name: "ask_user",
    description:
      "向用户提一个 2-4 个选项的单选问题,把决定权交还给用户。适合:确认偏好、分支选择、消除歧义。不要用于开放式提问(直接用普通对话)。",
    schema: z.object({
      question: z.string().describe("要问用户的问题"),
      options: z.array(z.string()).min(2).max(4).describe("2-4 个候选选项"),
    }),
  },
);
