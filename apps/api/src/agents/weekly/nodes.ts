import { SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getAllJargon } from "@aliwei/db";
import { askUserTool } from "../shared/tools";
import { jargonLookupTool } from "../shared/jargon-lookup-tool";
import type { WeeklyStateShape } from "./state";
import { COLLECT_INFO_PROMPT, SELECT_CANDIDATES_PROMPT, GENERATE_REPORT_PROMPT } from "./prompts";

export function makeCollectInfoNode(model: BaseChatModel) {
  return async (state: WeeklyStateShape): Promise<Partial<WeeklyStateShape>> => {
    const response = await model.invoke([
      new SystemMessage(COLLECT_INFO_PROMPT),
      ...state.messages,
    ]);
    return { organizedContent: response.content as string };
  };
}

export function makeAskStyleNode() {
  return async (_state: WeeklyStateShape): Promise<Partial<WeeklyStateShape>> => {
    const toolArgs: { question: string; options: string[] } = {
      question: "你希望周报使用哪种风格？",
      options: ["🔥 高度黑话", "✅ 适度黑话", "🌿 去黑话"],
    };

    const result = await askUserTool.invoke(toolArgs);
    const { selected } = JSON.parse(result as string);

    return { stylePreference: selected };
  };
}

export function makeFetchSlangListNode() {
  return async (_state: WeeklyStateShape): Promise<Partial<WeeklyStateShape>> => {
    const slangSummary = getAllJargon()
      .map((e) => `${e.jargon}：${e.shortDefinition}`)
      .join("\n");
    return { slangSummary };
  };
}

export function makeSelectCandidatesNode(model: BaseChatModel) {
  return async (state: WeeklyStateShape): Promise<Partial<WeeklyStateShape>> => {
    const prompt = SELECT_CANDIDATES_PROMPT
      .replace("{{organizedContent}}", state.organizedContent)
      .replace("{{slangSummary}}", state.slangSummary);
    const response = await model.invoke([new SystemMessage(prompt)]);
    return { candidateTerms: response.content as string };
  };
}

export function makeVerifySlangNode() {
  return async (state: WeeklyStateShape): Promise<Partial<WeeklyStateShape>> => {
    // Qwen frequently wraps term lists in code fences or prefixes them with
    // "以下是词：" despite "只输出词名、不要解释" instructions. Strip both
    // before splitting so a single fenced block doesn't get looked up as one
    // opaque non-term.
    const cleaned = state.candidateTerms
      .replace(/```[a-z]*\n?|```/g, "")
      .replace(/^(以下是)?(候选)?(词|词表)[:：]\s*/m, "");
    const terms = cleaned
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (terms.length === 0) return { verifiedEntries: "" };
    const result = await jargonLookupTool.invoke({ terms });
    return { verifiedEntries: result as string };
  };
}

export function makeGenerateReportNode(model: BaseChatModel) {
  return async (state: WeeklyStateShape): Promise<Partial<WeeklyStateShape>> => {
    const prompt = GENERATE_REPORT_PROMPT
      .replace("{{organizedContent}}", state.organizedContent)
      .replace("{{verifiedEntries}}", state.verifiedEntries)
      .replace("{{stylePreference}}", state.stylePreference);
    const response = await model.invoke([new SystemMessage(prompt)]);
    return { messages: [response] };
  };
}
