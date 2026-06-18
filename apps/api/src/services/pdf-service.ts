import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { generateText } from "ai";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { getLlmClient } from "@/services/llm-client";

// pdfjs v6 requires an explicit workerSrc; point it at the legacy worker file
const _require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  _require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

const MAX_CHARS = 6000;
const MAX_PDF_PAGES = 10;

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim().slice(0, MAX_CHARS);
}

async function extractDoc(buffer: Buffer): Promise<string> {
  const tempPath = join(tmpdir(), `aliwei-${randomUUID()}.doc`);
  try {
    await writeFile(tempPath, buffer);
    const extractor = new WordExtractor();
    const doc = await extractor.extract(tempPath);
    return doc.getBody().content().trim().slice(0, MAX_CHARS);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

async function pdfToImages(buffer: Buffer): Promise<string[]> {
  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer) })
    .promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const images: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvas: canvas as any, viewport }).promise;
    images.push(canvas.toBuffer("image/png").toString("base64"));
  }

  return images;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const images = await pdfToImages(buffer);
  // Use .chat() to force Chat Completions endpoint — DashScope does not support Responses API
  const model = getLlmClient().chat(
    process.env.QWEN_VL_MODEL_NAME ?? "qwen-vl-max",
  );
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "请提取以下图片中的所有文字，按页顺序输出，不要添加任何解释",
          },
          ...images.map((b64) => ({
            type: "image" as const,
            image: `data:image/png;base64,${b64}`,
          })),
        ],
      },
    ],
  });
  return text.trim().slice(0, MAX_CHARS);
}

export async function extractDocumentText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { type } = file;

  let result: string;
  if (
    type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    result = await extractDocx(buffer);
  } else if (type === "application/msword") {
    result = await extractDoc(buffer);
  } else {
    result = await extractPdf(buffer);
  }

  return result;
}
