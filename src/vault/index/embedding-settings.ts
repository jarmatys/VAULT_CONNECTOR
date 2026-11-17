// Where passages are turned into vectors. Hosted on Cloudflare: Workers AI (`@cf/baai/bge-m3`, multilingual) through
// the Worker's `AI` binding, so no token is stored; the Worker registers its binding before the jobs run. Elsewhere:
// any OpenAI-compatible `/embeddings` endpoint (a model server next to the app, or a hosted API) from
// `EMBEDDINGS_URL`. With neither, the index is keyword-only and search still works by words.
import { createEmbedder, openAiCompatibleEmbeddingModel, workersAiEmbeddingModel, type Embedder, type WorkersAiBinding } from "@softure-ai/llm";

export const EMBEDDINGS_URL_ENV = "EMBEDDINGS_URL";
export const EMBEDDINGS_MODEL_ENV = "EMBEDDINGS_MODEL";
export const EMBEDDINGS_API_KEY_ENV = "EMBEDDINGS_API_KEY";

/** The length of every stored vector (`vault.passages.embedding`); a model with another length fails its steps. */
export const EMBEDDING_DIMENSIONS = 1024;
export const WORKERS_AI_EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const DEFAULT_EMBEDDING_MODEL = "bge-m3";

export type EmbeddingSettings =
  | { readonly kind: "workers-ai"; readonly binding: WorkersAiBinding; readonly model: string }
  | { readonly kind: "openai-compatible"; readonly baseUrl: string; readonly model: string; readonly apiKey: string | undefined }
  | { readonly kind: "none" };

type Environment = Readonly<Record<string, string | undefined>>;

let registeredBinding: WorkersAiBinding | null = null;

/** Called by the Worker with `env.AI` before it runs the jobs; `null` forgets it (tests). */
export function registerWorkersAiBinding(binding: WorkersAiBinding | null): void {
  registeredBinding = binding;
}

/** The embedding settings: the registered Workers AI binding first, then `EMBEDDINGS_URL`, else none. */
export function readEmbeddingSettings(env: Environment, binding: WorkersAiBinding | null = registeredBinding): EmbeddingSettings {
  const model = readNonEmpty(env[EMBEDDINGS_MODEL_ENV]);
  if (binding !== null) return { kind: "workers-ai", binding, model: model ?? WORKERS_AI_EMBEDDING_MODEL };
  const baseUrl = readNonEmpty(env[EMBEDDINGS_URL_ENV]);
  if (baseUrl === undefined || !isHttpUrl(baseUrl)) return { kind: "none" };
  return { kind: "openai-compatible", baseUrl, model: model ?? DEFAULT_EMBEDDING_MODEL, apiKey: readNonEmpty(env[EMBEDDINGS_API_KEY_ENV]) };
}

/** The embedder for the settings; null for a keyword-only index. Building it calls nothing. */
export function createIndexEmbedder(settings: EmbeddingSettings): Embedder | null {
  switch (settings.kind) {
    case "workers-ai":
      return createEmbedder({ model: workersAiEmbeddingModel({ binding: settings.binding, model: settings.model }), dimensions: EMBEDDING_DIMENSIONS });
    case "openai-compatible":
      return createEmbedder({
        model: openAiCompatibleEmbeddingModel({
          baseUrl: settings.baseUrl,
          model: settings.model,
          ...(settings.apiKey === undefined ? {} : { apiKey: settings.apiKey }),
        }),
        dimensions: EMBEDDING_DIMENSIONS,
      });
    default:
      return null;
  }
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
