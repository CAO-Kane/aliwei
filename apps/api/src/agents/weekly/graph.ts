import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createBaseGraph } from "../base/graph";
import { BaseState } from "../base/state";
import { WEEKLY_TOOL_PROMPT, buildSystemPrompt } from "../shared/prompts";
import { streamGraphToUIMessageStream } from "../shared/stream-adapter";

export function createWeeklyGraph(
  model: BaseChatModel,
): CompiledStateGraph<any, any, any> {
  return createBaseGraph({
    toolId: "weekly",
    stateAnnotation: BaseState,
    systemPromptFn: () => buildSystemPrompt(WEEKLY_TOOL_PROMPT),
    model,
  }) as any;
}

export async function weeklyStreamChat(opts: {
  graph: CompiledStateGraph<any, any, any>;
  userMessage: HumanMessage;
  threadId: string;
  toolId: string;
  onFinish?: (text: string) => void | Promise<void>;
}): Promise<Response> {
  return streamGraphToUIMessageStream(
    opts.graph,
    {
      messages: [opts.userMessage],
      threadId: opts.threadId,
      toolId: opts.toolId,
    },
    opts.threadId,
    opts.onFinish,
  );
}
