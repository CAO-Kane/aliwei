# Jargon Lookup Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `lookup_jargon` function-calling tool to all agents, enabling structured fuzzy lookup of jargon terms from the SQLite database, with grouped results and optional field projection.

**Architecture:** Two layers — (1) DB query functions in `packages/db/src/jargon-queries.ts` that do the actual lookup and schema introspection, and (2) a LangChain tool in `apps/api/src/agents/shared/jargon-lookup-tool.ts` that wraps them with a Zod schema built dynamically from the DB column list at module load time. The tool is wired into `base/graph.ts` so all agents get it automatically.

**Tech Stack:** better-sqlite3 (PRAGMA, raw prepared statements), Drizzle ORM (typed SELECT + `like()`), `@langchain/core/tools` (`tool()`), Zod (`z.enum` for dynamic field validation), Vitest (tests)

## Global Constraints

- TypeScript strict mode — no `any` unless the existing codebase already uses it in the same pattern
- Tests live under `apps/api/src/**/*.test.ts` (picked up by `apps/api/vitest.config.ts`)
- Run tests with: `pnpm test` from `apps/api`, or `pnpm --filter @aliwei/api test` from repo root
- Tool name string: `"lookup_jargon"` (exact — matched by tests and prompt references)
- `fields` empty array treated same as omitted — return all fields
- `jargon` column always included in projected results for readability

---

### Task 1: DB query layer — `getJargonColumns` + `lookupJargonByTerms`

**Files:**
- Modify: `packages/db/src/jargon-queries.ts`
- Test: `apps/api/src/agents/shared/__tests__/jargon-queries.test.ts` (new file)

**Interfaces:**
- Produces:
  - `getJargonColumns(): string[]` — camelCase column names from `PRAGMA table_info(jargon)`, `id` excluded
  - `lookupJargonByTerms(terms: string[], fields?: string[]): Record<string, Partial<JargonEntry>[]>`
  - Both are auto-exported via `packages/db/src/index.ts`'s existing `export * from "./jargon-queries"`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/agents/shared/__tests__/jargon-queries.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getJargonColumns, lookupJargonByTerms } from "@aliwei/db";

describe("getJargonColumns", () => {
  it("returns camelCase field names excluding id", () => {
    const cols = getJargonColumns();
    expect(cols).not.toContain("id");
    expect(cols).toContain("jargon");
    expect(cols).toContain("shortDefinition");
    expect(cols).toContain("definition");
    expect(cols).toContain("easyUnderstanding");
    expect(cols).toContain("useExample");
    expect(cols).toContain("badExample");
  });
});

describe("lookupJargonByTerms", () => {
  it("returns all fields for a matching term", () => {
    const result = lookupJargonByTerms(["怼"]);
    expect(result["怼"]).toBeDefined();
    expect(result["怼"].length).toBeGreaterThan(0);
    const entry = result["怼"][0];
    expect(entry).toHaveProperty("jargon");
    expect(entry).toHaveProperty("shortDefinition");
    expect(entry).toHaveProperty("definition");
    expect(entry).toHaveProperty("easyUnderstanding");
    expect(entry).toHaveProperty("useExample");
    expect(entry).toHaveProperty("badExample");
  });

  it("returns empty array for a term with no match", () => {
    const result = lookupJargonByTerms(["查不到的词XYZ123"]);
    expect(result["查不到的词XYZ123"]).toEqual([]);
  });

  it("handles multiple terms in one call", () => {
    const result = lookupJargonByTerms(["怼", "查不到的词XYZ123"]);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["怼"].length).toBeGreaterThan(0);
    expect(result["查不到的词XYZ123"]).toEqual([]);
  });

  it("projects to specified fields, always keeping jargon", () => {
    const result = lookupJargonByTerms(["怼"], ["definition"]);
    const entry = result["怼"][0];
    expect(entry).toHaveProperty("jargon");
    expect(entry).toHaveProperty("definition");
    expect(entry).not.toHaveProperty("shortDefinition");
    expect(entry).not.toHaveProperty("useExample");
  });

  it("treats empty fields array as return-all", () => {
    const resultAll = lookupJargonByTerms(["怼"]);
    const resultEmpty = lookupJargonByTerms(["怼"], []);
    expect(Object.keys(resultEmpty["怼"][0])).toHaveLength(
      Object.keys(resultAll["怼"][0]).length,
    );
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd apps/api && pnpm test src/agents/shared/__tests__/jargon-queries.test.ts
```

Expected output: FAIL — `getJargonColumns is not a function` / `lookupJargonByTerms is not a function`

- [ ] **Step 3: Implement the two functions**

Replace the entire contents of `packages/db/src/jargon-queries.ts` with:

```typescript
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
            entry[f as keyof JargonEntry] = row[f as keyof JargonEntry];
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
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd apps/api && pnpm test src/agents/shared/__tests__/jargon-queries.test.ts
```

Expected output: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/jargon-queries.ts \
        apps/api/src/agents/shared/__tests__/jargon-queries.test.ts
git commit -m "feat(db): add getJargonColumns and lookupJargonByTerms"
```

---

### Task 2: Tool definition — `jargon-lookup-tool.ts`

**Files:**
- Create: `apps/api/src/agents/shared/jargon-lookup-tool.ts`
- Test: `apps/api/src/agents/shared/__tests__/jargon-lookup-tool.test.ts` (new file)

**Interfaces:**
- Consumes: `getJargonColumns(): string[]` and `lookupJargonByTerms(terms, fields?)` from `@aliwei/db` (Task 1)
- Produces: `jargonLookupTool` — a `StructuredToolInterface` with `name === "lookup_jargon"`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/agents/shared/__tests__/jargon-lookup-tool.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { jargonLookupTool } from "../jargon-lookup-tool";

describe("jargonLookupTool", () => {
  it("has name 'lookup_jargon'", () => {
    expect(jargonLookupTool.name).toBe("lookup_jargon");
  });

  it("schema has terms (required) and fields (optional)", () => {
    const schema = jargonLookupTool.schema as any;
    expect(schema.shape.terms).toBeDefined();
    expect(schema.shape.fields).toBeDefined();
  });

  it("schema rejects empty terms array", () => {
    const schema = jargonLookupTool.schema as any;
    expect(() => schema.parse({ terms: [] })).toThrow();
  });

  it("schema accepts valid terms without fields", () => {
    const schema = jargonLookupTool.schema as any;
    expect(() => schema.parse({ terms: ["怼"] })).not.toThrow();
  });

  it("schema rejects invalid field names", () => {
    const schema = jargonLookupTool.schema as any;
    expect(() =>
      schema.parse({ terms: ["怼"], fields: ["nonExistentField"] }),
    ).toThrow();
  });

  it("schema accepts valid field names", () => {
    const schema = jargonLookupTool.schema as any;
    expect(() =>
      schema.parse({ terms: ["怼"], fields: ["jargon", "definition"] }),
    ).not.toThrow();
  });

  it("invoke returns JSON with grouped results", async () => {
    const raw = await jargonLookupTool.invoke({ terms: ["怼"] });
    const result = JSON.parse(raw as string);
    expect(result).toHaveProperty("怼");
    expect(Array.isArray(result["怼"])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd apps/api && pnpm test src/agents/shared/__tests__/jargon-lookup-tool.test.ts
```

Expected output: FAIL — `Cannot find module '../jargon-lookup-tool'`

- [ ] **Step 3: Create the tool file**

Create `apps/api/src/agents/shared/jargon-lookup-tool.ts`:

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getJargonColumns, lookupJargonByTerms } from "@aliwei/db";

const AVAILABLE_FIELDS = getJargonColumns();

const fieldsEnum = z.enum(AVAILABLE_FIELDS as [string, ...string[]]);

export const jargonLookupTool = tool(
  (input: { terms: string[]; fields?: string[] }) => {
    const result = lookupJargonByTerms(input.terms, input.fields);
    return JSON.stringify(result);
  },
  {
    name: "lookup_jargon",
    description:
      "在阿里黑话词库中查询一个或多个词条（模糊匹配），按查询词分组返回结果。",
    schema: z.object({
      terms: z
        .array(z.string())
        .min(1)
        .describe("要查询的黑话词列表，支持模糊匹配，可一次查询多个词"),
      fields: z
        .array(fieldsEnum)
        .optional()
        .describe("指定返回哪些字段；省略则返回全部字段"),
    }),
  },
);
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd apps/api && pnpm test src/agents/shared/__tests__/jargon-lookup-tool.test.ts
```

Expected output: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/agents/shared/jargon-lookup-tool.ts \
        apps/api/src/agents/shared/__tests__/jargon-lookup-tool.test.ts
git commit -m "feat(agents): add jargon-lookup-tool with dynamic field schema"
```

---

### Task 3: Wire tool into base graph

**Files:**
- Modify: `apps/api/src/agents/base/graph.ts`
- Modify: `apps/api/src/agents/base/__tests__/graph.test.ts`

**Interfaces:**
- Consumes: `jargonLookupTool` (name `"lookup_jargon"`) from `../shared/jargon-lookup-tool` (Task 2)
- Produces: all agents now have `lookup_jargon` in their bound tool list

> **Note on side effects:** Adding `jargon-lookup-tool` to `graph.ts` will cause `@aliwei/db` to be imported whenever `graph.ts` is imported (including in graph tests). This triggers DB initialization — the jargon table is seeded from `packages/db/data/jargon.csv`. This is expected and safe; the CSV is tracked in git and the seed is idempotent.

- [ ] **Step 1: Update the graph test to assert the new tool is bound**

In `apps/api/src/agents/base/__tests__/graph.test.ts`, make two changes:

**Add import** at the top (alongside the existing `askUserTool` import):
```typescript
import { jargonLookupTool } from "../../shared/jargon-lookup-tool";
```

**Add one assertion** to the existing `"binds tools to the model"` test. The full updated test body:
```typescript
it("binds tools to the model so the LLM emits structured tool_calls (not JSON-in-content)", () => {
  const fake = new FakeListChatModel({ responses: ["irrelevant"] });
  const bindSpy = vi.spyOn(fake, "bindTools");

  const extraTool = {
    name: "extra_tool",
    description: "x",
    schema: { type: "object" } as any,
    invoke: async () => "",
  } as any;

  createBaseGraph({
    agentId: "okr",
    stateAnnotation: BaseState,
    systemPromptFn: () => "you are a test",
    model: fake as any,
    extraTools: [extraTool],
  });

  expect(bindSpy).toHaveBeenCalledTimes(1);
  const boundTools = bindSpy.mock.calls[0][0] as any[];
  const names = boundTools.map((t) => t.name);
  expect(names).toContain(askUserTool.name);
  expect(names).toContain(jargonLookupTool.name);
  expect(names).toContain("extra_tool");
});
```

- [ ] **Step 2: Run the graph tests — expect the binding test to fail**

```bash
cd apps/api && pnpm test src/agents/base/__tests__/graph.test.ts
```

Expected output: 2 tests PASS, 1 test FAIL — `expect(names).toContain("lookup_jargon")` fails

- [ ] **Step 3: Add `jargonLookupTool` to `allTools` in `graph.ts`**

In `apps/api/src/agents/base/graph.ts`, add the import after the existing `askUserTool` import:
```typescript
import { jargonLookupTool } from "../shared/jargon-lookup-tool";
```

Change the `allTools` line:
```typescript
// Before:
const allTools: StructuredToolInterface[] = [askUserTool, ...(opts.extraTools ?? [])];

// After:
const allTools: StructuredToolInterface[] = [askUserTool, jargonLookupTool, ...(opts.extraTools ?? [])];
```

- [ ] **Step 4: Run all graph tests — expect them to pass**

```bash
cd apps/api && pnpm test src/agents/base/__tests__/graph.test.ts
```

Expected output: 3 tests PASS

- [ ] **Step 5: Run the full test suite — confirm no regressions**

```bash
cd apps/api && pnpm test
```

Expected output: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/agents/base/graph.ts \
        apps/api/src/agents/base/__tests__/graph.test.ts
git commit -m "feat(agents): wire lookup_jargon tool into all agents via base graph"
```
