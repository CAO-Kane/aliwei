import { Annotation } from "@langchain/langgraph";
import { BaseState } from "../base/state";

export const WeeklyState = Annotation.Root({
  ...BaseState.spec,
  organizedContent: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  stylePreference: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  slangSummary: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  candidateTerms: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  verifiedEntries: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
});

export type WeeklyStateShape = typeof WeeklyState.State;
