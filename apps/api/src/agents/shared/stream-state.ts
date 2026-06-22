/**
 * Finite state machine for stream-adapter event processing.
 *
 * Encapsulates 5 previously-free let variables (stepOpen, textOpen,
 * inputSent, skipToolEvents, prefixBuffer) into explicit phase transitions
 * and named predicates. Replaces inline state mutations in stream-adapter's
 * main event loop with method calls.
 */

export type StreamPhase =
  | { kind: "idle" }
  | { kind: "llm_step" }
  | { kind: "llm_text_open" }
  | { kind: "tool_fresh" }
  | { kind: "closed" };

export class StreamStateMachine {
  private _phase: StreamPhase = { kind: "idle" };
  private _stepOpen: boolean = false;
  private _textOpen: boolean = false;
  private _inputSent: Set<string> = new Set();
  private _skipToolEvents: boolean;
  private _prefixBuffer: string = "";

  constructor(opts?: { isResume?: boolean }) {
    this._skipToolEvents = opts?.isResume === true;
  }

  // Phase getter
  get phase(): StreamPhase {
    return this._phase;
  }

  // Predicates for code that needs to know "is this open?"
  get isStepOpen(): boolean {
    return this._stepOpen;
  }

  get isTextOpen(): boolean {
    return this._textOpen;
  }

  get skipToolEvents(): boolean {
    return this._skipToolEvents;
  }

  get prefixBuffer(): string {
    return this._prefixBuffer;
  }

  // State transitions — called by stream-adapter's main loop
  noteChatModelStart(): void {
    this._phase = { kind: "llm_step" };
    this._stepOpen = true;
    this._skipToolEvents = false;
  }

  noteTextStart(): void {
    if (this._phase.kind === "llm_step") {
      this._phase = { kind: "llm_text_open" };
    }
    this._textOpen = true;
  }

  noteTextEnd(): void {
    this._textOpen = false;
  }

  noteFinishStep(): void {
    this._stepOpen = false;
  }

  noteToolStart(): void {
    this._phase = { kind: "tool_fresh" };
  }

  noteToolEnd(): void {
    // phase stays tool_fresh until next chat_model_start
  }

  markInputSent(toolCallId: string): void {
    this._inputSent.add(toolCallId);
  }

  hasInputSent(toolCallId: string): boolean {
    return this._inputSent.has(toolCallId);
  }

  appendToPrefixBuffer(chunk: string): void {
    this._prefixBuffer += chunk;
  }

  consumePrefixBuffer(): string {
    const buf = this._prefixBuffer;
    this._prefixBuffer = "";
    return buf;
  }

  noteClosed(): void {
    this._phase = { kind: "closed" };
    this._stepOpen = false;
    this._textOpen = false;
  }
}
