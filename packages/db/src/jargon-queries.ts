import { db } from "./client";
import { jargon } from "./jargon-schema";

export type JargonEntry = {
  id: number;
  jargon: string;
  shortDefinition: string;
  definition: string;
  easyUnderstanding: string;
  useExample: string;
  badExample: string;
};

export function getAllJargon(): JargonEntry[] {
  return db.select().from(jargon).all();
}

export function formatJargonForPrompt(entries: JargonEntry[]): string {
  return entries
    .map(
      (e) =>
        `【${e.jargon}】${e.definition}。${e.easyUnderstanding}。✓例:${e.useExample} ✗忌:${e.badExample}`,
    )
    .join("\n");
}
