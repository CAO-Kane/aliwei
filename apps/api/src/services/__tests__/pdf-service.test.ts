import { describe, it, expect, vi } from "vitest";
import { extractDocumentText } from "../pdf-service";

vi.mock("@/services/llm-client", () => ({
  getLlmClient: () => ({
    chat: () => "mock-vl-model",
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "extracted from PDF" })),
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: "mammoth extracted text" })),
  },
}));

vi.mock("word-extractor", () => ({
  default: class WordExtractor {
    async extract() {
      return { getBody: () => ({ content: () => "word extractor text" }) };
    }
  },
}));

// Bypass real pdfjs parsing in tests — we only want to verify the dispatch +
// truncation behavior, not the actual OCR pipeline.
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

vi.mock("@napi-rs/canvas", () => ({
  createCanvas: () => ({
    toBuffer: () => Buffer.from(""),
  }),
}));

function makeFile(content: string | Buffer, type: string, name = "f"): File {
  const data = typeof content === "string" ? content : new Uint8Array(content);
  return new File([data], name, { type });
}

describe("extractDocumentText", () => {
  it("extracts text from a DOCX buffer (mammoth path)", async () => {
    const file = makeFile(
      Buffer.from("PK\x03\x04fake-docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "test.docx",
    );
    const text = await extractDocumentText(file);
    expect(text).toBe("mammoth extracted text");
  });

  it("extracts text from a .doc buffer (word-extractor path)", async () => {
    const file = makeFile(
      Buffer.from("fake-doc"),
      "application/msword",
      "legacy.doc",
    );
    const text = await extractDocumentText(file);
    expect(text).toBe("word extractor text");
  });

  it("truncates VL output to MAX_CHARS (6000) for PDFs", async () => {
    const longText = "a".repeat(10_000);
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({ text: longText } as any);

    const file = makeFile(Buffer.from("not a real pdf"), "application/pdf", "x.pdf");
    const text = await extractDocumentText(file);

    expect(text.length).toBeLessThanOrEqual(6000);
  });

  it("returns trimmed text from VL happy path", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "  hello world  ",
    } as any);

    const file = makeFile(Buffer.from("pdf-bytes"), "application/pdf", "x.pdf");
    const text = await extractDocumentText(file);

    expect(text).toBe("hello world");
  });

  it("propagates errors from VL (route will catch and return 422)", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("network down"));

    const file = makeFile(Buffer.from("pdf"), "application/pdf", "x.pdf");
    await expect(extractDocumentText(file)).rejects.toThrow("network down");
  });
});
