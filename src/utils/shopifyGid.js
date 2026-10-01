/**
 * Shopify's Admin GraphQL API returns IDs as global IDs, e.g.
 * "gid://shopify/Product/123". Shopify's REST webhook payloads give the
 * same underlying record's ID as a plain number, e.g. 123.
 *
 * Every HubSpot reference property this middleware writes (shopify_product_id,
 * shopify_variant_id, shopify_customer_id, shopify_order_id) is populated
 * from the GraphQL-based sync paths using the gid:// form - so webhook
 * handlers MUST convert the numeric REST id to the same gid:// form before
 * writing or searching, or duplicate-prevention silently breaks (a search
 * for the plain number will never match a stored gid:// value).
 */
export function toShopifyGid(resourceType, numericId) {
  return `gid://shopify/${resourceType}/${numericId}`;
}

/**
 * Extracts the trailing numeric id from a gid:// string, e.g.
 * "gid://shopify/Order/8253945577534" -> "8253945577534". Used to match
 * against HubSpot's own native reference fields (e.g. `hs_external_order_id`),
 * which store the plain numeric form, not the gid:// form - see
 * docs/object-matching-rules.md for why both forms need to be checked.
 */
export function extractShopifyNumericId(gid) {
  const match = /\/(\d+)$/.exec(gid);
  return match ? match[1] : undefined;
}
