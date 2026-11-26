// The hosted plans and their limits (FR-18): what an account may copy (notes, MiB of notes) and how often it may search
// a month, during the trial, on a paid plan and once access has ended. This file is the one place the owner sets the
// values and the prices. The prices and currency are the owner's (OQ-2, settled 2026-11-26); the limits, trial and
// grace period are still placeholders until the owner sets them (VC-14). A self-hosted instance sets
// `PLAN_LIMITS=unlimited`, which lifts every limit and has no payment (VC-15): no plan screen, no access gate on the
// tools and no removal of a lapsed account's copies.
import { stripe, type BillingOptionsInput, type PaymentProvider } from "@softure-ai/billing";
import { en } from "../messages/en.ts";

/** The meters billing counts or caps, by the names billing knows them. */
export const METERS = { notes: "notes", storageMb: "storage-mb", searches: "searches" } as const;

export const PLAN_LIMITS_ENV = "PLAN_LIMITS";

/** One block of limits: notes copied, MiB of notes copied, searches a calendar month. Null: no limit. */
export interface PlanLimits {
  readonly notes: number | null;
  readonly storageMb: number | null;
  readonly searches: number | null;
}

/** Placeholder trial: 14 days with room to try the product on a real vault. */
export const TRIAL_DAYS = 14;
export const TRIAL_LIMITS: PlanLimits = { notes: 5_000, storageMb: 500, searches: 1_000 };
/** Placeholder paid plans: the same limits monthly and yearly. */
export const PAID_LIMITS: PlanLimits = { notes: 20_000, storageMb: 2_000, searches: 5_000 };
/** After access ends the copies stay within the trial's caps (the data is kept), and search stops. */
export const READ_ONLY_LIMITS: PlanLimits = { notes: TRIAL_LIMITS.notes, storageMb: TRIAL_LIMITS.storageMb, searches: 0 };
const UNLIMITED: PlanLimits = { notes: null, storageMb: null, searches: null };

/**
 * Placeholder grace period: once access has ended, the account's copies and index stay this many days (the tools point
 * to the product's website meanwhile), then they are removed. The source and the picked folders stay, so a payment copies
 * everything back.
 */
export const GRACE_DAYS = 30;

/** Where the e2e's fake Stripe answers; unset in production, where `stripe()` calls Stripe itself. */
export const STRIPE_API_BASE_ENV = "STRIPE_API_BASE";

/** The plans' prices in euro cents, set by the owner (OQ-2): 5.00 EUR a month, 50.00 EUR a year. */
export const PLAN_PRICES = { monthly: 500, yearly: 5_000 } as const;
export const PLAN_CURRENCY = "EUR";

type Environment = Readonly<Record<string, string | undefined>>;

/** Whether this instance enforces the plans' limits: everything but `PLAN_LIMITS=unlimited` does. */
export function isPlanLimited(env: Environment): boolean {
  return env[PLAN_LIMITS_ENV]?.trim().toLowerCase() !== "unlimited";
}

/**
 * How an account pays: Stripe Checkout, one period per payment (a renewal is a new payment), when the instance enforces
 * plans; none on an unlimited (self-hosted) instance. `STRIPE_SECRET_KEY` is read on each payment, so the config loads
 * without it.
 */
export function createPaymentProvider(env: Environment): PaymentProvider | undefined {
  if (!isPlanLimited(env)) return undefined;
  const apiBase = env[STRIPE_API_BASE_ENV]?.trim();
  return stripe(apiBase === undefined || apiBase === "" ? {} : { apiBase });
}

/** The billing options: the trial, the read-only state and the two plans, with their limits per meter, and payment. */
export function createBillingOptions(env: Environment): BillingOptionsInput {
  const limited = isPlanLimited(env);
  const pick = (limits: PlanLimits) => toMeterLimits(limited ? limits : UNLIMITED);
  const payment = createPaymentProvider(env);
  return {
    ...(payment === undefined ? {} : { payment }),
    trial: { days: TRIAL_DAYS, limits: pick(TRIAL_LIMITS) },
    paid: { limits: pick(PAID_LIMITS) },
    readOnly: { limits: pick(READ_ONLY_LIMITS) },
    plans: [
      {
        id: "monthly",
        name: { en: en.plans.monthly },
        price: { amount: PLAN_PRICES.monthly, currency: PLAN_CURRENCY },
        period: "month",
        limits: pick(PAID_LIMITS),
      },
      {
        id: "yearly",
        name: { en: en.plans.yearly },
        price: { amount: PLAN_PRICES.yearly, currency: PLAN_CURRENCY },
        period: "year",
        isFeatured: true,
        limits: pick(PAID_LIMITS),
      },
    ],
  };
}

/** A limits block as billing takes it, keyed by meter. */
export function toMeterLimits(limits: PlanLimits): Record<string, number | null> {
  return { [METERS.notes]: limits.notes, [METERS.storageMb]: limits.storageMb, [METERS.searches]: limits.searches };
}

/** Billing's limits of an account back in this app's shape; a meter billing leaves out counts as 0 (deny by default). */
export function fromMeterLimits(limits: Readonly<Record<string, number | null>>): PlanLimits {
  const read = (meter: string): number | null => (meter in limits ? (limits[meter] ?? null) : 0);
  return { notes: read(METERS.notes), storageMb: read(METERS.storageMb), searches: read(METERS.searches) };
}
