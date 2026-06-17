import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

export type OkrDraft = {
  goal: string;
  objectives: Array<{ title: string; keyResults: string[] }>;
};

export type ReviewSummary = {
  threadId: string;
  date: string;
  highlights: string;
};

export const BaseState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  threadId: Annotation<string>(),
  agentId: Annotation<string>(),   // renamed from toolId
  system: Annotation<string>(),
});

export const OkrState = Annotation.Root({
  ...BaseState.spec,
  okrDraft: Annotation<OkrDraft | null>(),
});

export const ReviewState = Annotation.Root({
  ...BaseState.spec,
  references: Annotation<ReviewSummary[]>(),
});
