import { ChatOpenAI } from "@langchain/openai";
import { QwenAdapter } from "@/agents/shared/qwen-adapter";
import type { ModelAdapter } from "@/agents/shared/model-adapter";

let _model: ChatOpenAI | null = null;
let _modelAdapter: ModelAdapter | null = null;

function normalizeBaseUrl(url: string | undefined): string | undefined {
  return url?.replace(/\/chat\/completions\/?$/, "");
}

export function getChatModel(): ChatOpenAI {
  if (!_model) {
    _model = new ChatOpenAI({
      configuration: {
        baseURL: normalizeBaseUrl(process.env.ALIBABA_BASE_URL),
        apiKey: process.env.ALIBABA_API_KEY,
      },
      model: process.env.MODEL_NAME ?? "qwen-plus",
    });
  }
  return _model;
}

export function resetChatModel(): void {
  _model = null;
}

export function getModelAdapter(): ModelAdapter {
  if (!_modelAdapter) _modelAdapter = new QwenAdapter();
  return _modelAdapter;
}

export function resetModelAdapter(): void {
  _modelAdapter = null;
}
