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
