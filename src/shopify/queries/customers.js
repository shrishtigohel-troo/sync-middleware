import { paginate } from "../pagination.js";

const CUSTOMER_FIELDS = /* GraphQL */ `
  id
  email
  firstName
  lastName
  phone
  locale
  createdAt
  defaultAddress {
    country
    countryCodeV2
    province
    city
  }
`;

const GET_FIRST_CUSTOMER_QUERY = /* GraphQL */ `
  query GetFirstCustomer {
    customers(first: 1, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          ${CUSTOMER_FIELDS}
        }
      }
    }
  }
`;

/**
 * Fetches the single most-recently-updated customer. Used for the
 * controlled proof-of-concept sync - never fetches more than one record.
 */
export async function getFirstCustomer(client) {
  const data = await client.request(GET_FIRST_CUSTOMER_QUERY);
  return data.customers.edges[0]?.node;
}

const CUSTOMERS_PAGE_QUERY = /* GraphQL */ `
  query GetCustomersPage($cursor: String) {
    customers(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          ${CUSTOMER_FIELDS}
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
 * Yields every customer, one at a time, paging through the whole store.
 * Intended for historical migration - not used by the single-record PoC.
 */
export function iterateAllCustomers(client) {
  return paginate(async (cursor) => {
    const data = await client.request(CUSTOMERS_PAGE_QUERY, { cursor });
    return data.customers;
  });
}
