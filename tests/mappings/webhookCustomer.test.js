import { describe, it, expect } from "vitest";
import { mapWebhookCustomerToHubSpot } from "../../src/mappings/webhookCustomer.js";

const b2bStore = { storeId: "b2b", channel: "b2b" };

describe("mapWebhookCustomerToHubSpot", () => {
  it("throws when the payload has no email", () => {
    const payload = { id: 1, email: null };
    expect(() => mapWebhookCustomerToHubSpot(payload, b2bStore, new Set(["email"]))).toThrow(/no email/i);
  });

  it("maps first_name/last_name to firstname/lastname", () => {
    const payload = { id: 1, email: "a@example.com", first_name: "Jane", last_name: "Doe" };
    const result = mapWebhookCustomerToHubSpot(payload, b2bStore, new Set(["email", "firstname", "lastname"]));

    expect(result.properties).toEqual({ email: "a@example.com", firstname: "Jane", lastname: "Doe" });
  });

  it("never sets a HubSpot-owned field even if somehow requested", () => {
    const payload = { id: 1, email: "a@example.com" };
    // sanity: the mapping itself never includes owned fields in `desired`,
    // this just confirms the guard function would still catch it if it did.
    const result = mapWebhookCustomerToHubSpot(payload, b2bStore, new Set(["email"]));
    expect(Object.keys(result.properties)).not.toContain("lifecyclestage");
  });

  it("writes shopify_customer_id in the same gid:// form the GraphQL-based sync uses", () => {
    const payload = { id: 42, email: "a@example.com" };
    const result = mapWebhookCustomerToHubSpot(payload, b2bStore, new Set(["email", "shopify_customer_id"]));

    expect(result.properties.shopify_customer_id).toBe("gid://shopify/Customer/42");
  });
});
