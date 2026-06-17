import { describe, it, expect } from "vitest";
import { streamGraphToUIMessageStream } from "../stream-adapter";
import { GraphInterrupt } from "@langchain/langgraph";
import {
  parseJsonEventStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from "ai";

async function readChunks(res: Response): Promise<UIMessageChunk[]> {
  const parsed = parseJsonEventStream({
    stream: res.body!,
    schema: uiMessageChunkSchema,
  });
  const out: UIMessageChunk[] = [];
  for await (const r of parsed) {
    if (r.success) out.push(r.value as UIMessageChunk);
  }
  return out;
}

describe("streamGraphToUIMessageStream", () => {
  it("emits ask_user_pending SSE event when graph is interrupted", async () => {
    const fakeInterrupt = new GraphInterrupt([
      { value: { question: "你想详细还是简略?", options: ["详细", "简略"] } },
    ]);

    async function* fakeStreamEvents() {
      // Simulates the real graph sequence: the LLM call that emitted the
      // tool call (start-step boundary), then the tool runs and interrupts.
      yield {
        event: "on_chat_model_start",
        data: {},
        name: "ChatModel",
        run_id: "model-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_tool_error",
        data: { error: fakeInterrupt },
        name: "ask_user",
        run_id: "run-1",
        tags: [],
        metadata: {},
      };
      throw fakeInterrupt;
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;

    const res = await streamGraphToUIMessageStream(mockGraph, {} as any, "t-int-1");
    const chunks = await readChunks(res);

    // On interrupt, the loop-stopper for the client is the tool part's
    // `state=input-available` (no output-available), NOT the absence of
    // finish-step. We DO send finish-step so the step boundary is closed —
    // this is required for `lastAssistantMessageIsCompleteWithToolCalls`
    // to evaluate the correct step's tools.
    expect(chunks.some((c) => c.type === "finish-step")).toBe(true);
    // No output-available was sent for ask_user (it interrupted).
    expect(chunks.some((c) => c.type === "tool-output-available")).toBe(false);

    // ask_user tool-input-available must carry the parsed question/options
    // pulled from the GraphInterrupt value, NOT whatever raw input the
    // model originally sent.
    const inputAvail = chunks.find(
      (c) => c.type === "tool-input-available" && (c as any).toolName === "ask_user",
    ) as any;
    expect(inputAvail).toBeDefined();
    expect(inputAvail.input).toEqual({
      question: "你想详细还是简略?",
      options: ["详细", "简略"],
    });
  });

  it("unwraps Qwen-style { input: '<JSON>' } tool args from on_tool_start", async () => {
    async function* fakeStreamEvents() {
      yield {
        event: "on_tool_start",
        data: {
          input: { input: '{"city":"Beijing","unit":"C"}' },
        },
        name: "get_weather",
        run_id: "run-w-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_tool_end",
        data: { output: { temp: 18 } },
        name: "get_weather",
        run_id: "run-w-1",
        tags: [],
        metadata: {},
      };
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;
    const res = await streamGraphToUIMessageStream(mockGraph, {} as any, "t-unwrap");
    const chunks = await readChunks(res);

    const inputAvail = chunks.find((c) => c.type === "tool-input-available") as any;
    expect(inputAvail.input).toEqual({ city: "Beijing", unit: "C" });
  });

  it("emits text-delta chunks and finish-step on normal completion", async () => {
    async function* fakeStreamEvents() {
      yield {
        event: "on_chat_model_start",
        data: {},
        name: "ChatModel",
        run_id: "run-2",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_chat_model_stream",
        data: { chunk: { content: "hello" } },
        name: "ChatModel",
        run_id: "run-2",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_chain_end",
        data: {},
        name: "LangGraph",
        run_id: "run-2",
        tags: [],
        metadata: {},
      };
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;

    const res = await streamGraphToUIMessageStream(mockGraph, {} as any, "t-int-2");
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const chunks = await readChunks(res);

    const textDeltas = chunks.filter((c) => c.type === "text-delta");
    expect(textDeltas.length).toBeGreaterThan(0);
    expect((textDeltas[0] as any).delta).toBe("hello");

    // Exactly one text-start/text-end bracket the entire turn, so the
    // message has a single TextUIPart (not one per streamed delta).
    expect(chunks.filter((c) => c.type === "text-start")).toHaveLength(1);
    expect(chunks.filter((c) => c.type === "text-end")).toHaveLength(1);

    // AI SDK v6 emits a final finish-step chunk when the stream completes normally.
    expect(chunks.some((c) => c.type === "finish-step")).toBe(true);
    expect(chunks.some((c) => c.type === "start")).toBe(true);
  });

  it("emits tool-input-available and tool-output-available for tool calls", async () => {
    async function* fakeStreamEvents() {
      yield {
        event: "on_tool_start",
        data: { input: { question: "ok?", options: ["a", "b"] } },
        name: "ask_user",
        run_id: "tool-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_tool_end",
        data: { output: { answer: "a" } },
        name: "ask_user",
        run_id: "tool-1",
        tags: [],
        metadata: {},
      };
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;

    const res = await streamGraphToUIMessageStream(mockGraph, {} as any, "t-int-3");
    const chunks = await readChunks(res);

    expect(chunks.some((c) => c.type === "tool-input-available")).toBe(true);
    expect(chunks.some((c) => c.type === "tool-output-available")).toBe(true);
    const toolOut = chunks.find((c) => c.type === "tool-output-available") as any;
    expect(toolOut.toolCallId).toBe("tool-1");
  });

  it("emits one start-step / finish-step pair per LLM invocation (multi-step)", async () => {
    // Simulates: LLM round 1 (emits text, calls tool) → tool runs →
    // LLM round 2 (final text). Each LLM round must be bracketed by
    // start-step/finish-step so the client's
    // lastAssistantMessageIsCompleteWithToolCalls predicate looks at the
    // right step's tools (without start-step, it sees all tools as one
    // step and loops forever after a resume).
    async function* fakeStreamEvents() {
      yield {
        event: "on_chat_model_start",
        data: {},
        name: "ChatModel",
        run_id: "m-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_chat_model_stream",
        data: { chunk: { content: "calling tool" } },
        name: "ChatModel",
        run_id: "m-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_tool_start",
        data: { input: { x: 1 } },
        name: "some_tool",
        run_id: "t-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_tool_end",
        data: { output: "ok" },
        name: "some_tool",
        run_id: "t-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_chat_model_start",
        data: {},
        name: "ChatModel",
        run_id: "m-2",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_chat_model_stream",
        data: { chunk: { content: "done" } },
        name: "ChatModel",
        run_id: "m-2",
        tags: [],
        metadata: {},
      };
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;
    const res = await streamGraphToUIMessageStream(mockGraph, {} as any, "t-multi");
    const chunks = await readChunks(res);

    expect(chunks.filter((c) => c.type === "start-step")).toHaveLength(2);
    expect(chunks.filter((c) => c.type === "finish-step")).toHaveLength(2);
  });

  it("isResume=true skips replayed tool events but still emits LLM step", async () => {
    // On resume, langgraph re-plays the original tool node so interrupt()
    // can return. The client already has that tool in output-available;
    // re-emitting tool events would create a duplicate part. Only the
    // subsequent LLM output should be streamed.
    async function* fakeStreamEvents() {
      // Replay of the original ask_user
      yield {
        event: "on_tool_start",
        data: { input: { question: "?", options: ["a", "b"] } },
        name: "ask_user",
        run_id: "tool-replay-1",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_tool_end",
        data: { output: '{"selected":"a"}' },
        name: "ask_user",
        run_id: "tool-replay-1",
        tags: [],
        metadata: {},
      };
      // Real LLM continuation
      yield {
        event: "on_chat_model_start",
        data: {},
        name: "ChatModel",
        run_id: "m-resume",
        tags: [],
        metadata: {},
      };
      yield {
        event: "on_chat_model_stream",
        data: { chunk: { content: "好的!" } },
        name: "ChatModel",
        run_id: "m-resume",
        tags: [],
        metadata: {},
      };
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;
    const res = await streamGraphToUIMessageStream(
      mockGraph,
      {} as any,
      "t-resume",
      undefined,
      { isResume: true },
    );
    const chunks = await readChunks(res);

    // No tool events should appear in the stream.
    expect(chunks.some((c) => c.type === "tool-input-start")).toBe(false);
    expect(chunks.some((c) => c.type === "tool-input-available")).toBe(false);
    expect(chunks.some((c) => c.type === "tool-output-available")).toBe(false);
    // The LLM step IS streamed.
    expect(chunks.filter((c) => c.type === "start-step")).toHaveLength(1);
    expect(chunks.some((c) => c.type === "text-delta")).toBe(true);
    expect(chunks.filter((c) => c.type === "finish-step")).toHaveLength(1);
  });

  it("falls back to on_chat_model_end text when provider doesn't stream", async () => {
    // Qwen / Aliyun can return the full response in one shot without
    // on_chat_model_stream chunks. We need to still surface the text.
    async function* fakeStreamEvents() {
      yield {
        event: "on_chat_model_start",
        data: {},
        name: "ChatModel",
        run_id: "m-nonstream",
        tags: [],
        metadata: {},
      };
      // No on_chat_model_stream events — the model returned in one shot.
      yield {
        event: "on_chat_model_end",
        data: {
          output: {
            generations: [
              [{ message: { content: "好的!请发给我吧。" } }],
            ],
          },
        },
        name: "ChatModel",
        run_id: "m-nonstream",
        tags: [],
        metadata: {},
      };
    }

    const mockGraph = { streamEvents: () => fakeStreamEvents() } as any;
    const res = await streamGraphToUIMessageStream(mockGraph, {} as any, "t-nonstream");
    const chunks = await readChunks(res);

    const textDeltas = chunks.filter((c) => c.type === "text-delta");
    expect(textDeltas.length).toBeGreaterThan(0);
    expect((textDeltas[0] as any).delta).toBe("好的!请发给我吧。");
  });
});
