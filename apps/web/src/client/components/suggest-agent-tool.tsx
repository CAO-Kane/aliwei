"use client";

import { useRef, useContext } from "react";
import { ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import { useAssistantToolUI, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { cn } from "@aliwei/ui/cn";
import { findAgent } from "@aliwei/domain/agents";
import { ThreadContext } from "@/client/contexts/thread-context";

type SuggestAgentArgs = {
  agentId: string;
  reason: string;
};

type SuggestAgentResult = {
  confirmed: boolean;
};

const SuggestAgentTool: ToolCallMessagePartComponent<SuggestAgentArgs, SuggestAgentResult> = ({
  args,
  result,
  status,
  addResult,
}) => {
  const submittedRef = useRef(false);
  const { requestAgentSwitch } = useContext(ThreadContext);
  const isComplete = status?.type === "complete";
  const isPartial = !args?.agentId || !args?.reason;

  if (isPartial) return null;

  const agent = findAgent(args.agentId);
  const agentLabel = agent?.label ?? args.agentId;

  const handleConfirm = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    addResult({ confirmed: true });
    if (agent) requestAgentSwitch(agent, ""); // message resolved in assistant.tsx
  };

  const handleDecline = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    addResult({ confirmed: false });
  };

  return (
    <div className="bg-background my-2 overflow-hidden rounded-xl border shadow-sm">
      <div className="bg-muted/30 px-4 py-3">
        <div className="text-xs text-muted-foreground mb-1">推荐切换到</div>
        <div className="text-sm font-semibold">「{agentLabel}」</div>
      </div>
      <div className="px-4 py-2.5 text-sm text-muted-foreground border-b">{args.reason}</div>
      {isComplete ? (
        <div className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground">
          {result?.confirmed ? (
            <>
              <CheckIcon className="size-4" />
              <span>已切换</span>
            </>
          ) : (
            <>
              <XIcon className="size-4" />
              <span>继续在这里聊</span>
            </>
          )}
        </div>
      ) : (
        <div className="flex">
          <button
            type="button"
            onClick={handleConfirm}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
              "text-primary hover:bg-primary/5 focus-visible:outline-none",
            )}
          >
            <ArrowRightIcon className="size-4" />
            切换过去
          </button>
          <div className="w-px bg-border" />
          <button
            type="button"
            onClick={handleDecline}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors",
              "text-muted-foreground hover:bg-accent focus-visible:outline-none",
            )}
          >
            继续在这里聊
          </button>
        </div>
      )}
    </div>
  );
};

export function SuggestAgentToolUI() {
  useAssistantToolUI({
    toolName: "suggest_agent",
    render: SuggestAgentTool,
    display: "standalone",
  });
  return null;
}
