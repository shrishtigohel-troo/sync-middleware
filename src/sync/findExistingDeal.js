/**
 * Looks up whether a HubSpot Deal already exists for this Shopify order,
 * matched by the same compound key used for Orders (Shopify Store ID +
 * Shopify Order ID - see docs/object-matching-rules.md and
 * src/mappings/deal.js).
 *
 * Unlike src/sync/findExistingOrder.js, there is no second "native
 * integration" key to check - the native Shopify-HubSpot integration does
 * not sync to Deals.
 *
 * `shopifyOrderGid` must be the gid://shopify/Order/... form.
 * Returns the matching HubSpot deal id, or undefined if not found.
 */
export async function findExistingDealId(dealsApi, store, shopifyOrderGid, existingDealProperties) {
  if (!existingDealProperties.has("shopify_store_id") || !existingDealProperties.has("shopify_order_id")) {
    return undefined;
  }

  const result = await dealsApi.searchByFilters([
    { propertyName: "shopify_store_id", operator: "EQ", value: store.storeId },
    { propertyName: "shopify_order_id", operator: "EQ", value: shopifyOrderGid },
  ]);
  return result.results[0]?.id;
}
