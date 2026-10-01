import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake HubSpot: companies and line items held in memory, so the helpers can
// be exercised without network calls.
const store = { companies: new Map(), lineItems: new Map(), orderLineItems: [] };

vi.mock("../../src/hubspot/associations.js", () => ({
  associateRecords: vi.fn(),
  getDefaultAssociationType: vi.fn(),
  listAssociatedObjectIds: vi.fn(async () => store.orderLineItems),
}));

vi.mock("../../src/hubspot/objects.js", () => ({
  HubSpotObjectApi: class {
    constructor(objectType) {
      this.records = objectType === "companies" ? store.companies : store.lineItems;
    }
    async getById(id) {
      return { id, properties: this.records.get(id) };
    }
    async update(id, properties) {
      Object.assign(this.records.get(id), properties);
      return { id };
    }
    async archive(id) {
      this.records.delete(id);
      store.orderLineItems = store.orderLineItems.filter((x) => x !== id);
    }
    async searchByFilters(filters) {
      const results = [...this.records.entries()]
        .filter(([, p]) =>
          filters.every((f) => (f.operator === "NOT_HAS_PROPERTY" ? !p[f.propertyName] : p[f.propertyName] === f.value)),
        )
        .map(([id]) => ({ id }));
      return { results };
    }
  },
}));

const { findCompanyRecordForLocation, removeDuplicateLineItems } = await import(
  "../../src/middleware/webhookRouter.js"
);
const { HubSpotObjectApi } = await import("../../src/hubspot/objects.js");

const COMPANY = "gid://shopify/Company/18502254809";
const LOCATION = "gid://shopify/CompanyLocation/194319450329";
const companyProps = new Set(["shopify_company_id", "shopify_location_id"]);

beforeEach(() => {
  store.companies.clear();
  store.lineItems.clear();
  store.orderLineItems = [];
});

describe("findCompanyRecordForLocation", () => {
  it("matches a company record by its shopify_location_id", async () => {
    store.companies.set("1", { shopify_company_id: COMPANY, shopify_location_id: LOCATION });
    await expect(findCompanyRecordForLocation({ companyId: COMPANY, locationId: LOCATION }, companyProps)).resolves.toBe("1");
  });

  it("adopts a legacy record that has the company id but no location id (order #3802/#3803)", async () => {
    store.companies.set("58685522055", { shopify_company_id: COMPANY, shopify_location_id: null });
    const otherLocation = "gid://shopify/CompanyLocation/1";

    const id = await findCompanyRecordForLocation({ companyId: COMPANY, locationId: otherLocation }, companyProps);

    expect(id).toBe("58685522055");
    expect(store.companies.get("58685522055").shopify_location_id).toBe(otherLocation);
  });

  it("does not adopt a record that already belongs to a different location", async () => {
    store.companies.set("2", { shopify_company_id: COMPANY, shopify_location_id: "gid://shopify/CompanyLocation/999" });
    await expect(
      findCompanyRecordForLocation({ companyId: COMPANY, locationId: "gid://shopify/CompanyLocation/2" }, companyProps),
    ).resolves.toBeUndefined();
  });
});

describe("removeDuplicateLineItems", () => {
  it("keeps the lowest id per Shopify line item and archives the rest", async () => {
    store.lineItems.set("59488127276", { shopify_line_item_id: "gid://shopify/LineItem/A" });
    store.lineItems.set("59469375001", { shopify_line_item_id: "gid://shopify/LineItem/A" });
    store.lineItems.set("59400000000", { shopify_line_item_id: "gid://shopify/LineItem/B" });
    store.orderLineItems = ["59488127276", "59469375001", "59400000000"];

    const removed = await removeDuplicateLineItems(new HubSpotObjectApi("line_items"), "order-1");

    expect(removed).toBe(1);
    expect([...store.lineItems.keys()].sort()).toEqual(["59400000000", "59469375001"]);
  });

  it("leaves line items without shopify_line_item_id alone", async () => {
    store.lineItems.set("1", { shopify_line_item_id: null });
    store.lineItems.set("2", { shopify_line_item_id: null });
    store.orderLineItems = ["1", "2"];

    await expect(removeDuplicateLineItems(new HubSpotObjectApi("line_items"), "order-1")).resolves.toBe(0);
    expect(store.lineItems.size).toBe(2);
  });
});
