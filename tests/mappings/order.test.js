import { describe, it, expect } from "vitest";
import { mapShopifyOrderToHubSpot } from "../../src/mappings/order.js";
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

describe("mapShopifyOrderToHubSpot", () => {
  it("writes the compound-key fields when both properties exist", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set(["shopify_store_id", "shopify_order_id"]));

    expect(result.properties.shopify_store_id).toBe("b2b");
    expect(result.properties.shopify_order_id).toBe(order.id);
  });

  it("preserves the original currency without conversion", () => {
    const order = buildOrder({ currentTotalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "EUR" } } });
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set(["shopify_original_currency", "hs_total_price"]));

    expect(result.properties.shopify_original_currency).toBe("EUR");
    expect(result.properties.hs_total_price).toBe("100.00");
  });

  it("does not throw on an unsupported currency - it still preserves the value", () => {
    const order = buildOrder({ currentTotalPriceSet: { shopMoney: { amount: "50.00", currencyCode: "JPY" } } });
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set(["shopify_original_currency"]));

    expect(result.properties.shopify_original_currency).toBe("JPY");
  });

  it("produces the same order id for two different stores' same order number without colliding", () => {
    const orderB2b = buildOrder({ id: "gid://shopify/Order/b2b-1001", name: "#1001" });
    const orderB2c = buildOrder({ id: "gid://shopify/Order/b2c-1001", name: "#1001" });

    const existing = new Set(["shopify_store_id", "shopify_order_id"]);
    const resultB2b = mapShopifyOrderToHubSpot(orderB2b, b2bStore, existing);
    const resultB2c = mapShopifyOrderToHubSpot(orderB2c, b2cStore, existing);

    expect(resultB2b.properties.shopify_store_id).toBe("b2b");
    expect(resultB2c.properties.shopify_store_id).toBe("b2c");
    expect(resultB2b.properties.shopify_order_id).not.toBe(resultB2c.properties.shopify_order_id);
  });

  it("skips fields whose HubSpot property does not exist yet", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set());

    expect(result.properties).toEqual({});
    expect(result.skippedMissingProperties.length).toBeGreaterThan(0);
  });

  it("flags a cancelled order rather than dropping it", () => {
    const order = buildOrder({ cancelledAt: "2026-02-01T00:00:00Z", displayFinancialStatus: "REFUNDED" });
    const result = mapShopifyOrderToHubSpot(
      order,
      b2bStore,
      new Set(["shopify_cancelled", "shopify_financial_status", "shopify_fulfillment_status"]),
    );

    expect(result.properties.shopify_cancelled).toBe("true");
    expect(result.properties.shopify_financial_status).toBe("REFUNDED");
    expect(result.properties.shopify_fulfillment_status).toBe(order.displayFulfillmentStatus);
  });

  it("marks a non-cancelled order as not cancelled", () => {
    const order = buildOrder({ cancelledAt: null });
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set(["shopify_cancelled"]));

    expect(result.properties.shopify_cancelled).toBe("false");
  });

  it("also writes HubSpot's native reference fields, so a native-integration record can be found instead of duplicated", () => {
    const order = buildOrder({ id: "gid://shopify/Order/8253945577534" });
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set(["hs_external_order_id", "hs_source_store"]));

    expect(result.properties.hs_external_order_id).toBe("8253945577534");
    expect(result.properties.hs_source_store).toBe("example.myshopify.com");
  });

  it("writes the static Phase 1 market for the b2b store", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpot(order, b2bStore, new Set(["shopify_market"]));

    expect(result.properties.shopify_market).toBe("United States");
  });

  it("omits market entirely for a store with no confirmed market yet", () => {
    const order = buildOrder();
    const result = mapShopifyOrderToHubSpot(order, b2cStore, new Set(["shopify_market"]));

    expect(result.properties.shopify_market).toBeUndefined();
  });
});
