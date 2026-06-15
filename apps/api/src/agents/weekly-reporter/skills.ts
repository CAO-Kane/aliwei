import { generateText } from "ai";
import { z } from "zod";
import { llmClient, MODEL_NAME } from "@/services/llm-client";
import {
  buildToolPrompt,
  WEEKLY_EXTRACT_TASK,
  buildWeeklyTransformTask,
} from "@aliwei/domain";

export type ReportBuckets = {
  work: string[];
  plans: string[];
  difficulties: string[];
  needs: string[];
};

export type ExtractedFacts = ReportBuckets & {
  style: "short" | "detailed";
  fallbackReason?: string;
};

/**
 * 技能 1：碎片化输入提取与聚合器
 * 把用户零散叙述按 work/plans/difficulties/needs 四类结构化，并判定篇幅风格。
 */
export async function extractFacts(rawInput: string): Promise<ExtractedFacts> {
  const Schema = z.object({
    work: z.array(z.string()),
    plans: z.array(z.string()),
    difficulties: z.array(z.string()),
    needs: z.array(z.string()),
  });

  let resultText = "";

  const makeFallback = (reason: string): ExtractedFacts => {
    console.warn(`[extractFacts] fallback triggered: ${reason}`, {
      rawResponse: resultText.slice(0, 200),
    });
    return {
      work: rawInput.split("\n").map((s) => s.trim()).filter(Boolean),
      plans: [],
      difficulties: [],
      needs: [],
      style: "detailed",
      fallbackReason: reason,
    };
  };

  try {
    const result = await generateText({
      model: llmClient.chat(MODEL_NAME),
      system: `${buildToolPrompt(WEEKLY_EXTRACT_TASK)}\n\n处理步骤：先在心里逐条摘出用户描述中的所有事项，再按时间词归类到对应字段，最后数量自检确保没有遗漏。\n\n输出格式：\n{"work": ["事项1"], "plans": [], "difficulties": [], "needs": [], "style": "detailed"}\n注意：用户没提到的类别必须是空数组 []；不许漏掉"改错误/修bug"这类朴素事项；不许出现原文没有的名词；style 只能是 "short" 或 "detailed"。只返回 JSON，不要有任何其他文字。`,
      messages: [{ role: "user", content: rawInput }],
    });
    resultText = result.text;
  } catch (e) {
    return makeFallback(`llm_error: ${(e as Error).message}`);
  }

  try {
    const rawObj = JSON.parse(resultText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim());
    const parsed = Schema.safeParse(rawObj);
    const data = parsed.success ? parsed.data : null;
    if (
      data &&
      data.work.length +
        data.plans.length +
        data.difficulties.length +
        data.needs.length >
        0
    ) {
      const style = rawObj?.style === "short" ? "short" : "detailed";
      return { ...data, style };
    }
    return makeFallback(!parsed.success ? "schema_invalid" : "all_buckets_empty");
  } catch (e) {
    return makeFallback(`json_parse_error: ${(e as Error).message}`);
  }
}

/**
 * 技能 2：黑话/正常语言转换器
 * 把白话工作事实润色为阿里味黑话；可带 reviewNote 做评审循环里的二次纠偏。
 * 空数组直接返回 []（不调模型、不耗 token、也不会无中生有）。
 */
export async function aliTransform(args: {
  factsArray: string[];
  slangDict: string;
  style?: "short" | "detailed";
  reviewNote?: string;
}): Promise<string[]> {
  const { factsArray, slangDict, style = "detailed", reviewNote } = args;
  if (factsArray.length === 0) return [];

  const Schema = z.object({ transformedFacts: z.array(z.string()) });
  try {
    const result = await generateText({
      model: llmClient.chat(MODEL_NAME),
      // 降低采样随机性，缓解 run 间忽顺忽拗口、以及"产品"等对象被随机吞掉
      temperature: 0.3,
      system: buildToolPrompt(
        buildWeeklyTransformTask({ slangDict, style, reviewNote }),
      ),
      prompt: `请将以下事实列表润色为阿里味表达，只返回 JSON，不要有任何其他文字：\n${JSON.stringify(
        factsArray,
      )}\n\n输出格式：\n{"transformedFacts": ["润色后的事实1", "润色后的事实2"]}`,
    });
    const parsed = Schema.safeParse(
      JSON.parse(result.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()),
    );
    if (parsed.success && parsed.data.transformedFacts.length > 0) {
      return parsed.data.transformedFacts;
    }
    return factsArray;
  } catch {
    return factsArray;
  }
}

/**
 * 技能 3：结构化周报渲染器（纯函数，无模型调用）
 * 四类顺序固定；哪类为空就整块跳过，绝不输出套话。
 */
export function renderWeeklyReport(reportData: ReportBuckets): string {
  let output = `# 味道助手·大厂标准周报\n\n`;
  const sections = [
    { title: "本周工作", items: reportData.work },
    { title: "下周计划完成的任务", items: reportData.plans },
    { title: "遇到的困难", items: reportData.difficulties },
    { title: "需要支持的需求", items: reportData.needs },
  ];
  for (const sec of sections) {
    if (sec.items.length === 0) continue;
    output += `## ${sec.title}\n`;
    sec.items.forEach((item) => (output += `- ${item}\n`));
    output += `\n`;
  }
  return output;
}
