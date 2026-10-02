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

describe("mapWebhookOrderToHubSpot - order total, discount and shipment cards", () => {
  const all = new Set([
    "hs_subtotal_price", "hs_order_discount", "hs_tax", "hs_shipping_cost", "hs_discount_codes",
    "hs_payment_status", "hs_fulfillment_status", "hs_shipping_tracking_number", "hs_shipping_status_url",
    "hs_external_order_url", "hs_tags", "hs_shipping_address_name", "hs_shipping_address_street",
    "hs_shipping_address_city", "hs_shipping_address_state", "hs_shipping_address_country",
    "hs_shipping_address_postal_code", "hs_shipping_address_phone", "hs_billing_address_city",
  ]);
  // Values taken from order #3653 as HubSpot's native integration synced it.
  const payload = buildPayload({
    current_subtotal_price: "1168.55",
    current_total_discounts: "218.34",
    current_total_tax: "81.82",
    total_shipping_price_set: { shop_money: { amount: "0.00" } },
    discount_codes: [{ code: "FREEAPRONSPERSHARON", amount: "218.34" }],
    tags: "sales_rep_sharon558, sent-to-wms",
    order_status_url: "https://pro.difiaba.com/orders/abc",
    fulfillments: [{ tracking_numbers: ["1ZV5563D0312926285"], tracking_urls: ["https://ups.com/track/1ZV"] }],
    shipping_address: { name: "deb malone", address1: "1330 Coral Ridge Dr", address2: null, city: "Coral Springs", province: "Florida", country: "United States", zip: "33071", phone: "9543404553" },
    billing_address: { first_name: "deb", last_name: "malone", city: "Coral Springs" },
  });

  it("fills the Order total and Discount codes cards", () => {
    const p = mapWebhookOrderToHubSpot(payload, b2bStore, all).properties;
    expect(p).toMatchObject({
      hs_subtotal_price: "1168.55",
      hs_order_discount: "218.34",
      hs_tax: "81.82",
      hs_shipping_cost: "0.00",
      hs_discount_codes: "FREEAPRONSPERSHARON",
    });
  });

  it("fills the Shipment details card and addresses", () => {
    const p = mapWebhookOrderToHubSpot(payload, b2bStore, all).properties;
    expect(p).toMatchObject({
      hs_payment_status: "Paid",
      hs_fulfillment_status: "Fulfilled",
      hs_shipping_tracking_number: "1ZV5563D0312926285",
      hs_shipping_status_url: "https://ups.com/track/1ZV",
      hs_shipping_address_street: "1330 Coral Ridge Dr",
      hs_shipping_address_state: "Florida",
      hs_shipping_address_postal_code: "33071",
      hs_billing_address_city: "Coral Springs",
    });
  });

  it("writes readable status labels and skips empty values", () => {
    const p = mapWebhookOrderToHubSpot(
      buildPayload({ financial_status: "partially_paid", fulfillment_status: null, discount_codes: [], tags: "" }),
      b2bStore,
      all,
    ).properties;
    expect(p.hs_payment_status).toBe("Partially paid");
    expect(p.hs_fulfillment_status).toBe("Unfulfilled");
    expect(p.hs_discount_codes).toBeUndefined();
    expect(p.hs_tags).toBeUndefined();
    expect(p.hs_shipping_address_city).toBeUndefined();
  });
});

describe("mapWebhookLineItemToHubSpot - discounts and tax", () => {
  it("uses discount_allocations (order-level codes) for the unit discount and line total", () => {
    // Matches a #3653 line: 3 x $9.25, $3.15 discount, $0.25 tax.
    const lineItem = {
      id: 1, title: "Toner", quantity: 3, price: "9.25", total_discount: "0.00",
      discount_allocations: [{ amount: "3.15" }], tax_lines: [{ price: "0.25" }],
    };
    const p = mapWebhookLineItemToHubSpot(lineItem, new Set(["amount", "discount", "tax", "hs_line_item_currency_code"]), "USD").properties;

    expect(p).toEqual({ amount: "24.60", discount: "1.05", tax: "0.25", hs_line_item_currency_code: "USD" });
  });
});

describe("mapWebhookOrderToHubSpot - Shipped vs Delivered stage", () => {
  const props = new Set(["hs_pipeline_stage"]);
  const stageOf = (overrides) => mapWebhookOrderToHubSpot(buildPayload(overrides), b2bStore, props).properties.hs_pipeline_stage;

  it("is Shipped while the shipment is in transit, Delivered once delivered", () => {
    const inTransit = stageOf({ fulfillment_status: "fulfilled", fulfillments: [{ status: "success", shipment_status: "in_transit" }] });
    const delivered = stageOf({ fulfillment_status: "fulfilled", fulfillments: [{ status: "success", shipment_status: "delivered" }] });
    expect(inTransit).not.toBe(delivered);
    expect(stageOf({ fulfillment_status: "fulfilled", fulfillments: [{ status: "success", shipment_status: null }] })).toBe(inTransit);
  });

  it("ignores cancelled fulfillments", () => {
    const delivered = stageOf({ fulfillment_status: "fulfilled", fulfillments: [{ status: "success", shipment_status: "delivered" }] });
    expect(
      stageOf({
        fulfillment_status: "fulfilled",
        fulfillments: [{ status: "success", shipment_status: "delivered" }, { status: "cancelled", shipment_status: null }],
      }),
    ).toBe(delivered);
  });
});

describe("mapWebhookOrderToHubSpot - cancellation, closing and checkout fields", () => {
  const all = new Set([
    "hs_external_canceled_date", "hs_cancellation_reason", "hs_closed_date", "hs_refund_amount",
    "hs_external_checkout_id", "hs_buyer_accepts_marketing", "hs_external_modified_date", "hs_landing_site",
  ]);
  const map = (overrides) => mapWebhookOrderToHubSpot(buildPayload(overrides), b2bStore, all).properties;

  it("fills the cancellation fields like the native integration (#3825)", () => {
    const p = map({
      cancelled_at: "2026-10-02T07:25:28-04:00",
      cancel_reason: "customer",
      closed_at: "2026-10-02T07:25:27-04:00",
      checkout_id: 46786843705561,
      buyer_accepts_marketing: false,
      updated_at: "2026-10-02T07:25:28-04:00",
      refunds: [{ transactions: [] }],
    });
    expect(p).toMatchObject({
      hs_external_canceled_date: "2026-10-02T07:25:28-04:00",
      hs_cancellation_reason: "Customer changed/cancelled order",
      hs_external_checkout_id: "46786843705561",
      hs_buyer_accepts_marketing: "false",
      hs_external_modified_date: "2026-10-02T07:25:28-04:00",
      hs_refund_amount: "0",
    });
  });

  it("never writes Closed Date (read-only for apps), and no cancellation fields on an open order (#3826)", () => {
    const p = map({ closed_at: "2026-10-02T07:25:27-04:00", cancelled_at: null, landing_site: "/customer_authentication/redirect?locale=en-US", buyer_accepts_marketing: true });
    expect(p).not.toHaveProperty("hs_closed_date");
    expect(p).not.toHaveProperty("hs_external_canceled_date");
    expect(p).not.toHaveProperty("hs_cancellation_reason");
    expect(p.hs_landing_site).toBe("/customer_authentication/redirect?locale=en-US");
    expect(p.hs_buyer_accepts_marketing).toBe("true");
  });

  it("adds up only successful refund transactions", () => {
    const p = map({
      refunds: [
        { transactions: [{ kind: "refund", status: "success", amount: "10.00" }, { kind: "refund", status: "failure", amount: "99.00" }] },
        { transactions: [{ kind: "refund", status: "success", amount: "5.50" }] },
      ],
    });
    expect(p.hs_refund_amount).toBe("15.50");
  });

  it("keeps an unknown Shopify cancel reason as-is", () => {
    expect(map({ cancelled_at: "2026-10-02T07:25:28-04:00", cancel_reason: "something_new" }).hs_cancellation_reason).toBe("something_new");
  });
});
