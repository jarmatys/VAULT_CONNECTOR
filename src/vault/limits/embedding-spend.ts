// Embedding spend per account (FR-18, NFR-6): every call to the embedding model, while indexing an account's notes or
// embedding its search query, records its input tokens in `@softure-ai/metering` under the account, the step (`index`
// or `search`) and the model. No budget refuses a call here: the plans' note, storage and search limits bound the
// spend, and the ledger shows what each account costs (`getSpend`, `getSpendBreakdown`).
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { Embedder } from "@softure-ai/llm";
import type { ProviderDefinitionInput } from "@softure-ai/metering";
import { recordCharge } from "@softure-ai/metering/server";

export const EMBEDDING_PROVIDER = "vault-embeddings";

/** Charges are kept a little over a year, so a month's spend can be explained later; metering's floor is 32 days. */
export const EMBEDDING_CHARGES_KEEP_DAYS = 400;

export type EmbeddingStep = "index" | "search";

/** The metering provider for `metering({ providers })`: tokens, no budget. */
export const EMBEDDING_METERING_PROVIDER: ProviderDefinitionInput = { id: EMBEDDING_PROVIDER, unit: "tokens" };

/**
 * The embedder with every successful call recorded against the account named in the call's `userId` attribute. A call
 * without one records nothing; a failed call bills nothing and records nothing. A failed write propagates.
 */
export function meterEmbedder(embedder: Embedder, ctx: ModuleContext<Queryable>, step: EmbeddingStep): Embedder {
  return {
    modelId: embedder.modelId,
    dimensions: embedder.dimensions,
    embedTexts: async (request) => {
      const result = await embedder.embedTexts(request);
      const accountId = request.attributes?.userId;
      if (result.ok && accountId !== undefined && request.values.length > 0) {
        const characters = request.values.reduce((sum, value) => sum + value.length, 0);
        await recordCharge(ctx, {
          provider: EMBEDDING_PROVIDER,
          amount: result.value.usage.inputTokens,
          step,
          accountId,
          attributes: { model: result.value.model, texts: String(request.values.length), characters: String(characters) },
        });
      }
      return result;
    },
  };
}
