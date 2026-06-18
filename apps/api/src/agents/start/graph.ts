import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createBaseGraph } from "../base/graph";
import { BaseState } from "../base/state";
import { START_AGENT_PROMPT, buildSystemPrompt } from "../shared/prompts";
import { suggestAgentTool } from "../shared/suggest-agent-tool";
import { streamGraphToUIMessageStream } from "../shared/stream-adapter";

export function createStartGraph(model: BaseChatModel): CompiledStateGraph<any, any, any> {
  return createBaseGraph({
    agentId: "start",
    stateAnnotation: BaseState,
    systemPromptFn: () => buildSystemPrompt(START_AGENT_PROMPT),
    extraTools: [suggestAgentTool],
    model,
  }) as any;
}

export async function startStreamChat(opts: {
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
