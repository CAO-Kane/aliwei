import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type CompiledStateGraph, END, START, StateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { getCheckpointer } from "../base/checkpointer";
import { streamGraphToUIMessageStream } from "../shared/stream-adapter";
import { WeeklyState } from "./state";
import {
  makeCollectInfoNode,
  makeAskStyleNode,
  makeFetchSlangListNode,
  makeSelectCandidatesNode,
  makeVerifySlangNode,
  makeGenerateReportNode,
} from "./nodes";

export function createWeeklyGraph(model: BaseChatModel): CompiledStateGraph<any, any, any> {
  return new StateGraph(WeeklyState)
    .addNode("collect_info", makeCollectInfoNode(model))
    .addNode("ask_style", makeAskStyleNode())
    .addNode("fetch_slang_list", makeFetchSlangListNode())
    .addNode("select_candidates", makeSelectCandidatesNode(model))
    .addNode("verify_slang", makeVerifySlangNode())
    .addNode("generate_report", makeGenerateReportNode(model))
    .addEdge(START, "collect_info")
    .addEdge("collect_info", "ask_style")
    .addEdge("ask_style", "fetch_slang_list")
    .addEdge("fetch_slang_list", "select_candidates")
    .addEdge("select_candidates", "verify_slang")
    .addEdge("verify_slang", "generate_report")
    .addEdge("generate_report", END)
    .compile({ checkpointer: getCheckpointer() }) as any;
}

export async function weeklyStreamChat(opts: {
  graph: CompiledStateGraph<any, any, any>;
  userMessage: HumanMessage;
  threadId: string;
  agentId: string;
  onFinish?: (text: string) => void | Promise<void>;
}): Promise<Response> {
  return streamGraphToUIMessageStream(
    opts.graph,
    {
      messages: [opts.userMessage],
      threadId: opts.threadId,
      agentId: opts.agentId,
    },
    opts.threadId,
    opts.onFinish,
  );
}
