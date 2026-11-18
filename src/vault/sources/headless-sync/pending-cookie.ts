// The cookie that holds a signed-in sync session between the sign-in and the pick of a vault: its value is sealed to
// the account (`sealPendingToken`), httpOnly, scoped to the sync form, and gone after ten minutes.
export const HEADLESS_SYNC_PENDING_COOKIE = "vc_sync_pending";
