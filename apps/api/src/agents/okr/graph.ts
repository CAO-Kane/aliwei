import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createBaseGraph } from "../base/graph";
import { OkrState } from "../base/state";
import { OKR_SYSTEM_PROMPT, buildSystemPrompt } from "@aliwei/domain/prompts";
import { streamGraphToUIMessageStream } from "../shared/stream-adapter";
import { breakdownOkrTool, searchPastOkrsTool } from "./tools";

export function createOkrGraph(
  model: BaseChatModel,
): CompiledStateGraph<any, any, any> {
  return createBaseGraph({
    toolId: "okr",
    stateAnnotation: OkrState as any,
    systemPromptFn: () => buildSystemPrompt(OKR_SYSTEM_PROMPT),
    extraTools: [breakdownOkrTool, searchPastOkrsTool],
    model,
  }) as any;
}

export async function okrStreamChat(opts: {
  graph: CompiledStateGraph<any, any, any>;
  userMessage: HumanMessage;
  threadId: string;
  toolId: string;
}): Promise<Response> {
  return streamGraphToUIMessageStream(
    opts.graph,
    {
      messages: [opts.userMessage],
      threadId: opts.threadId,
      toolId: opts.toolId,
    },
    opts.threadId,
  );
}
