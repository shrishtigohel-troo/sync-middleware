import { describe, it, expect } from "vitest";
import { mapShopifyLineItemToHubSpot } from "../../src/mappings/lineItem.js";
import { buildLineItem } from "../helpers/shopifyFixtures.js";

describe("mapShopifyLineItemToHubSpot", () => {
  it("maps quantity, price and amount when those properties exist", () => {
    const lineItem = buildLineItem();
    const result = mapShopifyLineItemToHubSpot(lineItem, new Set(["name", "quantity", "price", "amount"]));

    expect(result.properties).toEqual({
      name: "Hat",
      quantity: "2",
      price: "19.99",
      amount: "39.98",
    });
  });

  it("omits sku and variant reference when their properties don't exist", () => {
    const lineItem = buildLineItem();
    const result = mapShopifyLineItemToHubSpot(lineItem, new Set(["name"]));

    expect(result.properties.hs_sku).toBeUndefined();
    expect(result.properties.shopify_variant_id).toBeUndefined();
    expect(result.skippedMissingProperties).toEqual(
      expect.arrayContaining(["quantity", "price", "amount", "hs_sku", "shopify_variant_id"]),
    );
  });

  it("handles a line item with no variant (e.g. a custom/manual line item)", () => {
    const lineItem = buildLineItem({ variant: null, sku: null });
    const result = mapShopifyLineItemToHubSpot(lineItem, new Set(["shopify_variant_id", "hs_sku"]));

    expect(result.properties.shopify_variant_id).toBeUndefined();
    expect(result.properties.hs_sku).toBeUndefined();
  });

  it("writes shopify_line_item_id (custom property) so re-syncing the same order is idempotent", () => {
    const lineItem = buildLineItem({ id: "gid://shopify/LineItem/17825698349118" });
    const result = mapShopifyLineItemToHubSpot(lineItem, new Set(["shopify_line_item_id"]));

    expect(result.properties.shopify_line_item_id).toBe("gid://shopify/LineItem/17825698349118");
  });
});
