import { describe, it, expect } from "vitest";
import { mapShopifyCompanyToHubSpot } from "../../src/mappings/company.js";
import { buildCompany, connectionOf } from "../helpers/shopifyFixtures.js";

const b2bStore = {
  storeId: "b2b",
  channel: "b2b",
  storeUrl: "example.myshopify.com",
  accessToken: "shpat_test",
  apiVersion: "2024-10",
  webhookSecret: undefined,
};

describe("mapShopifyCompanyToHubSpot", () => {
  it("only includes properties that exist on the HubSpot portal", () => {
    const company = buildCompany();
    const result = mapShopifyCompanyToHubSpot(company, b2bStore, new Set(["name"]));

    expect(result.properties).toEqual({ name: "Acme Corp" });
    expect(result.skippedMissingProperties).toEqual(
      expect.arrayContaining(["description", "shopify_company_id", "shopify_store"]),
    );
  });

  it("writes shopify_company_id when the property exists - this is the only valid match key", () => {
    const company = buildCompany();
    const result = mapShopifyCompanyToHubSpot(company, b2bStore, new Set(["name", "shopify_company_id"]));

    expect(result.properties.shopify_company_id).toBe(company.id);
  });

  it("never uses company name as a substitute for shopify_company_id", () => {
    const company = buildCompany({ name: "Ambiguous Name Inc" });
    const result = mapShopifyCompanyToHubSpot(company, b2bStore, new Set(["name"]));

    // name is written for display purposes, but shopify_company_id is absent
    // from the existing-properties set here, so it must be skipped - not
    // silently substituted with name-based matching inside the mapping itself.
    expect(result.properties.shopify_company_id).toBeUndefined();
    expect(result.skippedMissingProperties).toContain("shopify_company_id");
  });

  it("writes a single location the same way as multiple - one name, no join needed", () => {
    const company = buildCompany({ locations: connectionOf([{ id: "gid://shopify/CompanyLocation/1", name: "HQ" }]) });
    const result = mapShopifyCompanyToHubSpot(company, b2bStore, new Set(["shopify_locations", "shopify_location_count"]));

    expect(result.properties.shopify_locations).toBe("HQ");
    expect(result.properties.shopify_location_count).toBe("1");
  });

  it("joins multiple location names into one multi-line field", () => {
    const company = buildCompany({
      locations: connectionOf([
        { id: "gid://shopify/CompanyLocation/1", name: "US Warehouse" },
        { id: "gid://shopify/CompanyLocation/2", name: "MX Warehouse" },
        { id: "gid://shopify/CompanyLocation/3", name: "Italy Warehouse" },
      ]),
    });
    const result = mapShopifyCompanyToHubSpot(company, b2bStore, new Set(["shopify_locations", "shopify_location_count"]));

    expect(result.properties.shopify_locations).toBe("US Warehouse\nMX Warehouse\nItaly Warehouse");
    expect(result.properties.shopify_location_count).toBe("3");
  });

  it("still writes a count of 0 when there are no locations, but skips the locations field itself", () => {
    const company = buildCompany({ locations: connectionOf([]) });
    const result = mapShopifyCompanyToHubSpot(company, b2bStore, new Set(["shopify_locations", "shopify_location_count"]));

    expect(result.properties.shopify_locations).toBeUndefined();
    expect(result.properties.shopify_location_count).toBe("0");
  });
});
