import { PDFParse } from "pdf-parse";

const MAX_CHARS = 6000;

export async function extractPdfText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text.trim().slice(0, MAX_CHARS);
}
