import { assertNotHubSpotOwnedField } from "../config/hubspotProperties.js";
import { logger } from "../utils/logger.js";

/**
 * Maps ONE Shopify Company Location to its own HubSpot Company record - a
 * Shopify Company with 3 locations produces 3 separate HubSpot Companies,
 * named "<company name> (<location name>)", not one record with combined
 * location data. This is what the client asked for after seeing the
 * combined-field version: they want to see each location as its own row in
 * HubSpot, matching however many locations actually exist in Shopify.
 *
 * Primary match key is shopify_location_id (globally unique per location,
 * not just per company) - see docs/object-matching-rules.md.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapCompanyLocationToHubSpot(
  { companyName, companyNote, companyGid, locationGid, locationName },
  store,
  existingHubSpotProperties,
) {
  const desired = {
    name: `${companyName} (${locationName})`,
    description: companyNote ?? undefined,
    shopify_company_id: companyGid,
    shopify_location_id: locationGid,
    shopify_store: store.storeId,
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
      { locationGid, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Company object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties };
}
