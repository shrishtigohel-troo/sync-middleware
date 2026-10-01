import { describe, it, expect, vi } from "vitest";
import { findExistingOrderId } from "../../src/sync/findExistingOrder.js";

const store = { storeId: "b2b", storeUrl: "example.myshopify.com" };

function buildOrdersApi(searchResult) {
  return { searchByFilterGroups: vi.fn().mockResolvedValue(searchResult) };
}

describe("findExistingOrderId", () => {
  it("checks both the compound key and HubSpot's native reference fields", async () => {
    const ordersApi = buildOrdersApi({ results: [{ id: "123" }] });
    const existingProperties = new Set([
      "shopify_store_id",
      "shopify_order_id",
      "hs_source_store",
      "hs_external_order_id",
    ]);

    const result = await findExistingOrderId(ordersApi, store, "gid://shopify/Order/999", existingProperties);

    expect(result).toBe("123");
    const filterGroups = ordersApi.searchByFilterGroups.mock.calls[0][0];
    expect(filterGroups).toHaveLength(2);
    expect(filterGroups[0]).toEqual([
      { propertyName: "shopify_store_id", operator: "EQ", value: "b2b" },
      { propertyName: "shopify_order_id", operator: "EQ", value: "gid://shopify/Order/999" },
    ]);
    expect(filterGroups[1]).toEqual([
      { propertyName: "hs_source_store", operator: "EQ", value: "example.myshopify.com" },
      { propertyName: "hs_external_order_id", operator: "EQ", value: "999" },
    ]);
  });

  it("only checks the native fields when our own compound-key properties don't exist yet", async () => {
    const ordersApi = buildOrdersApi({ results: [] });
    const existingProperties = new Set(["hs_source_store", "hs_external_order_id"]);

    await findExistingOrderId(ordersApi, store, "gid://shopify/Order/999", existingProperties);

    const filterGroups = ordersApi.searchByFilterGroups.mock.calls[0][0];
    expect(filterGroups).toHaveLength(1);
    expect(filterGroups[0][0].propertyName).toBe("hs_source_store");
  });

  it("returns undefined without calling the API when neither key set exists", async () => {
    const ordersApi = buildOrdersApi({ results: [] });
    const result = await findExistingOrderId(ordersApi, store, "gid://shopify/Order/999", new Set());

    expect(result).toBeUndefined();
    expect(ordersApi.searchByFilterGroups).not.toHaveBeenCalled();
  });

  it("returns undefined when no group matches", async () => {
    const ordersApi = buildOrdersApi({ results: [] });
    const existingProperties = new Set(["shopify_store_id", "shopify_order_id"]);

    const result = await findExistingOrderId(ordersApi, store, "gid://shopify/Order/999", existingProperties);

    expect(result).toBeUndefined();
  });
});
