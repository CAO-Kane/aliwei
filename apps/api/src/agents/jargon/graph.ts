import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createBaseGraph } from "../base/graph";
import { BaseState } from "../base/state";
import { JARGON_TOOL_PROMPT, buildSystemPrompt } from "../shared/prompts";
import { streamGraphToUIMessageStream } from "../shared/stream-adapter";

export function createJargonGraph(model: BaseChatModel): CompiledStateGraph<any, any, any> {
  return createBaseGraph({
    agentId: "jargon",
    stateAnnotation: BaseState,
    systemPromptFn: () => buildSystemPrompt(JARGON_TOOL_PROMPT),
    model,
  }) as any;
}

export async function jargonStreamChat(opts: {
  graph: CompiledStateGraph<any, any, any>;
  userMessage: HumanMessage;
  threadId: string;
  agentId: string;
  onFinish?: (text: string) => void | Promise<void>;
}): Promise<Response> {
  const input = {
    messages: [opts.userMessage],
    threadId: opts.threadId,
    agentId: opts.agentId,
  };
  return streamGraphToUIMessageStream(opts.graph, input, opts.threadId, opts.onFinish);
}
