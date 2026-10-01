import { describe, it, expect } from "vitest";
import { mapShopifyCustomerToHubSpot } from "../../src/mappings/customer.js";
import { buildCustomer } from "../helpers/shopifyFixtures.js";

const b2bStore = {
  storeId: "b2b",
  channel: "b2b",
  storeUrl: "example.myshopify.com",
  accessToken: "shpat_test",
  apiVersion: "2024-10",
  webhookSecret: undefined,
};

describe("mapShopifyCustomerToHubSpot", () => {
  it("throws when the customer has no email - never falls back to a weak match", () => {
    const customer = buildCustomer({ email: null });
    expect(() => mapShopifyCustomerToHubSpot(customer, b2bStore, new Set(["email"]))).toThrow(/no email/i);
  });

  it("only includes properties that exist on the HubSpot portal", () => {
    const customer = buildCustomer();
    const result = mapShopifyCustomerToHubSpot(customer, b2bStore, new Set(["email", "firstname"]));

    expect(result.properties).toEqual({ email: "jane@example.com", firstname: "Jane" });
    expect(result.skippedMissingProperties).toEqual(
      expect.arrayContaining(["lastname", "shopify_customer_id", "shopify_store", "preferred_language"]),
    );
  });

  it("resolves preferred language from locale when the property exists", () => {
    const customer = buildCustomer({ locale: "es-MX" });
    const result = mapShopifyCustomerToHubSpot(customer, b2bStore, new Set(["email", "preferred_language"]));

    expect(result.properties.preferred_language).toBe("Spanish");
  });

  it("stores the store id as a reference property when it exists", () => {
    const customer = buildCustomer();
    const result = mapShopifyCustomerToHubSpot(customer, b2bStore, new Set(["email", "shopify_store"]));

    expect(result.properties.shopify_store).toBe("b2b");
  });
});
