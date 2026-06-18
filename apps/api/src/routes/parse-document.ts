import { Hono } from "hono";
import { extractDocumentText } from "@/services/pdf-service";

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const app = new Hono();

app.post("/", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return c.json({ error: "文件不能超过 10MB" }, 413);
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return c.json(
      { error: "仅支持 PDF 和 Word 文档（.pdf .docx .doc）" },
      400,
    );
  }

  try {
    const text = await extractDocumentText(file);
    if (!text) {
      return c.json({ error: "未能从文档中提取到文字" }, 422);
    }
    return c.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `文档解析失败: ${message}` }, 422);
  }
});

export default app;
