import { paginate } from "../pagination.js";

const PRODUCT_FIELDS = /* GraphQL */ `
  id
  title
  descriptionHtml
  handle
  status
  onlineStoreUrl
  vendor
  productType
  category {
    fullName
  }
  tags
  collections(first: 20) {
    edges {
      node {
        title
      }
    }
  }
  featuredImage {
    url
  }
  variants(first: 50) {
    edges {
      cursor
      node {
        id
        sku
        title
        price
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
  metafields(first: 60) {
    edges {
      cursor
      node {
        namespace
        key
        value
        type
        reference {
          __typename
          ... on Metaobject { fields { key value } }
          ... on Product { title }
          ... on MediaImage { image { url } }
          ... on GenericFile { url }
        }
        references(first: 10) {
          edges {
            node {
              __typename
              ... on Metaobject { fields { key value } }
              ... on Product { title }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
`;

const GET_FIRST_ACTIVE_PRODUCT_QUERY = /* GraphQL */ `
  query GetFirstActiveProduct {
    products(first: 1, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          ${PRODUCT_FIELDS}
        }
      }
    }
  }
`;

/**
 * Fetches the single most-recently-updated active product. Used for the
 * controlled proof-of-concept sync - never fetches more than one record.
 */
export async function getFirstActiveProduct(client) {
  const data = await client.request(GET_FIRST_ACTIVE_PRODUCT_QUERY);
  return data.products.edges[0]?.node;
}

const PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query GetProductsPage($cursor: String) {
    products(first: 50, after: $cursor, query: "status:active") {
      edges {
        cursor
        node {
          ${PRODUCT_FIELDS}
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
 * Yields every active product, one at a time, paging through the whole
 * catalog. Intended for historical migration - not used by the single-record
 * PoC script.
 */
export function iterateAllActiveProducts(client) {
  return paginate(async (cursor) => {
    const data = await client.request(PRODUCTS_PAGE_QUERY, { cursor });
    return data.products;
  });
}

const GET_PRODUCT_CATEGORY_AND_METAFIELDS_QUERY = /* GraphQL */ `
  query GetProductCategoryAndMetafields($id: ID!) {
    product(id: $id) {
      category {
        fullName
      }
      collections(first: 20) {
        edges {
          node {
            title
          }
        }
      }
      metafields(first: 60) {
        edges {
          node {
            namespace
            key
            value
            type
            # The metafield's display name (e.g. "Retail Eligible"), used to
            # avoid creating a HubSpot field that duplicates an existing label.
            definition { name }
            reference {
              __typename
              ... on Metaobject { fields { key value } }
              ... on Product { title }
              ... on MediaImage { image { url } }
              ... on GenericFile { url }
            }
            references(first: 10) {
              edges {
                node {
                  __typename
                  ... on Metaobject { fields { key value } }
                  ... on Product { title }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetches just the built-in Category and metafields for one product, by its
 * gid://shopify/Product/... id. Used by the live product webhook path
 * (src/middleware/webhookRouter.js) - the standard REST product webhook
 * payload includes `vendor` directly but does NOT include the built-in
 * Category or metafields, so this makes one extra GraphQL call rather than
 * silently leaving those fields blank on live-synced products - see
 * docs/object-matching-rules.md.
 */
export async function getProductCategoryAndMetafields(client, productGid) {
  const data = await client.request(GET_PRODUCT_CATEGORY_AND_METAFIELDS_QUERY, { id: productGid });
  return {
    category: data.product?.category ?? null,
    collections: data.product?.collections.edges.map((e) => e.node.title) ?? [],
    metafields: data.product?.metafields.edges.map((e) => e.node) ?? [],
  };
}
