import { createOpenAI } from "@ai-sdk/openai";

function normalizeBaseUrl(url: string | undefined): string | undefined {
  return url?.replace(/\/chat\/completions\/?$/, "");
}

export const llmClient = createOpenAI({
  baseURL: normalizeBaseUrl(process.env.ALIBABA_BASE_URL),
  apiKey: process.env.ALIBABA_API_KEY,
});

export const MODEL_NAME = process.env.MODEL_NAME ?? "qwen-plus";
