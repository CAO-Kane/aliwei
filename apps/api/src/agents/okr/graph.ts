import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createBaseGraph } from "../base/graph";
import { OkrState } from "../base/state";
import { OKR_TOOL_PROMPT, buildSystemPrompt } from "../shared/prompts";
import { streamGraphToUIMessageStream } from "../shared/stream-adapter";

export function createOkrGraph(model: BaseChatModel): CompiledStateGraph<any, any, any> {
  return createBaseGraph({
    agentId: "okr",
    stateAnnotation: OkrState as any,
    systemPromptFn: () => buildSystemPrompt(OKR_TOOL_PROMPT),
    model,
  }) as any;
}

export async function okrStreamChat(opts: {
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
