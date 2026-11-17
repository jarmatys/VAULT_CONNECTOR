// The sync's queues and schedule, apart from the handlers so `softure.config.ts` imports no handler code.

export const VAULT_SYNC_QUEUE = "vault.sync";
export const VAULT_SYNC_CHECK_QUEUE = "vault.sync-check";

/** Two accounts' steps at once per worker; a step's lease is the jobs lease (extended while it runs). */
export const VAULT_SYNC_QUEUES = {
  [VAULT_SYNC_QUEUE]: { maxAttempts: 8, concurrency: 2, leaseSeconds: 120, backoff: { baseSeconds: 30, maxSeconds: 1800 } },
  [VAULT_SYNC_CHECK_QUEUE]: { maxAttempts: 3, leaseSeconds: 120 },
} as const;

export const VAULT_SYNC_SCHEDULES = { [VAULT_SYNC_CHECK_QUEUE]: { every: "5m" } } as const;

