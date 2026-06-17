import { readFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { sqlite } from "./connection";

type CsvRow = {
  jargon: string;
  short_definition: string;
  definition: string;
  easy_understanding: string;
  use_example: string;
  bad_example: string;
};

// Synchronous: called from client.ts during module init, alongside other
// schema bootstrapping. better-sqlite3 transactions are sync, so we keep
// the whole pipeline sync too — no async/await leak into the import graph.
//
// The CSV is the source of truth: every startup reconciles the jargon
// table to match it. The single transaction does upserts for all CSV
// rows, then deletes any table row whose `jargon` key is not in the CSV.
export function seedJargonFromCsv(): void {
  const csvPath = path.resolve(
    import.meta.dirname,
    "..",
    "data",
    "jargon.csv",
  );
  const csv = readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    throw new Error(
      `jargon.csv parse failed: ${parsed.errors[0]?.message ?? "unknown"}`,
    );
  }

  const upsert = sqlite.prepare(
    `INSERT INTO jargon
       (jargon, short_definition, definition, easy_understanding, use_example, bad_example)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(jargon) DO UPDATE SET
       short_definition   = excluded.short_definition,
       definition         = excluded.definition,
       easy_understanding = excluded.easy_understanding,
       use_example        = excluded.use_example,
       bad_example        = excluded.bad_example`,
  );
  const deleteMissing = sqlite.prepare(
    `DELETE FROM jargon WHERE jargon NOT IN (SELECT value FROM json_each(?))`,
  );

  const reconcile = sqlite.transaction((rows: CsvRow[]) => {
    const keys: string[] = [];
    for (const r of rows) {
      const key = r.jargon.trim();
      keys.push(key);
      upsert.run(
        key,
        r.short_definition,
        r.definition,
        r.easy_understanding,
        r.use_example,
        r.bad_example,
      );
    }
    deleteMissing.run(JSON.stringify(keys));
  });
  reconcile(parsed.data);
}
