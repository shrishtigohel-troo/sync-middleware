import { describe, it, expect } from "vitest";
import { resolveOrderMarket } from "../../src/config/stores.js";

const b2b = { storeId: "b2b" };

describe("resolveOrderMarket", () => {
  it("names the market after the client's Shopify markets", () => {
    expect(resolveOrderMarket(b2b, { countryCode: "US" })).toBe("United States");
    expect(resolveOrderMarket(b2b, { countryCode: "IT" })).toBe("Italy");
    expect(resolveOrderMarket(b2b, { countryCode: "mx" })).toBe("Mexico");
    expect(resolveOrderMarket(b2b, { countryCode: "GT" })).toBe("Guatemala");
    expect(resolveOrderMarket(b2b, { countryCode: "CR" })).toBe("Costa Rica");
  });

  it("keeps the country name for a country without a market, and the store default without an address", () => {
    expect(resolveOrderMarket(b2b, { countryCode: "CA", countryName: "Canada" })).toBe("Canada");
    expect(resolveOrderMarket(b2b, {})).toBe("United States");
  });
});

describe("orderKey", async () => {
  const { orderKey } = await import("../../src/config/stores.js");
  it("combines store and Shopify order id, so the same order number in two stores stays separate", () => {
    expect(orderKey({ storeId: "b2b" }, "gid://shopify/Order/1001")).toBe("b2b:gid://shopify/Order/1001");
    expect(orderKey({ storeId: "b2c" }, "gid://shopify/Order/1001")).not.toBe(orderKey({ storeId: "b2b" }, "gid://shopify/Order/1001"));
  });
});
