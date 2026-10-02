import { getMetafieldHubSpotPropertyName, convertMetafieldValue, isMetafieldDerivedProperty } from "../utils/metafieldMapping.js";
import { logger } from "../utils/logger.js";
import { toShopifyGid } from "../utils/shopifyGid.js";

/**
 * Maps one variant from a Shopify REST "products/*" webhook payload to
 * HubSpot Product properties. This is the REST-shaped counterpart to
 * src/mappings/product.js (which maps the Admin GraphQL product shape) -
 * webhook payloads use Shopify's REST Admin API resource representation,
 * which has different field names (e.g. `body_html` instead of
 * `descriptionHtml`, `image.src` instead of `featuredImage.url`).
 *
 * `categoryAndMetafields` is optional - { category: { fullName } | null,
 * metafields: [{ namespace, key, value }] } - fetched separately via
 * src/shopify/queries/products.js#getProductCategoryAndMetafields, since the
 * standard REST product webhook payload does not include the built-in
 * Category or metafields (unlike `vendor`, which the payload does include
 * directly). Pass undefined/omit to skip these fields entirely.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapWebhookProductVariantToHubSpot(payload, variant, existingHubSpotProperties, categoryAndMetafields) {
  const desired = {
    name: payload.variants.length > 1 ? `${payload.title} - ${variant.title}` : payload.title,
    description: (payload.body_html ?? "").replace(/<[^>]*>/g, "").trim(),
    price: variant.price,
    hs_sku: variant.sku ?? undefined,
    hs_images: payload.image?.src ?? undefined,
    // Written in the same gid:// form the GraphQL-based sync paths use, so
    // duplicate-matching works regardless of which path wrote the record
    // first (see src/utils/shopifyGid.js).
    shopify_product_id: toShopifyGid("Product", payload.id),
    shopify_variant_id: toShopifyGid("ProductVariant", variant.id),
    // Brand: the REST webhook payload includes vendor directly, no extra lookup needed.
    shopify_brand: payload.vendor ?? undefined,
    // Shopify's "Type" - see src/mappings/product.js for why this is not hs_product_type.
    shopify_product_type: payload.product_type ?? undefined,
    shopify_product_category: categoryAndMetafields?.category?.fullName ?? undefined,
    // Native product Tags (present directly on the REST webhook payload) and
    // Collections (fetched via getProductCategoryAndMetafields, since the
    // REST payload does not include them) - distinct from the "collection"
    // metafield above.
    shopify_tags: payload.tags ? payload.tags : undefined,
    shopify_collections:
      categoryAndMetafields?.collections && categoryAndMetafields.collections.length > 0
        ? categoryAndMetafields.collections.join(", ")
        : undefined,
  };

  // Dynamic - every metafield the product actually has, not a fixed list.
  const metafieldPropertyNamesWithValue = new Set();
  for (const node of categoryAndMetafields?.metafields ?? []) {
    const value = convertMetafieldValue(node);
    if (value === null || value === undefined) continue;
    const propertyName = getMetafieldHubSpotPropertyName(node.namespace, node.key);
    desired[propertyName] = value;
    metafieldPropertyNamesWithValue.add(propertyName);
  }

  // Clears any metafield property that previously had a value but no longer
  // does (removed/emptied in Shopify) - only when metafields were actually
  // fetched this time (categoryAndMetafields present). If the extra lookup
  // was skipped/failed, we genuinely don't know the current state, so we
  // must NOT wipe everything just because of a transient failure.
  if (categoryAndMetafields) {
    for (const propertyName of existingHubSpotProperties) {
      if (isMetafieldDerivedProperty(propertyName) && !metafieldPropertyNamesWithValue.has(propertyName)) {
        desired[propertyName] = "";
      }
    }
  }

  const properties = {};
  const skippedMissingProperties = [];

  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue;
    if (existingHubSpotProperties.has(key)) {
      properties[key] = value;
    } else {
      skippedMissingProperties.push(key);
    }
  }

  if (skippedMissingProperties.length > 0) {
    logger.warn(
      { shopifyVariantId: variant.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Product object",
    );
  }

  return { properties, skippedMissingProperties };
}
