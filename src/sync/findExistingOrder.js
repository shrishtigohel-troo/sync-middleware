import { extractShopifyNumericId } from "../utils/shopifyGid.js";

/**
 * Looks up whether a HubSpot Order record already exists for this Shopify
 * order, checking TWO independent keys (either match wins):
 *
 * 1. Our own compound key: shopify_store_id + shopify_order_id
 * 2. HubSpot's native reference fields: hs_source_store + hs_external_order_id
 *    (populated by the native Shopify-HubSpot integration, if it's still
 *    running and got to this order first)
 *
 * Without checking (2), the middleware would create a duplicate Order
 * record for every order the native integration already synced - this was
 * found and fixed after a live test created exactly that duplicate. See
 * docs/object-matching-rules.md.
 *
 * `shopifyOrderGid` must be the gid://shopify/Order/... form.
 * Returns the matching HubSpot order id, or undefined if neither key matched.
 */
export async function findExistingOrderId(ordersApi, store, shopifyOrderGid, existingOrderProperties) {
  const filterGroups = [];

  if (existingOrderProperties.has("shopify_store_id") && existingOrderProperties.has("shopify_order_id")) {
    filterGroups.push([
      { propertyName: "shopify_store_id", operator: "EQ", value: store.storeId },
      { propertyName: "shopify_order_id", operator: "EQ", value: shopifyOrderGid },
    ]);
  }

  if (existingOrderProperties.has("hs_source_store") && existingOrderProperties.has("hs_external_order_id")) {
    const numericId = extractShopifyNumericId(shopifyOrderGid);
    if (numericId) {
      filterGroups.push([
        { propertyName: "hs_source_store", operator: "EQ", value: store.storeUrl },
        { propertyName: "hs_external_order_id", operator: "EQ", value: numericId },
      ]);
    }
  }

  if (filterGroups.length === 0) return undefined;

  const result = await ordersApi.searchByFilterGroups(filterGroups);
  return result.results[0]?.id;
}
