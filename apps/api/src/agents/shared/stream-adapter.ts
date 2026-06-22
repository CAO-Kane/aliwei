import type { CompiledStateGraph } from "@langchain/langgraph";
import { Command, isGraphInterrupt } from "@langchain/langgraph";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { getModelAdapter } from "@/agents/base/model";
import type { ModelAdapter } from "./model-adapter";
import { StreamStateMachine } from "./stream-state";

export { Command };

type OnFinish = (text: string) => void | Promise<void>;

// Stronger predicate than @langchain/langgraph's isGraphInterrupt: also
// catches duck-typed instances that survive class identity loss (e.g.
// across worker boundaries or minified bundles). Used in the stream
// adapter's defensive catches — false positives are cheap (we silently
// swallow), false negatives leak the interrupt JSON into the UI as a red
// error.
function isInterruptJsonArray(s: string): boolean {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) && parsed.length > 0 && "value" in parsed[0];
  } catch {
    return false;
  }
}

const INTERRUPT_NAME_RE = /\bGraphInterrupt\b|\bNodeInterrupt\b/;

function looksLikeGraphInterrupt(err: unknown): boolean {
  if (isGraphInterrupt(err)) return true;
  if (typeof err === "string") {
    // Raw JSON-serialised interrupts array "[{ id, value }]"
    if (isInterruptJsonArray(err)) return true;
    // Full stack-trace string "...\nGraphInterrupt: [...]\n    at ..."
    return INTERRUPT_NAME_RE.test(err);
  }
  if (!err || typeof err !== "object") return false;
  const anyErr = err as Record<string, unknown>;
  if (anyErr.name === "GraphInterrupt" || anyErr.name === "NodeInterrupt") return true;
  if (Array.isArray(anyErr.interrupts)) return true;
  // Wrapped error whose .message is the JSON array or a stack-trace string
  // containing "GraphInterrupt" (e.g. LangChain tool wrapper sets
  // message = originalError.message + "\n\n" + originalError.stack).
  if (typeof anyErr.message === "string") {
    if (isInterruptJsonArray(anyErr.message)) return true;
    if (INTERRUPT_NAME_RE.test(anyErr.message)) return true;
  }
  return false;
}

// When a tool calls interrupt(), langgraph yields an on_tool_error event
// whose data.error is a GraphInterrupt with an interrupts array (or a
// stringified version). Pull out the first interrupt's value, which is
// what we want to display to the user.
function extractInterruptJsonValue(s: string): unknown | null {
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr) && arr.length > 0) return arr[0]?.value ?? null;
  } catch {
    // not valid JSON
  }
  return null;
}

function extractInterruptValue(err: unknown): unknown | null {
  if (!err) return null;
  if (isGraphInterrupt(err)) {
    const first = (err as any).interrupts?.[0];
    return first?.value ?? null;
  }
  // Raw JSON-serialised interrupts array string
  if (typeof err === "string") return extractInterruptJsonValue(err);
  // Plain Error whose .message is the serialised interrupt array
  if (err instanceof Error && err.message) return extractInterruptJsonValue(err.message);
  return null;
}

export async function streamGraphToUIMessageStream(
  graph: CompiledStateGraph<any, any, any>,
  input: any,
  threadId: string,
  onFinish?: OnFinish,
  options?: { isResume?: boolean; skipPrefix?: string },
  deps?: { modelAdapter?: ModelAdapter },
): Promise<Response> {
  const adapter = deps?.modelAdapter ?? getModelAdapter();
  const messageId = crypto.randomUUID();
  let textId = crypto.randomUUID();
  const skipPrefix = options?.skipPrefix ?? "";
  // Streaming path: buffer text until we can determine whether it starts with
  // the skip prefix. Once determined, either discard the prefix chars and emit
  // the remainder, or emit everything unchanged (model isn't echoing).
  let prefixDone = skipPrefix.length === 0;
  // Stream state machine encapsulates the remaining state (textOpen, stepOpen,
  // skipToolEvents, inputSent, prefixBuffer) into explicit phase transitions
  // and named predicates. The phase machinery gives us a single place to
  // reason about event ordering and an invariant surface for tests.
  const sm = new StreamStateMachine({ isResume: options?.isResume === true });

  const uiStream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId } as any);
      try {
        const events = graph.streamEvents(input, {
          version: "v2",
          configurable: { thread_id: threadId },
        });
        for await (const event of events) {
          if (event.event === "on_chat_model_start") {
            // Each LLM invocation is a new "step" in AI SDK terms. Marking
            // step boundaries is what lets the client's
            // lastAssistantMessageIsCompleteWithToolCalls predicate
            // distinguish "tool result not yet consumed" from "tool result
            // already consumed by the LLM". Without this, the predicate
            // always returns true after a tool runs and the client loops
            // forever resending POST /chat.
            // Also marks end of the replay phase: any tool calls the LLM
            // makes from this point are new and must be surfaced to the client.
            sm.noteChatModelStart();
            if (sm.isTextOpen) {
              writer.write({ type: "text-delta", id: textId, delta: "\n\n" } as any);
              writer.write({ type: "text-end", id: textId } as any);
              sm.noteTextEnd();
            }
            if (sm.isStepOpen) {
              writer.write({ type: "finish-step" } as any);
              sm.noteFinishStep();
            }
            textId = crypto.randomUUID();
            writer.write({ type: "start-step" } as any);
          } else if (event.event === "on_chat_model_stream") {
            const rawDeltas = extractTextDeltas(event.data?.chunk?.content);
            if (rawDeltas.length === 0) continue;
            // Apply skip-prefix buffering when resuming after ask_user.
            const deltas: string[] = [];
            for (const d of rawDeltas) {
              if (prefixDone) {
                deltas.push(d);
                continue;
              }
              sm.appendToPrefixBuffer(d);
              if (sm.prefixBuffer.length >= skipPrefix.length) {
                prefixDone = true;
                const remainder = sm.prefixBuffer.startsWith(skipPrefix)
                  ? sm.prefixBuffer.slice(skipPrefix.length)
                  : sm.prefixBuffer;
                sm.consumePrefixBuffer();
                if (remainder) deltas.push(remainder);
              }
            }
            if (deltas.length === 0) continue;
            if (!sm.isTextOpen) {
              writer.write({ type: "text-start", id: textId } as any);
              sm.noteTextStart();
            }
            for (const d of deltas)
              writer.write({ type: "text-delta", id: textId, delta: d } as any);
          } else if (event.event === "on_chat_model_end") {
            // Fallback for non-streaming providers (Qwen / Aliyun can return
            // the entire response in one shot without on_chat_model_stream
            // events). If we received no stream chunks for this turn, pull
            // the final text out of the end event and emit it once.
            if (!sm.isTextOpen) {
              let finalText = adapter.extractFinalTextFromEndEvent(event.data);
              if (skipPrefix && finalText.startsWith(skipPrefix)) {
                finalText = finalText.slice(skipPrefix.length);
              }
              if (finalText) {
                writer.write({ type: "text-start", id: textId } as any);
                sm.noteTextStart();
                writer.write({ type: "text-delta", id: textId, delta: finalText } as any);
              }
            }
          } else if (event.event === "on_tool_start") {
            if (sm.skipToolEvents) continue;
            sm.noteToolStart();
            const id = event.run_id;
            const name = event.name;
            writer.write({
              type: "tool-input-start",
              toolCallId: id,
              toolName: name,
            } as any);
            writer.write({
              type: "tool-input-available",
              toolCallId: id,
              toolName: name,
              input: adapter.unwrapToolInput(event.data?.input),
            } as any);
            sm.markInputSent(id);
          } else if (event.event === "on_tool_end") {
            if (sm.skipToolEvents) continue;
            sm.noteToolEnd();
            const out = event.data?.output;
            writer.write({
              type: "tool-output-available",
              toolCallId: event.run_id,
              output: typeof out === "string" ? out : JSON.stringify(out),
            } as any);
          } else if (event.event === "on_tool_error") {
            if (sm.skipToolEvents) continue;
            // langgraph's interrupt() surfaces as on_tool_error with a
            // GraphInterrupt payload. Re-emit tool-input-available using the
            // interrupt value so the client renders the question with the
            // correct args (overriding the on_tool_start input, which may be
            // wrapped). Then suppress finish-step so the client stays in
            // "waiting for user" mode.
            const id = event.run_id;
            const name = event.name;
            const interruptValue = extractInterruptValue(event.data?.error);
            if (interruptValue !== null) {
              if (!sm.hasInputSent(id)) {
                writer.write({
                  type: "tool-input-start",
                  toolCallId: id,
                  toolName: name,
                } as any);
                sm.markInputSent(id);
              }
              writer.write({
                type: "tool-input-available",
                toolCallId: id,
                toolName: name,
                input: interruptValue,
              } as any);
            } else {
              // Non-interrupt tool error — propagate as a normal stream error.
              throw event.data?.error;
            }
          }
        }
      } catch (err) {
        // Defensive: some langgraph versions DO throw GraphInterrupt out of
        // streamEvents instead of yielding on_tool_error. Handle that path too.
        if (!looksLikeGraphInterrupt(err)) {
          throw err;
        }
      } finally {
        // Flush streaming prefix buffer if the model finished before we
        // accumulated enough chars to determine a match.
        if (!prefixDone && sm.prefixBuffer) {
          if (!sm.isTextOpen) {
            writer.write({ type: "text-start", id: textId } as any);
            sm.noteTextStart();
          }
          writer.write({ type: "text-delta", id: textId, delta: sm.prefixBuffer } as any);
          sm.consumePrefixBuffer();
        }
        if (sm.isTextOpen) {
          writer.write({ type: "text-end", id: textId } as any);
          sm.noteTextEnd();
        }
        // Always close the open step. Suppressing finish-step on interrupt
        // (the previous design) meant assistant-ui never marked the step
        // as complete, which kept lastAssistantMessageIsCompleteWithToolCalls
        // returning true — leading to a POST /chat loop. The client now
        // distinguishes "interrupted, waiting on user" via the tool part's
        // input-available state, not via the missing finish-step.
        if (sm.isStepOpen) {
          writer.write({ type: "finish-step" } as any);
          sm.noteFinishStep();
        }
        sm.noteClosed();
      }
    },
    onError: (err) => {
      // Defensive: if a GraphInterrupt slips past our handlers and reaches
      // here, suppress it — the interrupt was already surfaced as
      // tool-input-available upstream. Also check the string representation
      // in case the error was re-wrapped by LangChain's tool machinery.
      if (looksLikeGraphInterrupt(err)) return "";
      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (INTERRUPT_NAME_RE.test(msg)) return "";
      return msg;
    },
    onFinish: async ({ responseMessage }) => {
      const text = messageToText(responseMessage);
      if (text) await onFinish?.(text);
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}

function extractTextDeltas(content: unknown): string[] {
  if (typeof content === "string") {
    return content.length > 0 ? [content] : [];
  }
  if (Array.isArray(content)) {
    const out: string[] = [];
    for (const part of content) {
      if (typeof part === "string" && part.length > 0) out.push(part);
      else if (part && typeof part === "object" && (part as any).type === "text") {
        const t = (part as any).text;
        if (typeof t === "string" && t.length > 0) out.push(t);
      }
    }
    return out;
  }
  return [];
}

function messageToText(message: UIMessage | undefined): string {
  if (!message) return "";
  const parts = (message as any).parts ?? [];
  return parts
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("");
}
