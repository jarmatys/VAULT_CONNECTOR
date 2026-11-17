// The admin pages' role check, handed to jobs and alerts as their `panelGuard`. `@softure-ai/auth/next` imports
// `next/headers`, which plain Node loads of softure.config.ts (`softure migrate`, the worker process) cannot resolve,
// so it is imported only when a page or an action checks the role.
import type { Err, ErrorCode, Ok } from "@softure-ai/core";

export const adminPanelGuard = {
  requireRole: async (role: string): Promise<unknown> => (await import("@softure-ai/auth/next")).requireRole(role),
  authorizeRole: async (role: string): Promise<Ok<unknown> | Err<ErrorCode>> =>
    (await import("@softure-ai/auth/next")).authorizeRole(role),
};
