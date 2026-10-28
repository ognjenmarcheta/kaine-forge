import { describe, expect, it } from "vitest";

import { resolvePriceCatalog } from "./billing.prices";

describe("resolvePriceCatalog", () => {
  const prices = resolvePriceCatalog({
    BILLING_PRICE_PRO_MONTH: "price_pro_m",
    BILLING_PRICE_BUSINESS_YEAR: " price_biz_y "
  });

  it("maps a configured Plan and interval to its price and back", () => {
    expect(prices.priceId("business", "year")).toBe("price_biz_y");
    expect(prices.planOf("price_pro_m")).toEqual({ planKey: "pro", interval: "month" });
  });

  it("knows no price for an unset or unpurchasable Plan, nor a Plan for an unknown price", () => {
    expect(prices.priceId("pro", "year")).toBeNull();
    expect(prices.priceId("free", "month")).toBeNull();
    expect(prices.planOf("price_other")).toBeNull();
  });
});
