import { describe, it, expect } from "vitest";
import { mapCompanyLocationToHubSpot } from "../../src/mappings/companyLocation.js";

const store = { storeId: "b2b" };

describe("mapCompanyLocationToHubSpot", () => {
  it("names the record '<company> (<location>)'", () => {
    const existing = new Set(["name", "description", "shopify_company_id", "shopify_location_id", "shopify_store"]);
    const result = mapCompanyLocationToHubSpot(
      {
        companyName: "Test Company",
        companyNote: "Key account",
        companyGid: "gid://shopify/Company/1",
        locationGid: "gid://shopify/CompanyLocation/1",
        locationName: "Downtown",
      },
      store,
      existing,
    );

    expect(result.properties.name).toBe("Test Company (Downtown)");
    expect(result.properties.shopify_company_id).toBe("gid://shopify/Company/1");
    expect(result.properties.shopify_location_id).toBe("gid://shopify/CompanyLocation/1");
    expect(result.properties.description).toBe("Key account");
  });

  it("omits description when companyNote is not provided", () => {
    const existing = new Set(["name", "shopify_location_id"]);
    const result = mapCompanyLocationToHubSpot(
      {
        companyName: "Test Company",
        companyNote: undefined,
        companyGid: "gid://shopify/Company/1",
        locationGid: "gid://shopify/CompanyLocation/1",
        locationName: "Downtown",
      },
      store,
      existing,
    );

    expect(result.properties.description).toBeUndefined();
  });

  it("only writes properties that exist on the portal", () => {
    const existing = new Set(["name"]);
    const result = mapCompanyLocationToHubSpot(
      {
        companyName: "Test Company",
        companyNote: undefined,
        companyGid: "gid://shopify/Company/1",
        locationGid: "gid://shopify/CompanyLocation/1",
        locationName: "Downtown",
      },
      store,
      existing,
    );

    expect(result.properties.shopify_location_id).toBeUndefined();
    expect(result.skippedMissingProperties).toContain("shopify_location_id");
  });
});
