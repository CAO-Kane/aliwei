import { SystemMessage, isAIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { END } from "@langchain/langgraph";
import type { BaseState } from "./state";

export type BaseStateShape = typeof BaseState.State;

export function makeCallModelNode(
  systemPromptFn: (state: BaseStateShape) => string,
  model: BaseChatModel,
) {
  return async (
    state: BaseStateShape,
  ): Promise<Partial<BaseStateShape>> => {
    const system = systemPromptFn(state);
    const messages: BaseMessage[] = [new SystemMessage(system), ...state.messages];
    const ai: BaseMessage = await model.invoke(messages);
    return { messages: [ai] };
  };
}

export function shouldContinue(
  state: BaseStateShape,
): "tools" | typeof END {
  const last = state.messages.at(-1);
  if (!last || !isAIMessage(last)) return END;
  return last.tool_calls && last.tool_calls.length > 0 ? "tools" : END;
}
