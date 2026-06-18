import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import parseDocumentRouter from "../parse-document";

vi.mock("@/services/pdf-service", () => ({
  extractDocumentText: vi.fn(),
}));

import { extractDocumentText } from "@/services/pdf-service";

function buildApp() {
  const app = new Hono();
  app.route("/parse-document", parseDocumentRouter);
  return app;
}

function makeFormData(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return fd;
}

describe("POST /parse-document", () => {
  it("returns 400 when no file is provided", async () => {
    const app = buildApp();
    const res = await app.request("/parse-document", {
      method: "POST",
      body: makeFormData(null),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No file/);
  });

  it("returns 400 when MIME type is not accepted", async () => {
    const app = buildApp();
    const file = new File(["hello"], "image.png", { type: "image/png" });
    const res = await app.request("/parse-document", {
      method: "POST",
      body: makeFormData(file),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/PDF/);
    expect(extractDocumentText).not.toHaveBeenCalled();
  });

  it("returns 413 when file exceeds 10MB", async () => {
    const app = buildApp();
    // 10MB + 1 byte payload; we pass the actual byte length, not a stream.
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([oversized], "huge.pdf", { type: "application/pdf" });
    const res = await app.request("/parse-document", {
      method: "POST",
      body: makeFormData(file),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/10MB/);
    expect(extractDocumentText).not.toHaveBeenCalled();
  });

  it("returns 200 with extracted text on happy path", async () => {
    vi.mocked(extractDocumentText).mockResolvedValueOnce("extracted content");
    const app = buildApp();
    const file = new File(["%PDF-1.4 fake"], "doc.pdf", { type: "application/pdf" });
    const res = await app.request("/parse-document", {
      method: "POST",
      body: makeFormData(file),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("extracted content");
  });

  it("returns 422 when extraction yields empty text", async () => {
    vi.mocked(extractDocumentText).mockResolvedValueOnce("");
    const app = buildApp();
    const file = new File(["fake"], "doc.pdf", { type: "application/pdf" });
    const res = await app.request("/parse-document", {
      method: "POST",
      body: makeFormData(file),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/未能从文档中提取到文字/);
  });

  it("returns 422 (not 500) when extractDocumentText throws — e.g. malformed / encrypted PDF", async () => {
    vi.mocked(extractDocumentText).mockRejectedValueOnce(
      new Error("InvalidPDFException"),
    );
    const app = buildApp();
    const file = new File(["garbage"], "broken.pdf", { type: "application/pdf" });
    const res = await app.request("/parse-document", {
      method: "POST",
      body: makeFormData(file),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/InvalidPDFException/);
  });
});
