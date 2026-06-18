import { db, sqlite } from "./client";
import { jargon } from "./jargon-schema";
import { like } from "drizzle-orm";

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

type PragmaColumn = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function getJargonColumns(): string[] {
  const rows = sqlite.prepare("PRAGMA table_info(jargon)").all() as PragmaColumn[];
  return rows.filter((r) => r.name !== "id").map((r) => snakeToCamel(r.name));
}

export function lookupJargonByTerms(
  terms: string[],
  fields?: string[],
): Record<string, Partial<JargonEntry>[]> {
  const result: Record<string, Partial<JargonEntry>[]> = {};
  const effectiveFields = fields && fields.length > 0 ? fields : undefined;

  for (const term of terms) {
    const rows = db.select().from(jargon).where(like(jargon.jargon, `%${term}%`)).all();
    if (effectiveFields) {
      result[term] = rows.map((row) => {
        const entry: Partial<JargonEntry> = { jargon: row.jargon };
        for (const f of effectiveFields) {
          if (f in row) {
            (entry as Record<string, unknown>)[f] = row[f as keyof JargonEntry];
          }
        }
        return entry;
      });
    } else {
      result[term] = rows;
    }
  }

  return result;
}
