"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

type Args = { question: string; options: string[] };
type Result = { selected: string };

export const AskUserCard: ToolCallMessagePartComponent<Args, Result> = ({
  args,
  result,
  addResult,
}) => {
  const submitted = result !== undefined;
  const question = args?.question ?? "";
  const options = Array.isArray(args?.options) ? args.options : [];

  if (!question || options.length === 0) {
    return null;
  }

  const handle = (selected: string) => {
    if (submitted) return;
    addResult({ selected });
  };

  return (
    <div className="my-2 rounded-lg border bg-muted/40 p-3">
      <div className="mb-2 text-sm font-medium">{question}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = submitted && result?.selected === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handle(opt)}
              disabled={submitted}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed")
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};
