import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AskUserCard } from "../ask-user-card";

afterEach(cleanup);

function renderCard(overrides: Record<string, unknown> = {}) {
  const addResult = vi.fn();
  // Minimal ToolCallMessagePart props — only the fields AskUserCard reads.
  const props = {
    toolName: "ask_user",
    toolCallId: "tc-1",
    args: { question: "详细还是简略?", options: ["详细", "简略"] },
    argsText: "{}",
    status: { type: "running" as const },
    result: undefined,
    addResult,
    resume: vi.fn(),
    interrupt: undefined,
    approval: undefined,
    respondToApproval: vi.fn(),
    ...overrides,
  } as any;
  render(<AskUserCard {...props} />);
  return { addResult };
}

describe("AskUserCard", () => {
  it("renders question and option buttons", () => {
    renderCard();
    expect(screen.getByText("详细还是简略?")).toBeDefined();
    expect(screen.getByText("详细")).toBeDefined();
    expect(screen.getByText("简略")).toBeDefined();
  });

  it("calls addResult({ selected }) when an option is clicked", () => {
    const { addResult } = renderCard();
    fireEvent.click(screen.getByText("详细"));
    expect(addResult).toHaveBeenCalledWith({ selected: "详细" });
  });

  it("does not call addResult again after a result is present", () => {
    const { addResult } = renderCard({
      result: { selected: "详细" },
      status: { type: "complete" as const },
    });
    fireEvent.click(screen.getByText("简略"));
    expect(addResult).not.toHaveBeenCalled();
  });

  it("returns null when args are missing", () => {
    const { container } = render(
      <AskUserCard
        {...({
          toolName: "ask_user",
          toolCallId: "tc-1",
          args: {},
          argsText: "{}",
          status: { type: "running" },
          result: undefined,
          addResult: vi.fn(),
        } as any)}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
