import { describe, it, expect } from "vitest";
import { mapWebhookCompanyToHubSpot } from "../../src/mappings/webhookCompany.js";

const b2bStore = { storeId: "b2b", channel: "b2b" };

describe("mapWebhookCompanyToHubSpot", () => {
  it("maps name and note to name/description", () => {
    const payload = { id: 1, name: "Acme Inc", note: "VIP account" };
    const result = mapWebhookCompanyToHubSpot(payload, b2bStore, new Set(["name", "description"]));

    expect(result.properties).toEqual({ name: "Acme Inc", description: "VIP account" });
  });

  it("never sets a HubSpot-owned field even if somehow requested", () => {
    const payload = { id: 1, name: "Acme Inc" };
    const result = mapWebhookCompanyToHubSpot(payload, b2bStore, new Set(["name"]));
    expect(Object.keys(result.properties)).not.toContain("lifecyclestage");
  });

  it("writes shopify_company_id in the same gid:// form the GraphQL-based sync uses", () => {
    const payload = { id: 42, name: "Acme Inc" };
    const result = mapWebhookCompanyToHubSpot(payload, b2bStore, new Set(["name", "shopify_company_id"]));

    expect(result.properties.shopify_company_id).toBe("gid://shopify/Company/42");
  });

  it("skips missing properties instead of throwing, and lists them", () => {
    const payload = { id: 1, name: "Acme Inc" };
    const result = mapWebhookCompanyToHubSpot(payload, b2bStore, new Set(["name"]));

    expect(result.properties).toEqual({ name: "Acme Inc" });
    expect(result.skippedMissingProperties).toEqual(expect.arrayContaining(["shopify_company_id", "shopify_store"]));
  });

  it("writes a single location the same way as multiple - one name, no join needed", () => {
    const payload = { id: 1, name: "Acme Inc" };
    const result = mapWebhookCompanyToHubSpot(payload, b2bStore, new Set(["shopify_locations", "shopify_location_count"]), [
      "HQ",
    ]);

    expect(result.properties.shopify_locations).toBe("HQ");
    expect(result.properties.shopify_location_count).toBe("1");
  });

  it("joins multiple location names into one multi-line field", () => {
    const payload = { id: 1, name: "Acme Inc" };
    const result = mapWebhookCompanyToHubSpot(
      payload,
      b2bStore,
      new Set(["shopify_locations", "shopify_location_count"]),
      ["US Warehouse", "MX Warehouse"],
    );

    expect(result.properties.shopify_locations).toBe("US Warehouse\nMX Warehouse");
    expect(result.properties.shopify_location_count).toBe("2");
  });

  it("skips location fields entirely when locationNames wasn't provided (lookup failed)", () => {
    const payload = { id: 1, name: "Acme Inc" };
    const result = mapWebhookCompanyToHubSpot(payload, b2bStore, new Set(["shopify_locations", "shopify_location_count"]));

    expect(result.properties.shopify_locations).toBeUndefined();
    expect(result.properties.shopify_location_count).toBeUndefined();
  });
});
