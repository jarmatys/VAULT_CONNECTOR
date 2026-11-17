import type { WorkersAiBinding } from "@softure-ai/llm";
import { afterEach, describe, expect, it } from "vitest";
import { createIndexEmbedder, readEmbeddingSettings, registerWorkersAiBinding } from "./embedding-settings.ts";

const binding: WorkersAiBinding = { run: () => Promise.resolve({ data: [] }) };

afterEach(() => {
  registerWorkersAiBinding(null);
});

describe("readEmbeddingSettings", () => {
  it("is keyword-only without a binding or an endpoint, and with an endpoint that is not a web address", () => {
    expect(readEmbeddingSettings({})).toEqual({ kind: "none" });
    expect(readEmbeddingSettings({ EMBEDDINGS_URL: "ollama:11434" })).toEqual({ kind: "none" });
    expect(createIndexEmbedder({ kind: "none" })).toBeNull();
  });

  it("reads an OpenAI-compatible endpoint with the default model and an optional key", () => {
    expect(readEmbeddingSettings({ EMBEDDINGS_URL: " http://ollama:11434/v1 " })).toEqual({
      kind: "openai-compatible",
      baseUrl: "http://ollama:11434/v1",
      model: "bge-m3",
      apiKey: undefined,
    });
    const settings = readEmbeddingSettings({ EMBEDDINGS_URL: "https://api.example/v1", EMBEDDINGS_MODEL: "multilingual-e5-large", EMBEDDINGS_API_KEY: "k" });
    expect(settings).toMatchObject({ model: "multilingual-e5-large", apiKey: "k" });
    expect(createIndexEmbedder(settings)).toMatchObject({ modelId: "multilingual-e5-large", dimensions: 1024 });
  });

  it("prefers the registered Workers AI binding, with bge-m3 by default", () => {
    registerWorkersAiBinding(binding);
    const settings = readEmbeddingSettings({ EMBEDDINGS_URL: "https://api.example/v1" });
    expect(settings).toEqual({ kind: "workers-ai", binding, model: "@cf/baai/bge-m3" });
    expect(createIndexEmbedder(settings)).toMatchObject({ modelId: "@cf/baai/bge-m3", dimensions: 1024 });
  });
});
