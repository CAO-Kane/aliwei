import type { CompiledStateGraph } from "@langchain/langgraph";
import { Command, isGraphInterrupt } from "@langchain/langgraph";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

export { Command };

type OnFinish = (text: string) => void | Promise<void>;

// Qwen / Aliyun OpenAI-compat models sometimes emit tool_call args as
// `{ input: "<JSON string>" }` rather than the schema-shaped object. LangChain
// tool wrappers parse it transparently on the way in, but the on_tool_start
// event still carries the wrapped shape. Unwrap for client display.
function unwrapToolInput(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const keys = Object.keys(raw as object);
    if (keys.length === 1 && keys[0] === "input") {
      const inner = (raw as Record<string, unknown>).input;
      if (typeof inner === "string") {
        try {
          return JSON.parse(inner);
        } catch {
          return raw;
        }
      }
      return inner;
    }
  }
  return raw;
}

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
  options?: { isResume?: boolean },
): Promise<Response> {
  const messageId = crypto.randomUUID();
  const textId = crypto.randomUUID();
  let textOpen = false;
  let stepOpen = false;
  let finishedNormally = true;
  // When resuming an interrupted graph, langgraph re-plays the same tool
  // node (re-enters the tool function so interrupt() can return). That
  // surfaces as a fresh on_tool_start/on_tool_end pair with a NEW run_id.
  // The client's tool part is already in output-available (set by the
  // user's addResult), so re-emitting tool-input-available would create a
  // duplicate part and re-emitting tool-output-available with the new
  // run_id would not match any existing part. Either way the UI looks
  // wrong. Solution: skip tool events only during the replay phase
  // (before the LLM starts its next turn). Once on_chat_model_start fires,
  // we've entered a new LLM step and any subsequent tool calls are fresh —
  // they must be shown to the user (e.g. a second ask_user question).
  let skipToolEvents = options?.isResume === true;
  // Track tool calls that have had tool-input-available written, so we don't
  // double-write or send a final output for an interrupted call.
  const inputSent = new Set<string>();

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
            skipToolEvents = false;
            if (textOpen) {
              writer.write({ type: "text-end", id: textId } as any);
              textOpen = false;
            }
            if (stepOpen) {
              writer.write({ type: "finish-step" } as any);
            }
            writer.write({ type: "start-step" } as any);
            stepOpen = true;
          } else if (event.event === "on_chat_model_stream") {
            const deltas = extractTextDeltas(event.data?.chunk?.content);
            if (deltas.length === 0) continue;
            if (!textOpen) {
              writer.write({ type: "text-start", id: textId } as any);
              textOpen = true;
            }
            for (const d of deltas) writer.write({ type: "text-delta", id: textId, delta: d } as any);
          } else if (event.event === "on_chat_model_end") {
            // Fallback for non-streaming providers (Qwen / Aliyun can return
            // the entire response in one shot without on_chat_model_stream
            // events). If we received no stream chunks for this turn, pull
            // the final text out of the end event and emit it once.
            if (!textOpen) {
              const finalText = extractFinalText(event.data);
              if (finalText) {
                writer.write({ type: "text-start", id: textId } as any);
                writer.write({ type: "text-delta", id: textId, delta: finalText } as any);
                textOpen = true;
              }
            }
          } else if (event.event === "on_tool_start") {
            if (skipToolEvents) continue;
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
              input: unwrapToolInput(event.data?.input),
            } as any);
            inputSent.add(id);
          } else if (event.event === "on_tool_end") {
            if (skipToolEvents) continue;
            const out = event.data?.output;
            writer.write({
              type: "tool-output-available",
              toolCallId: event.run_id,
              output: typeof out === "string" ? out : JSON.stringify(out),
            } as any);
          } else if (event.event === "on_tool_error") {
            if (skipToolEvents) continue;
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
              if (!inputSent.has(id)) {
                writer.write({
                  type: "tool-input-start",
                  toolCallId: id,
                  toolName: name,
                } as any);
                inputSent.add(id);
              }
              writer.write({
                type: "tool-input-available",
                toolCallId: id,
                toolName: name,
                input: interruptValue,
              } as any);
              finishedNormally = false;
            } else {
              // Non-interrupt tool error — propagate as a normal stream error.
              finishedNormally = false;
              throw event.data?.error;
            }
          }
        }
      } catch (err) {
        // Defensive: some langgraph versions DO throw GraphInterrupt out of
        // streamEvents instead of yielding on_tool_error. Handle that path too.
        if (!looksLikeGraphInterrupt(err)) {
          finishedNormally = false;
          throw err;
        }
        finishedNormally = false;
      } finally {
        if (textOpen) writer.write({ type: "text-end", id: textId } as any);
        // Always close the open step. Suppressing finish-step on interrupt
        // (the previous design) meant assistant-ui never marked the step
        // as complete, which kept lastAssistantMessageIsCompleteWithToolCalls
        // returning true — leading to a POST /chat loop. The client now
        // distinguishes "interrupted, waiting on user" via the tool part's
        // input-available state, not via the missing finish-step.
        if (stepOpen) writer.write({ type: "finish-step" } as any);
        // finishedNormally is no longer used to gate finish-step; keep the
        // local so future error handling (logging, metrics) can still see it.
        void finishedNormally;
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

// Pull the final text from on_chat_model_end event data. Used when a
// provider returned the full response without streaming (no
// on_chat_model_stream chunks fired). The payload shape varies a bit
// between LangChain versions, so check the common locations.
function extractFinalText(data: any): string {
  if (!data) return "";
  // langchain core puts the AIMessage on data.output (or data.output.generations[0][0].message)
  const candidates: unknown[] = [
    data.output?.content,
    data.output?.text,
    data.output?.generations?.[0]?.[0]?.message?.content,
    data.output?.generations?.[0]?.[0]?.text,
    data.message?.content,
    data.text,
  ];
  for (const c of candidates) {
    const deltas = extractTextDeltas(c);
    if (deltas.length > 0) return deltas.join("");
  }
  return "";
}

function messageToText(message: UIMessage | undefined): string {
  if (!message) return "";
  const parts = (message as any).parts ?? [];
  return parts
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("");
}
