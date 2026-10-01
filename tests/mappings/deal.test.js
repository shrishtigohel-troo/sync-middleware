import { describe, it, expect } from "vitest";
import { mapShopifyOrderToHubSpotDeal } from "../../src/mappings/deal.js";
import { buildOrder } from "../helpers/shopifyFixtures.js";

const b2bStore = {
  storeId: "b2b",
  channel: "b2b",
  storeUrl: "example.myshopify.com",
  accessToken: "shpat_test",
  apiVersion: "2024-10",
  webhookSecret: undefined,
};

const b2cStore = { ...b2bStore, storeId: "b2c", channel: "b2c" };

describe("mapShopifyOrderToHubSpotDeal", () => {
  it("writes the compound-key fields when both properties exist", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set(["shopify_store_id", "shopify_order_id"]));

    expect(result.properties.shopify_store_id).toBe("b2b");
    expect(result.properties.shopify_order_id).toBe(order.id);
  });

  it("preserves the original currency without conversion", () => {
    const order = buildOrder({ currentTotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "EUR" } } });
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set(["shopify_original_currency", "amount"]));

    expect(result.properties.shopify_original_currency).toBe("EUR");
    expect(result.properties.amount).toBe("100.00");
  });

  it("produces distinct order ids for two different stores' same order number", () => {
    const orderB2b = buildOrder({ id: "gid://shopify/Order/b2b-1001", name: "#1001" });
    const orderB2c = buildOrder({ id: "gid://shopify/Order/b2c-1001", name: "#1001" });

    const existing = new Set(["shopify_store_id", "shopify_order_id"]);
    const resultB2b = mapShopifyOrderToHubSpotDeal(orderB2b, b2bStore, existing);
    const resultB2c = mapShopifyOrderToHubSpotDeal(orderB2c, b2cStore, existing);

    expect(resultB2b.properties.shopify_order_id).not.toBe(resultB2c.properties.shopify_order_id);
  });

  it("skips fields whose HubSpot property does not exist yet", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set());

    expect(result.properties).toEqual({});
    expect(result.skippedMissingProperties.length).toBeGreaterThan(0);
  });

  it("flags a cancelled order rather than dropping it", () => {
    const order = buildOrder({ cancelledAt: "2026-02-01T00:00:00Z", displayFinancialStatus: "REFUNDED" });
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set(["shopify_cancelled", "shopify_financial_status"]));

    expect(result.properties.shopify_cancelled).toBe("true");
    expect(result.properties.shopify_financial_status).toBe("REFUNDED");
  });

  it("never sets dealstage or pipeline - not confirmed with the client", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set(["dealstage", "pipeline", "dealname", "amount"]));

    expect(result.properties.dealstage).toBeUndefined();
    expect(result.properties.pipeline).toBeUndefined();
  });

  it("writes the static Phase 1 market for the b2b store", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set(["shopify_market"]));

    expect(result.properties.shopify_market).toBe("United States");
  });

  it("writes candidate native Deal properties (dealname, amount, deal_currency_code) when confirmed to exist", () => {
    const order = buildOrder({ name: "#1042" });
    const result = mapShopifyOrderToHubSpotDeal(order, b2bStore, new Set(["dealname", "amount", "deal_currency_code"]));

    expect(result.properties.dealname).toBe("#1042");
    expect(result.properties.amount).toBe("39.98");
    expect(result.properties.deal_currency_code).toBe("USD");
  });
});
