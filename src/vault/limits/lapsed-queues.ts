// The grace-period purge's queue and schedule (VC-15), apart from the handler so `softure.config.ts` imports no handler
// code.

export const VAULT_PURGE_QUEUE = "vault.purge-lapsed";

export const VAULT_PURGE_QUEUES = {
  [VAULT_PURGE_QUEUE]: { maxAttempts: 5, leaseSeconds: 120, backoff: { baseSeconds: 300, maxSeconds: 3600 } },
} as const;

/** Daily: the grace period is counted in days. */
export const VAULT_PURGE_SCHEDULES = { [VAULT_PURGE_QUEUE]: { every: "1d" } } as const;
