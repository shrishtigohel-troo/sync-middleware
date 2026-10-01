import { logger } from "../utils/logger.js";

/**
 * Maps a single Shopify order line to HubSpot Line Item properties.
 *
 * Idempotent via a custom `shopify_line_item_id` property - callers must
 * search on it before creating, so re-running this against the same order
 * updates the existing line item instead of creating a duplicate (see
 * docs/object-matching-rules.md).
 *
 * NOTE: HubSpot's native `hs_external_id` field looked like the right fit
 * for this (and is documented as "External line item id"), but testing
 * against a live portal showed it silently reverts to null shortly after
 * being set via the API - it accepts and even echoes back the write in the
 * response, then discards it. A custom property was used instead once this
 * was discovered; see docs/object-matching-rules.md for the full story.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapShopifyLineItemToHubSpot(lineItem, existingHubSpotProperties) {
  const desired = {
    name: lineItem.title,
    quantity: String(lineItem.quantity),
    price: lineItem.originalUnitPriceSet.shopMoney.amount,
    amount: lineItem.discountedTotalSet.shopMoney.amount,
    hs_sku: lineItem.sku ?? undefined,
    shopify_variant_id: lineItem.variant?.id,
    shopify_line_item_id: lineItem.id,
  };

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
      { shopifyLineItemId: lineItem.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Line Item object",
    );
  }

  return { properties, skippedMissingProperties };
}
