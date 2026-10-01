import { describe, it, expect, vi } from "vitest";
import { findExistingLineItemId } from "../../src/sync/findExistingLineItem.js";

function buildLineItemsApi(searchResult) {
  return { searchByFilters: vi.fn().mockResolvedValue(searchResult) };
}

describe("findExistingLineItemId", () => {
  it("searches by shopify_line_item_id and returns the matching id", async () => {
    const lineItemsApi = buildLineItemsApi({ results: [{ id: "555" }] });
    const result = await findExistingLineItemId(
      lineItemsApi,
      "gid://shopify/LineItem/12345",
      new Set(["shopify_line_item_id"]),
    );

    expect(result).toBe("555");
    expect(lineItemsApi.searchByFilters).toHaveBeenCalledWith([
      { propertyName: "shopify_line_item_id", operator: "EQ", value: "gid://shopify/LineItem/12345" },
    ]);
  });

  it("returns undefined without calling the API when shopify_line_item_id isn't confirmed to exist", async () => {
    const lineItemsApi = buildLineItemsApi({ results: [] });
    const result = await findExistingLineItemId(lineItemsApi, "gid://shopify/LineItem/12345", new Set());

    expect(result).toBeUndefined();
    expect(lineItemsApi.searchByFilters).not.toHaveBeenCalled();
  });

  it("returns undefined when no id is provided", async () => {
    const lineItemsApi = buildLineItemsApi({ results: [] });
    const result = await findExistingLineItemId(lineItemsApi, undefined, new Set(["shopify_line_item_id"]));

    expect(result).toBeUndefined();
    expect(lineItemsApi.searchByFilters).not.toHaveBeenCalled();
  });

  it("returns undefined when the search finds nothing", async () => {
    const lineItemsApi = buildLineItemsApi({ results: [] });
    const result = await findExistingLineItemId(
      lineItemsApi,
      "gid://shopify/LineItem/12345",
      new Set(["shopify_line_item_id"]),
    );

    expect(result).toBeUndefined();
  });
});
