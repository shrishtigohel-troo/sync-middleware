import { assertNotHubSpotOwnedField } from "../config/hubspotProperties.js";
import { logger } from "../utils/logger.js";

/**
 * Maps a Shopify B2B company to HubSpot Company properties.
 *
 * Primary match key is the Shopify Company ID (see
 * docs/object-matching-rules.md) - company NAME is never used as the
 * automatic unique identifier, only for review/flagging of possible
 * duplicates across stores.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapShopifyCompanyToHubSpot(company, store, existingHubSpotProperties) {
  const locationNames = company.locations.edges.map((e) => e.node.name);

  const desired = {
    name: company.name,
    description: company.note ?? undefined,
    // Custom reference properties (only written if they already exist in the portal).
    shopify_company_id: company.id,
    shopify_store: store.storeId,
    // Works the same whether the company has 1 location or many - all names
    // are joined into one multi-line field. See docs/object-matching-rules.md.
    shopify_locations: locationNames.length > 0 ? locationNames.join("\n") : undefined,
    shopify_location_count: String(locationNames.length),
  };

  const properties = {};
  const skippedMissingProperties = [];

  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue;
    assertNotHubSpotOwnedField("companies", key);
    if (existingHubSpotProperties.has(key)) {
      properties[key] = value;
    } else {
      skippedMissingProperties.push(key);
    }
  }

  if (skippedMissingProperties.length > 0) {
    logger.warn(
      { shopifyCompanyId: company.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Company object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties };
}
