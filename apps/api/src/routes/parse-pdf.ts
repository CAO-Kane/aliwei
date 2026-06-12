import { Hono } from "hono";
import { extractPdfText } from "@/services/pdf-service";

const app = new Hono();

app.post("/", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }
  if (file.type !== "application/pdf") {
    return c.json({ error: "File must be a PDF" }, 400);
  }

  const text = await extractPdfText(file);
  return c.json({ text });
});

export default app;
