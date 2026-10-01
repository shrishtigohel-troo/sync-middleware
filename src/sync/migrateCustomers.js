import { iterateAllCustomers } from "../shopify/queries/customers.js";
import { getExistingPropertyNames } from "../hubspot/properties.js";
import { HubSpotObjectApi } from "../hubspot/objects.js";
import { mapShopifyCustomerToHubSpot } from "../mappings/customer.js";
import { logger } from "../utils/logger.js";

/**
 * Walks every customer in the given store and creates/updates the matching
 * HubSpot Contact, matched strictly by email (see
 * docs/object-matching-rules.md) - never falls back to name or another weak
 * signal. A customer with no email is skipped and counted, not guessed at.
 *
 * One failing customer does not stop the migration. Call this from an
 * explicit, human-invoked script (see scripts/migrate-customers.js); it is
 * never triggered automatically.
 *
 * NOTE: reading customer email/name/phone requires Shopify's Protected
 * Customer Data approval on the source store - see docs/object-matching-rules.md.
 * This has not been granted on the in-house test store as of this writing.
 */
export async function migrateCustomers(shopify, store) {
  const existingProperties = await getExistingPropertyNames("contacts");
  const contactsApi = new HubSpotObjectApi("contacts");

  const summary = {
    customersProcessed: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsFailed: 0,
    customersSkippedNoEmail: 0,
  };

  for await (const customer of iterateAllCustomers(shopify)) {
    summary.customersProcessed += 1;

    if (!customer.email) {
      summary.customersSkippedNoEmail += 1;
      logger.warn({ store: store.storeId, shopifyCustomerId: customer.id }, "Customer has no email - skipping");
      continue;
    }

    try {
      const { properties } = mapShopifyCustomerToHubSpot(customer, store, existingProperties);
      if (Object.keys(properties).length === 0) {
        throw new Error("No mappable HubSpot properties exist for this customer");
      }

      const searchResult = await contactsApi.searchByFilters([
        { propertyName: "email", operator: "EQ", value: customer.email },
      ]);
      const existingContactId = searchResult.results[0]?.id;

      if (existingContactId) {
        await contactsApi.update(existingContactId, properties);
        summary.contactsUpdated += 1;
      } else {
        await contactsApi.create(properties);
        summary.contactsCreated += 1;
      }

      logger.info(
        {
          store: store.storeId,
          shopifyCustomerId: customer.id,
          operation: existingContactId ? "update" : "create",
          success: true,
        },
        "Migrated customer",
      );
    } catch (error) {
      summary.contactsFailed += 1;
      logger.error(
        {
          store: store.storeId,
          shopifyCustomerId: customer.id,
          operation: "sync",
          success: false,
          err: error instanceof Error ? error.message : String(error),
        },
        "Failed to migrate this customer - continuing with the rest",
      );
    }

    if (summary.customersProcessed % 25 === 0) {
      logger.info({ store: store.storeId, ...summary }, "Migration progress");
    }
  }

  return summary;
}
