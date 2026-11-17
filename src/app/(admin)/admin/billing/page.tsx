// Billing's admin page (VC-15): grant a plan by email (recorded, revocable), extend a trial for free, and an account's
// history of grants, trial extensions and Stripe payments. Refunds of Stripe payments are made at Stripe; the webhook
// takes the access back. Admin only: anyone else gets "not found", and every action checks the role again.
export { BillingAdminPage as default } from "@softure-ai/billing/next";

export const dynamic = "force-dynamic";
