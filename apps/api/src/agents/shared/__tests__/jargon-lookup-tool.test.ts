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
    expect(() => schema.parse({ terms: ["怼"], fields: ["nonExistentField"] })).toThrow();
  });

  it("schema accepts valid field names", () => {
    const schema = jargonLookupTool.schema as any;
    expect(() => schema.parse({ terms: ["怼"], fields: ["jargon", "definition"] })).not.toThrow();
  });

  it("invoke returns JSON with grouped results", async () => {
    const raw = await jargonLookupTool.invoke({ terms: ["怼"] });
    const result = JSON.parse(raw as string);
    expect(result).toHaveProperty("怼");
    expect(Array.isArray(result["怼"])).toBe(true);
  });
});
