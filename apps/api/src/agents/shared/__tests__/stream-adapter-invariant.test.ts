import { describe, it, expect } from "vitest";
import { streamGraphToUIMessageStream } from "../stream-adapter";
import { parseJsonEventStream, uiMessageChunkSchema, type UIMessageChunk } from "ai";

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

function makeGraph(yields: any[]) {
  return { streamEvents: async function* () { for (const y of yields) yield y; } } as any;
}

// I1: text-delta 之前必有同 textId 的 text-start
describe("invariant I1: text-delta requires preceding text-start", () => {
  it("emits text-start before any text-delta", async () => {
    const graph = makeGraph([
      { event: "on_chat_model_start", data: {}, name: "ChatModel", run_id: "m-1", tags: [], metadata: {} },
      { event: "on_chat_model_stream", data: { chunk: { content: "hi" } }, name: "ChatModel", run_id: "m-1", tags: [], metadata: {} },
    ]);
    const chunks = await readChunks(await streamGraphToUIMessageStream(graph, {} as any, "t-i1"));
    const textStartIdx = chunks.findIndex((c) => c.type === "text-start");
    const textDeltaIdx = chunks.findIndex((c) => c.type === "text-delta");
    expect(textStartIdx).toBeGreaterThanOrEqual(0);
    expect(textDeltaIdx).toBeGreaterThan(textStartIdx);
  });
});

// I3: start-step 数量 ≤ finish-step 数量
describe("invariant I3: balanced start-step / finish-step", () => {
  it("finish-step count >= start-step count on normal completion", async () => {
    const graph = makeGraph([
      { event: "on_chat_model_start", data: {}, name: "ChatModel", run_id: "m-1", tags: [], metadata: {} },
      { event: "on_chat_model_stream", data: { chunk: { content: "x" } }, name: "ChatModel", run_id: "m-1", tags: [], metadata: {} },
    ]);
    const chunks = await readChunks(await streamGraphToUIMessageStream(graph, {} as any, "t-i3"));
    const starts = chunks.filter((c) => c.type === "start-step").length;
    const finishes = chunks.filter((c) => c.type === "finish-step").length;
    expect(finishes).toBeGreaterThanOrEqual(starts);
  });
});

// I5: resume 阶段后 on_chat_model_start 重置 skipToolEvents
describe("invariant I5: chat_model_start resets skipToolEvents after resume", () => {
  it("emits tool events from the LLM continuation step during resume", async () => {
    const graph = makeGraph([
      // Replay of ask_user (should be skipped)
      { event: "on_tool_start", data: { input: { question: "?", options: ["a", "b"] } }, name: "ask_user", run_id: "tool-replay", tags: [], metadata: {} },
      { event: "on_tool_end", data: { output: '{"selected":"a"}' }, name: "ask_user", run_id: "tool-replay", tags: [], metadata: {} },
      // Real LLM continuation
      { event: "on_chat_model_start", data: {}, name: "ChatModel", run_id: "m-resume", tags: [], metadata: {} },
      { event: "on_chat_model_stream", data: { chunk: { content: "ok" } }, name: "ChatModel", run_id: "m-resume", tags: [], metadata: {} },
    ]);
    const chunks = await readChunks(await streamGraphToUIMessageStream(graph, {} as any, "t-i5", undefined, { isResume: true }));
    // No tool events from replay
    expect(chunks.some((c) => c.type === "tool-input-start")).toBe(false);
    // LLM step IS streamed
    expect(chunks.some((c) => c.type === "start-step")).toBe(true);
    expect(chunks.some((c) => c.type === "text-delta")).toBe(true);
  });
});

// I7: 相同 toolCallId 不会 emit 2 次 tool-input-available
describe("invariant I7: tool-input-available not duplicated per toolCallId", () => {
  it("emits tool-input-available exactly once per toolCallId", async () => {
    const graph = makeGraph([
      { event: "on_chat_model_start", data: {}, name: "ChatModel", run_id: "m-1", tags: [], metadata: {} },
      { event: "on_tool_start", data: { input: { x: 1 } }, name: "some_tool", run_id: "t-1", tags: [], metadata: {} },
      { event: "on_tool_end", data: { output: "ok" }, name: "some_tool", run_id: "t-1", tags: [], metadata: {} },
    ]);
    const chunks = await readChunks(await streamGraphToUIMessageStream(graph, {} as any, "t-i7"));
    const inputAvail = chunks.filter((c) => c.type === "tool-input-available" && (c as any).toolCallId === "t-1");
    expect(inputAvail.length).toBe(1);
  });
});

// I8 (KNOWN BUG): prefixBuffer 在流关闭时 flush 后,文本跟 skipPrefix 匹配部分可能不空
// 此 invariant 在状态机化过程中揭示了 stream-adapter.ts:272-278 既有 bug
// 本测试标记为 expected-to-fail,作为 bug 发现的载体
describe("invariant I8: prefix buffer flush respects skipPrefix (KNOWN BUG, deferred to future PR)", () => {
  it("flushed prefix buffer text does not contain the skip prefix", async () => {
    const skipPrefix = "你看到";
    const graph = makeGraph([
      { event: "on_chat_model_start", data: {}, name: "ChatModel", run_id: "m-i8", tags: [], metadata: {} },
      { event: "on_chat_model_end", data: { output: { content: "你看到的世界" } }, name: "ChatModel", run_id: "m-i8", tags: [], metadata: {} },
    ]);
    const chunks = await readChunks(await streamGraphToUIMessageStream(graph, {} as any, "t-i8", undefined, { isResume: true, skipPrefix }));
    const textDeltas = chunks.filter((c) => c.type === "text-delta").map((c) => (c as any).delta as string);
    const combined = textDeltas.join("");
    // If this fails, the known bug is present. Documented in spec §8.
    // After skipping the prefix, the combined text should be "的世界", not "你看到的世界".
    expect(combined).toBe("的世界");
  });
});
