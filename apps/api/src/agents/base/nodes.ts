import { SystemMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { END } from "@langchain/langgraph";
import type { BaseState } from "./state";

export type BaseStateShape = typeof BaseState.State;

export function makeCallModelNode(
  systemPromptFn: (state: BaseStateShape) => string,
  model: BaseChatModel,
) {
  return async (state: BaseStateShape): Promise<Partial<BaseStateShape>> => {
    const system = systemPromptFn(state);
    const messages: BaseMessage[] = [new SystemMessage(system), ...state.messages];
    const ai: BaseMessage = await model.invoke(messages);
    return { messages: [ai] };
  };
}

export function shouldContinue(state: BaseStateShape): "tools" | typeof END {
  const last = state.messages.at(-1);
  // _getType() is more robust than instanceof across serialization boundaries
  if (!last || last._getType() !== "ai") return END;
  const ai = last as AIMessage;
  return ai.tool_calls && ai.tool_calls.length > 0 ? "tools" : END;
}
