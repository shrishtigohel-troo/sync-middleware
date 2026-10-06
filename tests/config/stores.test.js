import { describe, it, expect } from "vitest";

describe("orderKey", async () => {
  const { orderKey } = await import("../../src/config/stores.js");
  it("combines store and Shopify order id, so the same order number in two stores stays separate", () => {
    expect(orderKey({ storeId: "b2b" }, "gid://shopify/Order/1001")).toBe("b2b:gid://shopify/Order/1001");
    expect(orderKey({ storeId: "b2c" }, "gid://shopify/Order/1001")).not.toBe(orderKey({ storeId: "b2b" }, "gid://shopify/Order/1001"));
  });
});
