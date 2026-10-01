import { describe, it, expect } from "vitest";
import {
  computeContactRollups,
  computeCompanyRollups,
  mapRollupsToHubSpotProperties,
} from "../../src/services/rollups.js";

describe("computeContactRollups", () => {
  it("sums revenue per currency without merging currencies", () => {
    const orders = [
      { currencyCode: "USD", amount: "100.00", orderDate: "2026-01-01" },
      { currencyCode: "USD", amount: "50.00", orderDate: "2026-02-01" },
      { currencyCode: "EUR", amount: "80.00", orderDate: "2026-01-15" },
    ];

    const result = computeContactRollups(orders);

    expect(result.revenueByCurrency).toEqual({ USD: "150.00", EUR: "80.00" });
    expect(result.totalOrders).toBe(3);
  });

  it("never double-counts and never sums USD + EUR into one number", () => {
    const orders = [
      { currencyCode: "USD", amount: "100.00", orderDate: "2026-01-01" },
      { currencyCode: "EUR", amount: "100.00", orderDate: "2026-01-01" },
    ];

    const result = computeContactRollups(orders);

    expect(result.revenueByCurrency.USD).toBe("100.00");
    expect(result.revenueByCurrency.EUR).toBe("100.00");
    expect(Object.keys(result.revenueByCurrency)).toHaveLength(2);
  });

  it("excludes cancelled orders from totals and revenue", () => {
    const orders = [
      { currencyCode: "USD", amount: "100.00", orderDate: "2026-01-01", cancelled: false },
      { currencyCode: "USD", amount: "999.00", orderDate: "2026-03-01", cancelled: true },
    ];

    const result = computeContactRollups(orders);

    expect(result.totalOrders).toBe(1);
    expect(result.revenueByCurrency.USD).toBe("100.00");
  });

  it("picks the most recent order date as lastOrderDate", () => {
    const orders = [
      { currencyCode: "USD", amount: "10.00", orderDate: "2026-01-01" },
      { currencyCode: "USD", amount: "10.00", orderDate: "2026-05-01" },
      { currencyCode: "USD", amount: "10.00", orderDate: "2026-03-01" },
    ];

    const result = computeContactRollups(orders);

    expect(result.lastOrderDate).toBe("2026-05-01");
  });

  it("returns zero orders and no lastOrderDate for an empty order list", () => {
    const result = computeContactRollups([]);

    expect(result.totalOrders).toBe(0);
    expect(result.lastOrderDate).toBeUndefined();
    expect(result.revenueByCurrency).toEqual({});
  });
});

describe("computeCompanyRollups", () => {
  it("computes company-wide purchase history the same way as contact rollups (client requirement, section 12)", () => {
    const orders = [
      { currencyCode: "USD", amount: "500.00", orderDate: "2026-01-01" },
      { currencyCode: "USD", amount: "250.00", orderDate: "2026-03-01" },
    ];

    const result = computeCompanyRollups(orders);

    expect(result.totalOrders).toBe(2);
    expect(result.revenueByCurrency.USD).toBe("750.00");
    expect(result.lastOrderDate).toBe("2026-03-01");
  });
});

describe("mapRollupsToHubSpotProperties", () => {
  it("only writes properties that exist on the HubSpot portal", () => {
    const rollups = { totalOrders: 2, lastOrderDate: "2026-01-01", revenueByCurrency: { USD: "150.00" } };
    const result = mapRollupsToHubSpotProperties(rollups, new Set(["shopify_total_orders", "shopify_revenue_usd"]));

    expect(result.properties).toEqual({ shopify_total_orders: "2", shopify_revenue_usd: "150.00" });
    expect(result.skippedMissingProperties).toContain("shopify_last_order_date");
  });

  it("does not write a currency with no configured HubSpot property", () => {
    const rollups = { totalOrders: 1, lastOrderDate: "2026-01-01", revenueByCurrency: { JPY: "500" } };
    const result = mapRollupsToHubSpotProperties(rollups, new Set(["shopify_total_orders"]));

    expect(result.properties.shopify_revenue_jpy).toBeUndefined();
    expect(Object.values(result.properties)).not.toContain("500");
  });
});
