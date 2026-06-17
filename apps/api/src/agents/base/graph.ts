import { StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { BaseState } from "./state";
import { shouldContinue, makeCallModelNode } from "./nodes";
import { getCheckpointer } from "./checkpointer";
import { askUserTool } from "../shared/tools";

export type CreateBaseGraphOpts<A extends typeof BaseState> = {
  agentId: string;        // renamed from toolId
  stateAnnotation: A;
  systemPromptFn: (state: A["State"]) => string;
  extraTools?: StructuredToolInterface[];
  model: BaseChatModel;
};

export function createBaseGraph<A extends typeof BaseState>(
  opts: CreateBaseGraphOpts<A>,
) {
  const allTools: StructuredToolInterface[] = [askUserTool, ...(opts.extraTools ?? [])];
  const toolNode = new ToolNode(allTools as any);

  if (typeof opts.model.bindTools !== "function") {
    throw new Error("createBaseGraph requires a model that supports bindTools()");
  }
  const modelWithTools = opts.model.bindTools(allTools as any) as unknown as BaseChatModel;
  const callModel = makeCallModelNode(opts.systemPromptFn as any, modelWithTools);

  const graph = new StateGraph(opts.stateAnnotation)
    .addNode("call_model", callModel as any)
    .addNode("run_tool", (state: any) => toolNode.invoke(state))
    .addEdge(START, "call_model")
    .addConditionalEdges("call_model", shouldContinue as any, {
      tools: "run_tool",
      [END]: END,
    })
    .addEdge("run_tool", "call_model")
    .compile({ checkpointer: getCheckpointer() });

  return graph;
}
