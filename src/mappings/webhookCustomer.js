import { assertNotHubSpotOwnedField } from "../config/hubspotProperties.js";
import { logger } from "../utils/logger.js";
import { toShopifyGid } from "../utils/shopifyGid.js";

/**
 * Maps a Shopify REST "customers/*" webhook payload to HubSpot Contact
 * properties. REST-shaped counterpart to src/mappings/customer.js.
 *
 * NOTE: unlike the Admin GraphQL customer query, the standard Shopify
 * customer webhook payload does not include a `locale` field, so
 * preferred_language cannot be derived here without an additional API call -
 * left unset rather than guessed. See docs/language-mapping.md.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapWebhookCustomerToHubSpot(payload, store, existingHubSpotProperties) {
  if (!payload.email) {
    throw new Error(`Shopify customer ${payload.id} has no email - cannot match/create a HubSpot contact without one.`);
  }

  const desired = {
    email: payload.email,
    firstname: payload.first_name ?? undefined,
    lastname: payload.last_name ?? undefined,
    phone: payload.phone ?? undefined,
    // gid:// form to match what the GraphQL-based sync paths write - see src/utils/shopifyGid.js.
    shopify_customer_id: toShopifyGid("Customer", payload.id),
    shopify_store: store.storeId,
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
      { shopifyCustomerId: payload.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Contact object",
    );
  }

  return { properties, skippedMissingProperties };
}
