import { assertNotHubSpotOwnedField } from "../config/hubspotProperties.js";
import { logger } from "../utils/logger.js";
import { toShopifyGid } from "../utils/shopifyGid.js";

/**
 * Maps a Shopify REST "companies/*" webhook payload to HubSpot Company
 * properties. REST-shaped counterpart to src/mappings/company.js.
 *
 * Primary match key is the Shopify Company ID (see
 * docs/object-matching-rules.md) - company NAME is never used as the
 * automatic unique identifier.
 *
 * `locationNames` is optional - fetched separately via
 * src/shopify/queries/companies.js#getCompanyLocationNames, since the
 * standard REST company webhook payload does not include locations. Works
 * the same whether the company has 1 location or many - all names are
 * joined into one multi-line field. Pass undefined/omit to skip it.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapWebhookCompanyToHubSpot(payload, store, existingHubSpotProperties, locationNames) {
  const desired = {
    name: payload.name,
    description: payload.note ?? undefined,
    // gid:// form to match what the GraphQL-based sync paths write - see src/utils/shopifyGid.js.
    shopify_company_id: toShopifyGid("Company", payload.id),
    shopify_store: store.storeId,
    shopify_locations: locationNames && locationNames.length > 0 ? locationNames.join("\n") : undefined,
    shopify_location_count: locationNames ? String(locationNames.length) : undefined,
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
      { shopifyCompanyId: payload.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Company object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties };
}
