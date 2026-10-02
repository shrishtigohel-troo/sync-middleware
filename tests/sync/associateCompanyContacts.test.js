import { describe, it, expect, vi, beforeEach } from "vitest";

const searchByFilters = vi.fn();
const update = vi.fn();
const associateRecords = vi.fn();
const getDefaultAssociationType = vi.fn();
const listAssociatedObjectIds = vi.fn();
const removeAssociation = vi.fn();

vi.mock("../../src/hubspot/objects.js", () => ({
  HubSpotObjectApi: class {
    constructor() {
      this.searchByFilters = searchByFilters;
      this.update = update;
    }
  },
}));

vi.mock("../../src/hubspot/associations.js", () => ({
  associateRecords: (...args) => associateRecords(...args),
  getDefaultAssociationType: (...args) => getDefaultAssociationType(...args),
  listAssociatedObjectIds: (...args) => listAssociatedObjectIds(...args),
  removeAssociation: (...args) => removeAssociation(...args),
}));

const { associateCompanyContacts } = await import("../../src/sync/associateCompanyContacts.js");

function buildCompany(contactEdges) {
  return { id: "gid://shopify/Company/1", contacts: { edges: contactEdges } };
}

describe("associateCompanyContacts", () => {
  beforeEach(() => {
    searchByFilters.mockReset();
    update.mockReset();
    associateRecords.mockReset();
    getDefaultAssociationType.mockReset();
    getDefaultAssociationType.mockResolvedValue({ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 });
  });

  it("associates every contact matched by email, and flags only the main contact", async () => {
    const company = buildCompany([
      { node: { id: "c1", isMainContact: true, customer: { id: "cust1", email: "main@example.com" } } },
      { node: { id: "c2", isMainContact: false, customer: { id: "cust2", email: "other@example.com" } } },
    ]);

    searchByFilters
      .mockResolvedValueOnce({ results: [{ id: "hs-contact-1" }] })
      .mockResolvedValueOnce({ results: [{ id: "hs-contact-2" }] });

    const result = await associateCompanyContacts(company, "hs-company-1", new Set(["shopify_is_main_contact"]));

    expect(result).toEqual({ associated: 2, removed: 0, mainContactFlagged: 1, skippedNoMatch: 0 });
    expect(associateRecords).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("hs-contact-1", { shopify_is_main_contact: "true" });
  });

  it("skips a contact with no resolvable email", async () => {
    const company = buildCompany([{ node: { id: "c1", isMainContact: false, customer: null } }]);

    const result = await associateCompanyContacts(company, "hs-company-1", new Set());

    expect(result).toEqual({ associated: 0, removed: 0, mainContactFlagged: 0, skippedNoMatch: 1 });
    expect(searchByFilters).not.toHaveBeenCalled();
  });

  it("skips a contact with no matching HubSpot record yet", async () => {
    const company = buildCompany([
      { node: { id: "c1", isMainContact: false, customer: { id: "cust1", email: "nobody@example.com" } } },
    ]);
    searchByFilters.mockResolvedValueOnce({ results: [] });

    const result = await associateCompanyContacts(company, "hs-company-1", new Set());

    expect(result).toEqual({ associated: 0, removed: 0, mainContactFlagged: 0, skippedNoMatch: 1 });
    expect(associateRecords).not.toHaveBeenCalled();
  });

  it("does not flag the main contact if shopify_is_main_contact does not exist on the portal", async () => {
    const company = buildCompany([
      { node: { id: "c1", isMainContact: true, customer: { id: "cust1", email: "main@example.com" } } },
    ]);
    searchByFilters.mockResolvedValueOnce({ results: [{ id: "hs-contact-1" }] });

    const result = await associateCompanyContacts(company, "hs-company-1", new Set());

    expect(result.associated).toBe(1);
    expect(result.mainContactFlagged).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("skips everything and returns zero counts when no default association type exists", async () => {
    getDefaultAssociationType.mockResolvedValue(undefined);
    const company = buildCompany([
      { node: { id: "c1", isMainContact: true, customer: { id: "cust1", email: "main@example.com" } } },
    ]);

    const result = await associateCompanyContacts(company, "hs-company-1", new Set());

    expect(result).toEqual({ associated: 0, removed: 0, mainContactFlagged: 0, skippedNoMatch: 0 });
    expect(searchByFilters).not.toHaveBeenCalled();
  });
});

describe("associateCompanyContacts - per location (Test Single Location Co)", () => {
  // Shopify: S Treadway Ave has crm@, test123@ and testmain123@; Streetcar Ct has only test123@.
  const company = {
    id: "gid://shopify/Company/18502418649",
    contacts: {
      edges: [
        { node: { id: "cc-crm", isMainContact: false, customer: { email: "crm@piceciservices.tech" } } },
        { node: { id: "cc-test", isMainContact: false, customer: { email: "test123@gmail.com" } } },
        { node: { id: "cc-main", isMainContact: true, customer: { email: "testmain123@gmail.com" } } },
        { node: { id: "cc-none", isMainContact: false, customer: { email: "nolocation@example.com" } } },
      ],
    },
  };
  const hubspotIdByEmail = { "crm@piceciservices.tech": "h-crm", "test123@gmail.com": "h-test", "testmain123@gmail.com": "h-main", "nolocation@example.com": "h-none" };
  const locationContactIds = new Map([
    ["loc-treadway", new Set(["cc-crm", "cc-test", "cc-main"])],
    ["loc-streetcar", new Set(["cc-test"])],
  ]);

  beforeEach(() => {
    searchByFilters.mockReset();
    update.mockReset();
    associateRecords.mockReset();
    removeAssociation.mockReset();
    listAssociatedObjectIds.mockReset();
    getDefaultAssociationType.mockResolvedValue({ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 });
    searchByFilters.mockImplementation(async ([filter]) => ({ results: [{ id: hubspotIdByEmail[filter.value] }] }));
  });

  it("links only the location's own contacts and unlinks the company's other contacts", async () => {
    // Today all 3 are linked to Streetcar Ct, plus one contact linked by hand in HubSpot.
    listAssociatedObjectIds.mockResolvedValue(["h-crm", "h-test", "h-main", "h-manual"]);

    const result = await associateCompanyContacts(company, "streetcar-record", new Set(["shopify_is_main_contact"]), {
      locationGid: "loc-streetcar",
      locationContactIds,
    });

    const linked = associateRecords.mock.calls.map((c) => c[3]);
    expect(linked).toEqual(["h-test", "h-none"]); // its own contact, plus the contact assigned to no location
    expect(removeAssociation.mock.calls.map((c) => c[3]).sort()).toEqual(["h-crm", "h-main"]);
    expect(removeAssociation.mock.calls.map((c) => c[3])).not.toContain("h-manual");
    expect(result).toMatchObject({ associated: 2, removed: 2 });
  });

  it("keeps all 3 contacts on S Treadway Ave", async () => {
    listAssociatedObjectIds.mockResolvedValue(["h-crm", "h-test", "h-main"]);

    await associateCompanyContacts(company, "treadway-record", new Set(), { locationGid: "loc-treadway", locationContactIds });

    expect(associateRecords.mock.calls.map((c) => c[3]).sort()).toEqual(["h-crm", "h-main", "h-none", "h-test"]);
    expect(removeAssociation).not.toHaveBeenCalled();
  });
});
