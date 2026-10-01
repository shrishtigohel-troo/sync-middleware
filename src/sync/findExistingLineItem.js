/**
 * Looks up whether a HubSpot Line Item record already exists for this
 * Shopify line item, via the custom `shopify_line_item_id` property.
 *
 * Without this check, re-syncing the same order would create a new line
 * item every time instead of updating the existing one - see
 * docs/object-matching-rules.md.
 *
 * Returns the matching HubSpot line item id, or undefined if not found (or
 * if `shopify_line_item_id` doesn't exist yet on the portal).
 */
export async function findExistingLineItemId(lineItemsApi, shopifyLineItemGid, existingLineItemProperties) {
  if (!shopifyLineItemGid || !existingLineItemProperties.has("shopify_line_item_id")) return undefined;

  const result = await lineItemsApi.searchByFilters([
    { propertyName: "shopify_line_item_id", operator: "EQ", value: shopifyLineItemGid },
  ]);
  return result.results[0]?.id;
}
