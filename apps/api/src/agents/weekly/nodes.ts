import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
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
    const toolCallId = crypto.randomUUID();
    const toolArgs: { question: string; options: string[] } = {
      question: "你希望周报使用哪种风格？",
      options: ["🔥 高度黑话", "✅ 适度黑话", "🌿 去黑话"],
    };

    const aiMsg = new AIMessage({
      content: "",
      tool_calls: [{ id: toolCallId, name: "ask_user", args: toolArgs, type: "tool_call" }],
    });

    const result = await askUserTool.invoke(toolArgs);
    const { selected } = JSON.parse(result as string);

    return {
      messages: [
        aiMsg,
        new ToolMessage({ content: result as string, tool_call_id: toolCallId, name: "ask_user" }),
      ],
      stylePreference: selected,
    };
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
    const terms = state.candidateTerms
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
