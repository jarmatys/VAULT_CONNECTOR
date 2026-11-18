// Stripe's events (VC-15): a paid checkout grants its plan's period, a refund takes back what that payment granted,
// each exactly once. The route checks the signature (STRIPE_WEBHOOK_SECRET) before it reads the body or the database.
// Public: the proxy guards only the panel and the admin pages.
export { stripeWebhookRoute as POST } from "@softure-ai/billing/next";
