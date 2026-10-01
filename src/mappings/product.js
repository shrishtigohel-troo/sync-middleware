import { getMetafieldHubSpotPropertyName, convertMetafieldValue, isMetafieldDerivedProperty } from "../utils/metafieldMapping.js";
import { logger } from "../utils/logger.js";

/**
 * Maps one Shopify product variant to HubSpot Product properties.
 *
 * Each Shopify variant becomes its own HubSpot Product record - a product
 * with 3 variants produces 3 HubSpot products, sharing the parent's
 * title/description/category but each carrying its own SKU, price and
 * Shopify Variant ID. This matches the client's stated identifier rule
 * ("Use Shopify Product ID and Variant ID/SKU as identifiers").
 *
 * Only emits a property if it is confirmed to exist on the portal's Product
 * object (see src/hubspot/properties.js) - this avoids ever guessing at a
 * HubSpot internal property name.
 *
 * Returns { properties, skippedMissingProperties, observedMetafields }
 */
export function mapShopifyVariantToHubSpot(product, variant, existingHubSpotProperties) {
  const desired = {
    name: product.variants.edges.length > 1 ? `${product.title} - ${variant.title}` : product.title,
    description: product.descriptionHtml.replace(/<[^>]*>/g, "").trim(),
    price: variant.price,
    hs_sku: variant.sku ?? undefined,
    hs_url: product.onlineStoreUrl ?? undefined,
    hs_images: product.featuredImage?.url ?? undefined,
    // Custom reference properties (only written if they already exist in the portal).
    shopify_product_id: product.id,
    shopify_variant_id: variant.id,
    // Brand: Shopify's native Vendor field - confirmed live against a real
    // product ("Difiaba Professional") to be exactly what's used as brand,
    // no separate metafield needed.
    shopify_brand: product.vendor ?? undefined,
    // Shopify's own built-in/standardized Category taxonomy (not a custom
    // metafield) - confirmed live to show a real structured value (e.g.
    // "Hair Coloring Accessories in Hair Care").
    shopify_product_category: product.category?.fullName ?? undefined,
    // Native product Tags and Collections - distinct from the "collection"
    // metafield above (see docs/object-matching-rules.md).
    shopify_tags: product.tags.length > 0 ? product.tags.join(", ") : undefined,
    shopify_collections:
      product.collections.edges.length > 0
        ? product.collections.edges.map((e) => e.node.title).join(", ")
        : undefined,
  };

  // Dynamic - every metafield the product actually has, not a fixed list.
  // This is what covers app-injected metafields (Loox, Google Shopping,
  // etc.) that don't appear in Shopify's own metafield-definitions list.
  const metafieldPropertyNamesWithValue = new Set();
  for (const { node } of product.metafields.edges) {
    const value = convertMetafieldValue(node);
    if (value === null || value === undefined) continue;
    const propertyName = getMetafieldHubSpotPropertyName(node.namespace, node.key);
    desired[propertyName] = value;
    metafieldPropertyNamesWithValue.add(propertyName);
  }

  // Clears any metafield property that previously had a value but no longer
  // does (the metafield was removed or emptied in Shopify) - otherwise the
  // stale value would stay stuck in HubSpot forever, since the loop above
  // only ever writes a value when one currently exists.
  for (const propertyName of existingHubSpotProperties) {
    if (isMetafieldDerivedProperty(propertyName) && !metafieldPropertyNamesWithValue.has(propertyName)) {
      desired[propertyName] = "";
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

  const observedMetafields = product.metafields.edges.map((e) => ({
    namespace: e.node.namespace,
    key: e.node.key,
    value: e.node.value,
  }));

  if (skippedMissingProperties.length > 0) {
    logger.warn(
      { variantId: variant.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Product object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties, observedMetafields };
}
