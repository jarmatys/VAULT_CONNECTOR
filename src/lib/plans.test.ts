// The plans' configuration: the limits per state and plan as billing takes them, the self-hosted switch that lifts every
// limit, and the way back from billing's meters.
import { isPaymentProvider } from "@softure-ai/billing";
import { describe, expect, it } from "vitest";
import { createBillingOptions, createPaymentProvider, GRACE_DAYS, fromMeterLimits, isPlanLimited, PAID_LIMITS, READ_ONLY_LIMITS, toMeterLimits, TRIAL_LIMITS } from "./plans.ts";

describe("the plans' limits", () => {
  it("gives the trial, the paid plans and the read-only state their limits per meter", () => {
    const options = createBillingOptions({});
    expect(options.trial).toEqual({ days: 14, limits: { notes: 5000, "storage-mb": 500, searches: 1000 } });
    expect(options.paid).toEqual({ limits: { notes: 20000, "storage-mb": 2000, searches: 5000 } });
    expect(options.readOnly).toEqual({ limits: { notes: 5000, "storage-mb": 500, searches: 0 } });
    expect(options.plans?.map((plan) => [plan.id, plan.period, plan.price, plan.limits])).toEqual([
      ["monthly", "month", { amount: 500, currency: "EUR" }, toMeterLimits(PAID_LIMITS)],
      ["yearly", "year", { amount: 5000, currency: "EUR" }, toMeterLimits(PAID_LIMITS)],
    ]);
  });

  it("keeps the copies within the trial's caps once access ended, and stops search", () => {
    expect(READ_ONLY_LIMITS).toEqual({ notes: TRIAL_LIMITS.notes, storageMb: TRIAL_LIMITS.storageMb, searches: 0 });
  });

  it("lifts every limit with PLAN_LIMITS=unlimited, in any case", () => {
    expect(isPlanLimited({})).toBe(true);
    expect(isPlanLimited({ PLAN_LIMITS: "on" })).toBe(true);
    expect(isPlanLimited({ PLAN_LIMITS: " Unlimited " })).toBe(false);
    const options = createBillingOptions({ PLAN_LIMITS: "unlimited" });
    const none = { notes: null, "storage-mb": null, searches: null };
    expect([options.trial?.limits, options.paid?.limits, options.readOnly?.limits, ...(options.plans ?? []).map((plan) => plan.limits)]).toEqual([
      none,
      none,
      none,
      none,
      none,
    ]);
  });

  it("reads billing's meters back, a missing meter as 0", () => {
    expect(fromMeterLimits({ notes: 3, "storage-mb": null, searches: 7 })).toEqual({ notes: 3, storageMb: null, searches: 7 });
    expect(fromMeterLimits({})).toEqual({ notes: 0, storageMb: 0, searches: 0 });
  });
});

describe("payment", () => {
  it("pays on Stripe Checkout where the plans are enforced, and has no payment on an unlimited instance", () => {
    const provider = createPaymentProvider({});
    expect(provider === undefined ? false : isPaymentProvider(provider)).toBe(true);
    expect(createBillingOptions({}).payment).toBeDefined();
    expect(createPaymentProvider({ PLAN_LIMITS: "unlimited" })).toBeUndefined();
    expect(createBillingOptions({ PLAN_LIMITS: "unlimited" }).payment).toBeUndefined();
  });

  it("keeps a lapsed account's copies for a 30-day grace period (placeholder)", () => {
    expect(GRACE_DAYS).toBe(30);
  });
});
