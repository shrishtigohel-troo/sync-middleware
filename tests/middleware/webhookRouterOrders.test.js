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

describe("createOrUpdateOrder - one HubSpot order even when webhooks arrive at the same moment (#3830)", async () => {
  const { createOrUpdateOrder, isUniqueValueConflict } = await import("../../src/middleware/webhookRouter.js");
  const { HubSpotApiError } = await import("../../src/hubspot/client.js");
  const KEY = "b2b:gid://shopify/Order/7271";
  const conflict = () =>
    new HubSpotApiError(
      `Cannot set PropertyValueCoordinates{portalId=1, objectTypeId=ObjectTypeId{legacyObjectType=ORDER}, propertyName=shopify_order_key, value=${KEY}} on 2. 1 already has that value.`,
      400,
      "VALIDATION_ERROR",
    );

  it("recognises HubSpot's unique-value refusal, and nothing else", () => {
    expect(isUniqueValueConflict(conflict(), "shopify_order_key")).toBe(true);
    expect(isUniqueValueConflict(new HubSpotApiError("Property values were not valid", 400, "VALIDATION_ERROR"), "shopify_order_key")).toBe(false);
    expect(isUniqueValueConflict(new Error("network"), "shopify_order_key")).toBe(false);
  });

  it("updates the record another webhook just created instead of failing or duplicating", async () => {
    const api = {
      create: vi.fn().mockRejectedValue(conflict()),
      getByIdProperty: vi.fn().mockResolvedValue({ id: "1" }),
      update: vi.fn().mockResolvedValue({ id: "1" }),
    };
    await expect(createOrUpdateOrder(api, undefined, { hs_order_name: "#3830" }, KEY)).resolves.toEqual({ id: "1", operation: "update" });
    expect(api.getByIdProperty).toHaveBeenCalledWith("shopify_order_key", KEY);
    expect(api.update).toHaveBeenCalledWith("1", { hs_order_name: "#3830" });
  });

  it("still surfaces any other create error", async () => {
    const api = { create: vi.fn().mockRejectedValue(new Error("HubSpot down")), getByIdProperty: vi.fn(), update: vi.fn() };
    await expect(createOrUpdateOrder(api, undefined, {}, KEY)).rejects.toThrow("HubSpot down");
    expect(api.update).not.toHaveBeenCalled();
  });

  it("creates normally, and updates an existing record directly", async () => {
    const api = { create: vi.fn().mockResolvedValue({ id: "9" }), update: vi.fn().mockResolvedValue({ id: "5" }) };
    await expect(createOrUpdateOrder(api, undefined, {}, KEY)).resolves.toEqual({ id: "9", operation: "create" });
    await expect(createOrUpdateOrder(api, "5", {}, KEY)).resolves.toEqual({ id: "5", operation: "update" });
  });
});
