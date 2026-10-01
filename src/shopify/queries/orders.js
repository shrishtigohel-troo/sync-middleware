import { paginate } from "../pagination.js";

const ORDER_FIELDS = /* GraphQL */ `
  id
  name
  createdAt
  displayFinancialStatus
  displayFulfillmentStatus
  cancelledAt
  currentTotalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  customer {
    id
    email
  }
  purchasingEntity {
    __typename
    ... on PurchasingCompany {
      company {
        id
        name
      }
      location {
        id
      }
    }
  }
  lineItems(first: 50) {
    edges {
      node {
        id
        title
        quantity
        sku
        variant {
          id
        }
        originalUnitPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        discountedTotalSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

const GET_FIRST_ORDER_QUERY = /* GraphQL */ `
  query GetFirstOrder {
    orders(first: 1, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          ${ORDER_FIELDS}
        }
      }
    }
  }
`;

/**
 * Fetches the single most-recently-updated order. Used for the controlled
 * proof-of-concept sync - never fetches more than one record.
 *
 * Requires Protected Customer Data approval on the Shopify store to read
 * customer.email (see docs/object-matching-rules.md) - confirmed available
 * on Shopify Plus stores, which this project is scoped to.
 */
export async function getFirstOrder(client) {
  const data = await client.request(GET_FIRST_ORDER_QUERY);
  return data.orders.edges[0]?.node;
}

const ORDERS_PAGE_QUERY = /* GraphQL */ `
  query GetOrdersPage($cursor: String) {
    orders(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          ${ORDER_FIELDS}
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
 * Yields every order, one at a time, paging through the whole store.
 * Intended for historical migration - not used by the single-record PoC.
 */
export function iterateAllOrders(client) {
  return paginate(async (cursor) => {
    const data = await client.request(ORDERS_PAGE_QUERY, { cursor });
    return data.orders;
  });
}

const GET_ORDER_PURCHASING_COMPANY_QUERY = /* GraphQL */ `
  query GetOrderPurchasingCompany($id: ID!) {
    order(id: $id) {
      purchasingEntity {
        __typename
        ... on PurchasingCompany {
          company {
            id
            name
          }
          location {
            id
          }
        }
      }
    }
  }
`;

/**
 * Fetches just the B2B purchasing company LOCATION (if any) for one order,
 * by its gid://shopify/Order/... id. Used by the live webhook path
 * (src/middleware/webhookRouter.js) to associate the Order to its Company,
 * since the standard REST order webhook payload does not reliably include
 * this - see docs/object-matching-rules.md.
 *
 * Returns the Shopify Company Location id (gid:// form), NOT the company id -
 * each Shopify Company Location has its own separate HubSpot Company record
 * (see src/mappings/companyLocation.js), so the order must be matched to the
 * specific location it was placed under, not just "the company" in general
 * (which is now ambiguous - one Shopify Company can have several HubSpot
 * records, one per location). Returns undefined if this order has no B2B
 * purchasing company, or if the purchasing company has no location on the
 * order (rare, but defensively handled).
 */
export async function getOrderPurchasingLocationId(client, orderGid) {
  const data = await client.request(GET_ORDER_PURCHASING_COMPANY_QUERY, { id: orderGid });
  const entity = data.order?.purchasingEntity;
  return entity?.__typename === "PurchasingCompany" ? entity.location?.id : undefined;
}
