// The erasure's queue and schedule, apart from the handler so `softure.config.ts` imports no handler code.

export const VAULT_ERASE_QUEUE = "vault.erase-copies";

/** Due this long after a deletion: past the sync step's lease (120 s), so a step in flight has put its last copy. */
export const ERASE_DELAY_SECONDS = 150;

export const VAULT_ERASE_QUEUES = {
  [VAULT_ERASE_QUEUE]: { maxAttempts: 5, leaseSeconds: 120, backoff: { baseSeconds: 60, maxSeconds: 3600 } },
} as const;

/** Every hour, for keys a failed run left behind. */
export const VAULT_ERASE_SCHEDULES = { [VAULT_ERASE_QUEUE]: { every: "1h" } } as const;
