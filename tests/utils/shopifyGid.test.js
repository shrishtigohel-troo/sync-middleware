import { describe, it, expect } from "vitest";
import { toShopifyGid, extractShopifyNumericId } from "../../src/utils/shopifyGid.js";

describe("toShopifyGid", () => {
  it("builds the gid:// form Shopify's Admin GraphQL API uses", () => {
    expect(toShopifyGid("Product", 123)).toBe("gid://shopify/Product/123");
    expect(toShopifyGid("ProductVariant", 456)).toBe("gid://shopify/ProductVariant/456");
    expect(toShopifyGid("Customer", 789)).toBe("gid://shopify/Customer/789");
    expect(toShopifyGid("Order", 101112)).toBe("gid://shopify/Order/101112");
  });
});

describe("extractShopifyNumericId", () => {
  it("extracts the trailing numeric id from a gid:// string", () => {
    expect(extractShopifyNumericId("gid://shopify/Order/8253945577534")).toBe("8253945577534");
    expect(extractShopifyNumericId("gid://shopify/ProductVariant/1")).toBe("1");
  });

  it("returns undefined for a non-gid string", () => {
    expect(extractShopifyNumericId("not-a-gid")).toBeUndefined();
  });

  it("round-trips with toShopifyGid", () => {
    const gid = toShopifyGid("Order", 999);
    expect(extractShopifyNumericId(gid)).toBe("999");
  });
});
