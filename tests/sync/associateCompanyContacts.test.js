import { describe, it, expect, vi, beforeEach } from "vitest";

const searchByFilters = vi.fn();
const update = vi.fn();
const associateRecords = vi.fn();
const getDefaultAssociationType = vi.fn();

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

    expect(result).toEqual({ associated: 2, mainContactFlagged: 1, skippedNoMatch: 0 });
    expect(associateRecords).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("hs-contact-1", { shopify_is_main_contact: "true" });
  });

  it("skips a contact with no resolvable email", async () => {
    const company = buildCompany([{ node: { id: "c1", isMainContact: false, customer: null } }]);

    const result = await associateCompanyContacts(company, "hs-company-1", new Set());

    expect(result).toEqual({ associated: 0, mainContactFlagged: 0, skippedNoMatch: 1 });
    expect(searchByFilters).not.toHaveBeenCalled();
  });

  it("skips a contact with no matching HubSpot record yet", async () => {
    const company = buildCompany([
      { node: { id: "c1", isMainContact: false, customer: { id: "cust1", email: "nobody@example.com" } } },
    ]);
    searchByFilters.mockResolvedValueOnce({ results: [] });

    const result = await associateCompanyContacts(company, "hs-company-1", new Set());

    expect(result).toEqual({ associated: 0, mainContactFlagged: 0, skippedNoMatch: 1 });
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

    expect(result).toEqual({ associated: 0, mainContactFlagged: 0, skippedNoMatch: 0 });
    expect(searchByFilters).not.toHaveBeenCalled();
  });
});
