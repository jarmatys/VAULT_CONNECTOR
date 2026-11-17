// The index's queues and schedule, apart from the handlers so `softure.config.ts` imports no handler code.

export const VAULT_INDEX_QUEUE = "vault.index";
export const VAULT_INDEX_CHECK_QUEUE = "vault.index-check";

/** One step per account at a time is kept by the dedup key; a failed model call waits five minutes and more. */
export const VAULT_INDEX_QUEUES = {
  [VAULT_INDEX_QUEUE]: { maxAttempts: 8, concurrency: 2, leaseSeconds: 120, backoff: { baseSeconds: 60, maxSeconds: 3600 } },
  [VAULT_INDEX_CHECK_QUEUE]: { maxAttempts: 3, leaseSeconds: 120 },
} as const;

export const VAULT_INDEX_SCHEDULES = { [VAULT_INDEX_CHECK_QUEUE]: { every: "5m" } } as const;
