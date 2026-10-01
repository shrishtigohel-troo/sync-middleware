import { resolvePreferredLanguage } from "../config/languages.js";
import { assertNotHubSpotOwnedField } from "../config/hubspotProperties.js";
import { logger } from "../utils/logger.js";

/**
 * Maps a Shopify customer to HubSpot Contact properties.
 *
 * Primary match key is email (see docs/object-matching-rules.md) - this
 * mapping never sets HubSpot-owned CRM fields (lifecycle stage, lead status,
 * owner, etc.), only commerce-reference fields.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapShopifyCustomerToHubSpot(customer, store, existingHubSpotProperties) {
  if (!customer.email) {
    throw new Error(
      `Shopify customer ${customer.id} has no email - cannot match/create a HubSpot contact without one.`,
    );
  }

  const preferredLanguage = resolvePreferredLanguage(customer.locale);

  const desired = {
    email: customer.email,
    firstname: customer.firstName ?? undefined,
    lastname: customer.lastName ?? undefined,
    phone: customer.phone ?? undefined,
    // Custom reference properties (only written if they already exist in the portal).
    shopify_customer_id: customer.id,
    shopify_store: store.storeId,
    preferred_language: preferredLanguage,
  };

  const properties = {};
  const skippedMissingProperties = [];

  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue;
    assertNotHubSpotOwnedField("contacts", key);
    if (existingHubSpotProperties.has(key)) {
      properties[key] = value;
    } else {
      skippedMissingProperties.push(key);
    }
  }

  if (skippedMissingProperties.length > 0) {
    logger.warn(
      { shopifyCustomerId: customer.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Contact object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties };
}
