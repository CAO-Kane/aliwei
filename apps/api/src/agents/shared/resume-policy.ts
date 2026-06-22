import type { CompiledStateGraph } from "@langchain/langgraph";
import { Command } from "@langchain/langgraph";

export type ResumeDecision =
  | { kind: "new_conversation" }
  | { kind: "resume"; command: Command; skipPrefix: string };

/**
 * Single source of truth for resume detection: queries the langgraph
 * SqliteSaver-backed state for an active interrupt on this thread. If
 * found, returns a Command({ resume }) plus a skipPrefix derived from
 * the last assistant message in state.
 *
 * Replaces chat-service's three reverse-engineered predicates
 * (detectAskUserResume, detectSuggestAgentResume, getLastAssistantText)
 * which scanned the request body.messages array.
 */
export async function decideResume(
  graph: CompiledStateGraph<any, any, any>,
  threadId: string,
  agentId: string,
): Promise<ResumeDecision> {
  const snapshot = await graph.getState({
    configurable: { thread_id: threadId },
  });

  if (!snapshot || !snapshot.values) {
    return { kind: "new_conversation" };
  }

  const interrupt = firstPendingInterrupt(snapshot);
  if (!interrupt) {
    return { kind: "new_conversation" };
  }

  const resumeValue = extractResumeValue(snapshot, interrupt);
  if (resumeValue === null) {
    return { kind: "new_conversation" };
  }

  const skipPrefix = extractLastAssistantText(snapshot);

  return {
    kind: "resume",
    command: new Command({ resume: resumeValue }),
    skipPrefix,
  };
}

function firstPendingInterrupt(snapshot: any): { value: unknown } | null {
  const tasks = snapshot?.tasks;
  if (!Array.isArray(tasks)) return null;
  for (const task of tasks) {
    if (Array.isArray(task?.interrupts) && task.interrupts.length > 0) {
      return task.interrupts[0];
    }
  }
  return null;
}

function extractResumeValue(snapshot: any, interrupt: { value: unknown }): string | boolean | null {
  // The interrupt payload tells us WHICH tool (ask_user or suggest_agent).
  // The actual resume value (the user's answer) is in the last ToolMessage
  // in state.values.messages whose name matches the tool.
  const toolName = toolNameFromInterrupt(interrupt.value);
  if (!toolName) return null;

  const messages = Array.isArray(snapshot.values?.messages) ? snapshot.values.messages : [];
  // Find the last tool message matching this tool name
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m._getType && m._getType() === "tool" && m.name === toolName) {
      return parseToolOutput(m.content);
    }
  }
  return null;
}

function toolNameFromInterrupt(value: unknown): string | null {
  if (value && typeof value === "object" && "question" in (value as any) && "options" in (value as any)) {
    return "ask_user";
  }
  if (value && typeof value === "object" && "agentId" in (value as any) && "reason" in (value as any)) {
    return "suggest_agent";
  }
  return null;
}

function parseToolOutput(content: unknown): string | boolean | null {
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed?.selected === "string") return parsed.selected;
    if (typeof parsed?.confirmed === "boolean") return parsed.confirmed;
  } catch {
    // not JSON
  }
  return null;
}

/**
 * Returns the full text content of the last AIMessage in langgraph state,
 * not just the text from the last step. This matches what Qwen echoes when
 * resuming after ask_user/suggest_agent: the LLM re-emits the AIMessage
 * that called the tool, whose full content equals the final step's
 * content in the typical case.
 *
 * If Qwen's resume behavior ever changes to echo only the last step,
 * this should be updated to walk parts from the last step-start marker
 * (matching the prior chat-service.ts getLastAssistantText behavior).
 */
function extractLastAssistantText(snapshot: any): string {
  const messages = Array.isArray(snapshot.values?.messages) ? snapshot.values.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m._getType && m._getType() === "ai") {
      const content = m.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((p: any) => p?.type === "text" && typeof p.text === "string")
          .map((p: any) => p.text)
          .join("");
      }
    }
  }
  return "";
}