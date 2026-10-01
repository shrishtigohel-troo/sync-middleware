import { paginate } from "../pagination.js";

const COMPANY_FIELDS = /* GraphQL */ `
  id
  name
  note
  createdAt
  locations(first: 10) {
    edges {
      node {
        id
        name
      }
    }
  }
  contacts(first: 25) {
    edges {
      node {
        id
        isMainContact
        customer {
          id
          email
        }
      }
    }
  }
`;

const GET_FIRST_COMPANY_QUERY = /* GraphQL */ `
  query GetFirstCompany {
    companies(first: 1, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          ${COMPANY_FIELDS}
        }
      }
    }
  }
`;

/**
 * Fetches the single most-recently-updated B2B company. Used for the
 * controlled proof-of-concept sync - never fetches more than one record.
 */
export async function getFirstCompany(client) {
  const data = await client.request(GET_FIRST_COMPANY_QUERY);
  return data.companies.edges[0]?.node;
}

const COMPANIES_PAGE_QUERY = /* GraphQL */ `
  query GetCompaniesPage($cursor: String) {
    companies(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          ${COMPANY_FIELDS}
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Yields every B2B company, one at a time, paging through the whole store.
 * Intended for historical migration - not used by the single-record PoC.
 */
export function iterateAllCompanies(client) {
  return paginate(async (cursor) => {
    const data = await client.request(COMPANIES_PAGE_QUERY, { cursor });
    return data.companies;
  });
}

const GET_COMPANY_BY_ID_QUERY = /* GraphQL */ `
  query GetCompanyById($id: ID!) {
    company(id: $id) {
      ${COMPANY_FIELDS}
    }
  }
`;

/**
 * Fetches one full company (name, note, locations, contacts) by its
 * gid://shopify/Company/... id. Used by the company_locations webhook path
 * (src/middleware/webhookRouter.js) - that webhook's payload only carries a
 * location and a company_id, not the full company, so a fresh fetch is
 * needed to re-sync the company with its now-current location list.
 */
export async function getCompanyById(client, companyGid) {
  const data = await client.request(GET_COMPANY_BY_ID_QUERY, { id: companyGid });
  return data.company ?? null;
}

const GET_COMPANY_LOCATIONS_QUERY = /* GraphQL */ `
  query GetCompanyLocations($id: ID!) {
    company(id: $id) {
      locations(first: 10) {
        edges {
          node {
            name
          }
        }
      }
    }
  }
`;

/**
 * Fetches just the location names for one company, by its
 * gid://shopify/Company/... id. Used by the live company webhook path
 * (src/middleware/webhookRouter.js) - the standard REST company webhook
 * payload does not include locations, so this makes one extra GraphQL call.
 * Works the same whether the company has 1 location or many.
 */
export async function getCompanyLocationNames(client, companyGid) {
  const data = await client.request(GET_COMPANY_LOCATIONS_QUERY, { id: companyGid });
  return data.company?.locations.edges.map((e) => e.node.name) ?? [];
}
