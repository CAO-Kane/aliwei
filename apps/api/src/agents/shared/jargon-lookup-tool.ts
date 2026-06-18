import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getJargonColumns, lookupJargonByTerms } from "@aliwei/db";

const AVAILABLE_FIELDS = getJargonColumns();

const fieldsEnum = z.enum(AVAILABLE_FIELDS as [string, ...string[]]);

export const jargonLookupTool = tool(
  (input: { terms: string[]; fields?: string[] }) => {
    const result = lookupJargonByTerms(input.terms, input.fields);
    return JSON.stringify(result);
  },
  {
    name: "lookup_jargon",
    description: "在阿里黑话词库中查询一个或多个词条（模糊匹配），按查询词分组返回结果。",
    schema: z.object({
      terms: z
        .array(z.string())
        .min(1)
        .describe("要查询的黑话词列表，支持模糊匹配，可一次查询多个词"),
      fields: z.array(fieldsEnum).optional().describe("指定返回哪些字段；省略则返回全部字段"),
    }),
  },
);
