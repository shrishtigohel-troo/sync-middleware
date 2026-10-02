import { describe, it, expect, vi, beforeEach } from "vitest";

const request = vi.fn();
vi.mock("../../src/hubspot/client.js", () => ({ getHubSpotClient: () => ({ request }) }));

const { getDefaultAssociationType } = await import("../../src/hubspot/associations.js");

// Real label lists from the client's portal.
const LABELS = {
  "orders/companies": [
    { typeId: 509, category: "HUBSPOT_DEFINED", label: "Primary" },
    { typeId: 2692, category: "HUBSPOT_DEFINED", label: "Billing Company" },
    { typeId: 934, category: "HUBSPOT_DEFINED", label: null },
  ],
  "companies/contacts": [
    { typeId: 2, category: "HUBSPOT_DEFINED", label: "Contact with Primary Company" },
    { typeId: 280, category: "HUBSPOT_DEFINED", label: null },
    { typeId: 930, category: "HUBSPOT_DEFINED", label: "Billing Contact" },
  ],
  "orders/contacts": [
    { typeId: 2694, category: "HUBSPOT_DEFINED", label: "Billing Contact" },
    { typeId: 507, category: "HUBSPOT_DEFINED", label: null },
  ],
  "only/labeled": [{ typeId: 1, category: "HUBSPOT_DEFINED", label: "Primary" }],
};

beforeEach(() => {
  request.mockImplementation(async (_method, path) => {
    const [, , , , from, to] = path.split("/");
    return { results: LABELS[`${from}/${to}`] };
  });
});

describe("getDefaultAssociationType", () => {
  it("always picks the unlabeled type, like the native Shopify integration", async () => {
    expect(await getDefaultAssociationType("orders", "companies")).toEqual({ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 934 });
    expect(await getDefaultAssociationType("companies", "contacts")).toEqual({ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 280 });
    expect(await getDefaultAssociationType("orders", "contacts")).toEqual({ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 507 });
  });

  it("returns undefined rather than falling back to a labeled type", async () => {
    expect(await getDefaultAssociationType("only", "labeled")).toBeUndefined();
  });
});
