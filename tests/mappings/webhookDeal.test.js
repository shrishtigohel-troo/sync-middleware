import { describe, it, expect } from "vitest";
import { mapWebhookOrderToHubSpotDeal } from "../../src/mappings/webhookDeal.js";

const b2bStore = { storeId: "b2b", channel: "b2b", storeUrl: "example.myshopify.com" };
const b2cStore = { storeId: "b2c", channel: "b2c", storeUrl: "example.myshopify.com" };

function buildPayload(overrides = {}) {
  return {
    id: 5001,
    name: "#1001",
    currency: "USD",
    current_total_price: "39.98",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    cancelled_at: null,
    line_items: [],
    ...overrides,
  };
}

describe("mapWebhookOrderToHubSpotDeal", () => {
  it("writes the compound-key fields", () => {
    const payload = buildPayload();
    const result = mapWebhookOrderToHubSpotDeal(payload, b2bStore, new Set(["shopify_store_id", "shopify_order_id"]));

    expect(result.properties.shopify_store_id).toBe("b2b");
    expect(result.properties.shopify_order_id).toBe("gid://shopify/Order/5001");
  });

  it("keeps the same order number distinct across two stores", () => {
    const payloadB2b = buildPayload({ id: 5001 });
    const payloadB2c = buildPayload({ id: 9001 });
    const existing = new Set(["shopify_store_id", "shopify_order_id"]);

    const resultB2b = mapWebhookOrderToHubSpotDeal(payloadB2b, b2bStore, existing);
    const resultB2c = mapWebhookOrderToHubSpotDeal(payloadB2c, b2cStore, existing);

    expect(resultB2b.properties.shopify_order_id).not.toBe(resultB2c.properties.shopify_order_id);
  });

  it("flags a cancelled order", () => {
    const payload = buildPayload({ cancelled_at: "2026-01-01T00:00:00Z", financial_status: "refunded" });
    const result = mapWebhookOrderToHubSpotDeal(payload, b2bStore, new Set(["shopify_cancelled", "shopify_financial_status"]));

    expect(result.properties.shopify_cancelled).toBe("true");
    expect(result.properties.shopify_financial_status).toBe("refunded");
  });

  it("writes candidate native Deal properties when confirmed to exist", () => {
    const payload = buildPayload();
    const result = mapWebhookOrderToHubSpotDeal(payload, b2bStore, new Set(["dealname", "amount", "deal_currency_code"]));

    expect(result.properties.dealname).toBe("#1001");
    expect(result.properties.amount).toBe("39.98");
    expect(result.properties.deal_currency_code).toBe("USD");
  });

  it("writes shopify_order_id in the same gid:// form the GraphQL-based sync uses", () => {
    const payload = buildPayload({ id: 5001 });
    const result = mapWebhookOrderToHubSpotDeal(payload, b2bStore, new Set(["shopify_order_id"]));

    expect(result.properties.shopify_order_id).toBe("gid://shopify/Order/5001");
  });

  it("writes the static Phase 1 market for the b2b store", () => {
    const payload = buildPayload();
    const result = mapWebhookOrderToHubSpotDeal(payload, b2bStore, new Set(["shopify_market"]));

    expect(result.properties.shopify_market).toBe("United States");
  });
});
