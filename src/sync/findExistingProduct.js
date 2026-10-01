/**
 * Looks up whether a HubSpot Product record already exists for this
 * Shopify variant, checking TWO independent keys (either match wins):
 *
 * 1. Our own key: shopify_variant_id
 * 2. SKU (hs_sku) - the only reliable cross-reference available for
 *    records the native Shopify-HubSpot integration (or anyone else)
 *    created without any Shopify ID field. Unlike Orders
 *    (hs_external_order_id/hs_source_store), Products have no dedicated
 *    native reference field - confirmed live: a native-synced product had
 *    no shopify_* fields populated at all, only name/description/price/sku.
 *
 * Without checking (2), the middleware creates a second Product record for
 * anything the native integration already synced, and then fails outright
 * when trying to write hs_sku - HubSpot enforces SKU uniqueness, and the
 * native record already holds it. Found live: a real "Cannot set ... hs_sku
 * ... already has that value" error on the client's real store - see
 * docs/object-matching-rules.md.
 *
 * shopify_variant_id is checked first and wins if both would match (it's
 * our own authoritative key, once a record has it); SKU is only used as a
 * fallback when the variant ID doesn't find anything, so this correctly
 * converges onto a pre-existing native record on first contact without
 * ever being confused about which key to prefer on later syncs.
 *
 * Returns the matching HubSpot product id, or undefined if neither key matched.
 */
export async function findExistingProductId(productsApi, shopifyVariantGid, sku, existingProductProperties) {
  if (existingProductProperties.has("shopify_variant_id")) {
    const byVariant = await productsApi.searchByFilters([
      { propertyName: "shopify_variant_id", operator: "EQ", value: shopifyVariantGid },
    ]);
    if (byVariant.results[0]?.id) return byVariant.results[0].id;
  }

  if (sku && existingProductProperties.has("hs_sku")) {
    const bySku = await productsApi.searchByFilters([{ propertyName: "hs_sku", operator: "EQ", value: sku }]);
    if (bySku.results[0]?.id) return bySku.results[0].id;
  }

  return undefined;
}
