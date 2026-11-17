// The background work's health for the operator (VC-13): queues, schedules with their health, recent jobs and runs,
// with Run now, Retry, Cancel, Pause and Resume. Admin only: anyone else gets "not found" (jobs' panelGuard in
// softure.config.ts), and every action checks the role again.
export { JobsPage as default } from "@softure-ai/jobs/next";

export const dynamic = "force-dynamic";
