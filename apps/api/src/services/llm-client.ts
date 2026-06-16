import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

function normalizeBaseUrl(url: string | undefined): string | undefined {
  return url?.replace(/\/chat\/completions\/?$/, "");
}

let _llmClient: OpenAIProvider | null = null;

// Lazy: the provider reads process.env at construction time, so we must defer
// it until after env files have loaded (see src/env.ts).
export function getLlmClient(): OpenAIProvider {
  if (!_llmClient) {
    _llmClient = createOpenAI({
      baseURL: normalizeBaseUrl(process.env.ALIBABA_BASE_URL),
      apiKey: process.env.ALIBABA_API_KEY,
    });
  }
  return _llmClient;
}

export function getModelName(): string {
  return process.env.MODEL_NAME ?? "qwen-plus";
}
