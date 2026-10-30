import { describe, expect, it } from "vitest";

import { BILLING_PROVIDERS, type PlanKey, type SubscriptionStatus } from "./billing.definition";
import {
  requiredPlanForFeature,
  requiredPlanForLimit,
  resolveEntitlements,
  type SubscriptionAccess
} from "./billing.util";

const NOW = new Date("2026-10-28T12:00:00Z");
const LATER = new Date("2026-11-28T12:00:00Z");
const EARLIER = new Date("2026-10-01T12:00:00Z");

function subscription(overrides: Partial<SubscriptionAccess> = {}): SubscriptionAccess {
  return {
    planKey: "pro",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: LATER,
    ...overrides
  };
}

describe("resolveEntitlements", () => {
  it.each<[SubscriptionStatus, PlanKey]>([
    ["active", "pro"],
    ["trialing", "pro"],
    ["past_due", "pro"],
    ["canceled", "free"],
    ["unpaid", "free"],
    ["paused", "free"],
    ["incomplete", "free"],
    ["expired", "free"]
  ])("a %s subscription to pro resolves to %s", (status, planKey) => {
    expect(
      resolveEntitlements({
        provider: BILLING_PROVIDERS.STRIPE,
        subscriptions: [subscription({ status })],
        now: NOW
      }).planKey
    ).toBe(planKey);
  });

  it("keeps the plan until the period end of a cancellation at period end", () => {
    expect(
      resolveEntitlements({
        provider: BILLING_PROVIDERS.STRIPE,
        subscriptions: [subscription({ cancelAtPeriodEnd: true, currentPeriodEnd: LATER })],
        now: NOW
      }).planKey
    ).toBe("pro");
  });

  it("drops to free after the period end of a cancellation even without a canceled event", () => {
    expect(
      resolveEntitlements({
        provider: BILLING_PROVIDERS.STRIPE,
        subscriptions: [subscription({ cancelAtPeriodEnd: true, currentPeriodEnd: EARLIER })],
        now: NOW
      }).planKey
    ).toBe("free");
  });

  it("gives free with its todo limit to an organization without a subscription", () => {
    expect(
      resolveEntitlements({ provider: BILLING_PROVIDERS.PADDLE, subscriptions: [], now: NOW })
    ).toEqual({ planKey: "free", limits: { todos: 50 }, features: [] });
  });

  it("gives every organization the unlimited plan while billing is off", () => {
    expect(
      resolveEntitlements({
        provider: BILLING_PROVIDERS.NONE,
        subscriptions: [subscription({ status: "canceled" })],
        now: NOW
      })
    ).toEqual({ planKey: "unlimited", limits: { todos: null }, features: ["assistant"] });
  });

  it("picks the best plan among subscriptions that still grant access", () => {
    expect(
      resolveEntitlements({
        provider: BILLING_PROVIDERS.STRIPE,
        subscriptions: [
          subscription({ planKey: "business", status: "canceled" }),
          subscription({ planKey: "pro" }),
          subscription({ planKey: "business", status: "trialing" })
        ],
        now: NOW
      }).planKey
    ).toBe("business");
  });
});

describe("required plan", () => {
  it("names the cheapest purchasable plan with the feature", () => {
    expect(requiredPlanForFeature("assistant")).toBe("pro");
  });

  it("names the cheapest purchasable plan that allows one more", () => {
    expect(requiredPlanForLimit("todos", 50)).toBe("pro");
  });
});
