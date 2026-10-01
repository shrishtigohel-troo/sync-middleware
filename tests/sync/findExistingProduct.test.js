import { describe, it, expect, vi } from "vitest";
import { findExistingProductId } from "../../src/sync/findExistingProduct.js";

function fakeProductsApi({ byVariant, bySku }) {
  return {
    searchByFilters: vi.fn(async (filters) => {
      const filter = filters[0];
      if (filter.propertyName === "shopify_variant_id") {
        return { results: byVariant ? [{ id: byVariant }] : [] };
      }
      if (filter.propertyName === "hs_sku") {
        return { results: bySku ? [{ id: bySku }] : [] };
      }
      return { results: [] };
    }),
  };
}

describe("findExistingProductId", () => {
  it("matches by shopify_variant_id when found", async () => {
    const api = fakeProductsApi({ byVariant: "111" });
    const id = await findExistingProductId(api, "gid://shopify/ProductVariant/1", "SKU-1", new Set(["shopify_variant_id", "hs_sku"]));
    expect(id).toBe("111");
  });

  it("falls back to SKU match when shopify_variant_id finds nothing - the native-integration-record case", async () => {
    const api = fakeProductsApi({ byVariant: undefined, bySku: "222" });
    const id = await findExistingProductId(api, "gid://shopify/ProductVariant/1", "SKU-1", new Set(["shopify_variant_id", "hs_sku"]));
    expect(id).toBe("222");
  });

  it("prefers the shopify_variant_id match over SKU when both would match", async () => {
    const api = fakeProductsApi({ byVariant: "111", bySku: "222" });
    const id = await findExistingProductId(api, "gid://shopify/ProductVariant/1", "SKU-1", new Set(["shopify_variant_id", "hs_sku"]));
    expect(id).toBe("111");
    // SKU search should never even run once the variant match already won.
    expect(api.searchByFilters).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when neither key matches", async () => {
    const api = fakeProductsApi({});
    const id = await findExistingProductId(api, "gid://shopify/ProductVariant/1", "SKU-1", new Set(["shopify_variant_id", "hs_sku"]));
    expect(id).toBeUndefined();
  });

  it("skips the SKU search entirely when no sku is provided", async () => {
    const api = fakeProductsApi({});
    await findExistingProductId(api, "gid://shopify/ProductVariant/1", undefined, new Set(["shopify_variant_id", "hs_sku"]));
    expect(api.searchByFilters).toHaveBeenCalledTimes(1);
  });

  it("skips both searches when neither property exists on the portal yet", async () => {
    const api = fakeProductsApi({});
    const id = await findExistingProductId(api, "gid://shopify/ProductVariant/1", "SKU-1", new Set());
    expect(id).toBeUndefined();
    expect(api.searchByFilters).not.toHaveBeenCalled();
  });
});
