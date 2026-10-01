import { describe, it, expect } from "vitest";
import { assertNotHubSpotOwnedField } from "../../src/config/hubspotProperties.js";

describe("assertNotHubSpotOwnedField", () => {
  it("throws when writing a HubSpot-owned CRM field on contacts", () => {
    expect(() => assertNotHubSpotOwnedField("contacts", "hubspot_owner_id")).toThrow(/Refusing to write/);
    expect(() => assertNotHubSpotOwnedField("contacts", "lifecyclestage")).toThrow(/Refusing to write/);
  });

  it("throws when writing a HubSpot-owned CRM field on companies", () => {
    expect(() => assertNotHubSpotOwnedField("companies", "lifecyclestage")).toThrow(/Refusing to write/);
  });

  it("allows writing a commerce-reference field", () => {
    expect(() => assertNotHubSpotOwnedField("contacts", "shopify_customer_id")).not.toThrow();
  });

  it("allows any field on an object type with no owned-field list", () => {
    expect(() => assertNotHubSpotOwnedField("products", "shopify_product_id")).not.toThrow();
  });
});
