import { describe, it, expect } from "vitest";
import { mapWebhookOrderToHubSpot, mapWebhookLineItemToHubSpot } from "../../src/mappings/webhookOrder.js";

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

describe("mapWebhookOrderToHubSpot", () => {
  it("writes the compound-key fields", () => {
    const payload = buildPayload();
    const result = mapWebhookOrderToHubSpot(payload, b2bStore, new Set(["shopify_store_id", "shopify_order_id"]));

    expect(result.properties.shopify_store_id).toBe("b2b");
    expect(result.properties.shopify_order_id).toBe("gid://shopify/Order/5001");
  });

  it("keeps the same order number distinct across two stores", () => {
    const payloadB2b = buildPayload({ id: 5001 });
    const payloadB2c = buildPayload({ id: 9001 });
    const existing = new Set(["shopify_store_id", "shopify_order_id"]);

    const resultB2b = mapWebhookOrderToHubSpot(payloadB2b, b2bStore, existing);
    const resultB2c = mapWebhookOrderToHubSpot(payloadB2c, b2cStore, existing);

    expect(resultB2b.properties.shopify_order_id).not.toBe(resultB2c.properties.shopify_order_id);
  });

  it("flags a cancelled order", () => {
    const payload = buildPayload({ cancelled_at: "2026-01-01T00:00:00Z", financial_status: "refunded" });
    const result = mapWebhookOrderToHubSpot(
      payload,
      b2bStore,
      new Set(["shopify_cancelled", "shopify_financial_status"]),
    );

    expect(result.properties.shopify_cancelled).toBe("true");
    expect(result.properties.shopify_financial_status).toBe("refunded");
  });

  it("preserves the original currency", () => {
    const payload = buildPayload({ currency: "EUR" });
    const result = mapWebhookOrderToHubSpot(payload, b2bStore, new Set(["shopify_original_currency"]));

    expect(result.properties.shopify_original_currency).toBe("EUR");
  });

  it("writes shopify_order_id in the same gid:// form the GraphQL-based sync uses", () => {
    const payload = buildPayload({ id: 5001 });
    const result = mapWebhookOrderToHubSpot(payload, b2bStore, new Set(["shopify_order_id"]));

    expect(result.properties.shopify_order_id).toBe("gid://shopify/Order/5001");
  });

  it("also writes HubSpot's native reference fields, so a native-integration record can be found instead of duplicated", () => {
    const payload = buildPayload({ id: 5001 });
    const result = mapWebhookOrderToHubSpot(payload, b2bStore, new Set(["hs_external_order_id", "hs_source_store"]));

    expect(result.properties.hs_external_order_id).toBe("5001");
    expect(result.properties.hs_source_store).toBe("example.myshopify.com");
  });

  it("writes the static Phase 1 market for the b2b store", () => {
    const payload = buildPayload();
    const result = mapWebhookOrderToHubSpot(payload, b2bStore, new Set(["shopify_market"]));

    expect(result.properties.shopify_market).toBe("United States");
  });

  it("omits market entirely for a store with no confirmed market yet", () => {
    const payload = buildPayload();
    const result = mapWebhookOrderToHubSpot(payload, b2cStore, new Set(["shopify_market"]));

    expect(result.properties.shopify_market).toBeUndefined();
  });
});

describe("mapWebhookLineItemToHubSpot", () => {
  it("computes the discounted line total", () => {
    const lineItem = { id: 1, title: "Hat", quantity: 2, price: "20.00", total_discount: "5.00", sku: "HAT-1", variant_id: 99 };
    const result = mapWebhookLineItemToHubSpot(lineItem, new Set(["name", "quantity", "price", "amount"]));

    expect(result.properties.amount).toBe("35.00");
    expect(result.properties.quantity).toBe("2");
  });

  it("handles no discount", () => {
    const lineItem = { id: 1, title: "Hat", quantity: 1, price: "10.00", sku: null, variant_id: null };
    const result = mapWebhookLineItemToHubSpot(lineItem, new Set(["amount"]));

    expect(result.properties.amount).toBe("10.00");
  });

  it("writes shopify_variant_id in the same gid:// form the GraphQL-based sync uses", () => {
    const lineItem = { id: 1, title: "Hat", quantity: 1, price: "10.00", sku: "HAT-1", variant_id: 999 };
    const result = mapWebhookLineItemToHubSpot(lineItem, new Set(["shopify_variant_id"]));

    expect(result.properties.shopify_variant_id).toBe("gid://shopify/ProductVariant/999");
  });

  it("writes shopify_line_item_id in the same gid:// form the GraphQL-based sync uses", () => {
    const lineItem = { id: 17825698349118, title: "Hat", quantity: 1, price: "10.00", sku: "HAT-1", variant_id: 999 };
    const result = mapWebhookLineItemToHubSpot(lineItem, new Set(["shopify_line_item_id"]));

    expect(result.properties.shopify_line_item_id).toBe("gid://shopify/LineItem/17825698349118");
  });
});
