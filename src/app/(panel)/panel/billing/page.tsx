// The plan screen (VC-15, FR-19): billing's payment page in the panel. It shows where the account stands (trial days
// left, paid until, or access ended), the monthly and yearly plans and, with `?plan=<id>`, the order with a button to
// Stripe Checkout, which returns here. One payment buys one period. A self-hosted instance (PLAN_LIMITS=unlimited) has
// no payment, so the screen does not exist there.
import { PaymentPage, type PaymentPageProps } from "@softure-ai/billing/next";
import { notFound } from "next/navigation";
import { isPlanLimited } from "../../../../lib/plans.ts";
import { en } from "../../../../messages/en.ts";

export const dynamic = "force-dynamic";

export default function BillingPage(props: PaymentPageProps) {
  if (!isPlanLimited(process.env)) notFound();
  return <PaymentPage {...props} heading={en.billing.title} lead={en.billing.lead} />;
}
