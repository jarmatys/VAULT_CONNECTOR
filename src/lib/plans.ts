// The hosted plans and their limits (FR-18): what an account may copy (notes, MiB of notes) and how often it may search
// a month, during the trial, on a paid plan and once access has ended. This file is the one place the owner sets the
// values and the prices (OQ-2): every number below is a placeholder until then. A self-hosted instance sets
// `PLAN_LIMITS=unlimited`, which lifts every limit; payment and the plan screens come with VC-15.
import type { BillingOptionsInput } from "@softure-ai/billing";
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

/** Placeholder prices in euro cents; the owner sets the real ones (OQ-2). */
export const PLACEHOLDER_PRICES = { monthly: 500, yearly: 5_000 } as const;
export const PLAN_CURRENCY = "EUR";

type Environment = Readonly<Record<string, string | undefined>>;

/** Whether this instance enforces the plans' limits: everything but `PLAN_LIMITS=unlimited` does. */
export function isPlanLimited(env: Environment): boolean {
  return env[PLAN_LIMITS_ENV]?.trim().toLowerCase() !== "unlimited";
}

/** The billing options: the trial, the read-only state and the two plans, with their limits per meter. */
export function createBillingOptions(env: Environment): BillingOptionsInput {
  const limited = isPlanLimited(env);
  const pick = (limits: PlanLimits) => toMeterLimits(limited ? limits : UNLIMITED);
  return {
    trial: { days: TRIAL_DAYS, limits: pick(TRIAL_LIMITS) },
    paid: { limits: pick(PAID_LIMITS) },
    readOnly: { limits: pick(READ_ONLY_LIMITS) },
    plans: [
      {
        id: "monthly",
        name: { en: en.plans.monthly },
        price: { amount: PLACEHOLDER_PRICES.monthly, currency: PLAN_CURRENCY },
        period: "month",
        limits: pick(PAID_LIMITS),
      },
      {
        id: "yearly",
        name: { en: en.plans.yearly },
        price: { amount: PLACEHOLDER_PRICES.yearly, currency: PLAN_CURRENCY },
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
