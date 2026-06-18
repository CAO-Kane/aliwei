import { describe, it, expect } from "vitest";
import { suggestAgentTool } from "../suggest-agent-tool";

describe("suggestAgentTool", () => {
  it("has the correct name and schema fields", () => {
    expect(suggestAgentTool.name).toBe("suggest_agent");
    const schema = suggestAgentTool.schema as any;
    expect(schema.shape).toHaveProperty("agentId");
    expect(schema.shape).toHaveProperty("reason");
  });

  it("schema validates known agentIds", () => {
    const schema = suggestAgentTool.schema as any;
    expect(() => schema.parse({ agentId: "weekly", reason: "用户想写周报" })).not.toThrow();
    expect(() => schema.parse({ agentId: "invalid", reason: "x" })).toThrow();
  });
});
