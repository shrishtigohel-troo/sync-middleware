import { getShopifyClient, ShopifyGraphQLError } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { getFirstCustomer } from "../src/shopify/queries/customers.js";
import { getExistingPropertyNames } from "../src/hubspot/properties.js";
import { HubSpotObjectApi } from "../src/hubspot/objects.js";
import { mapShopifyCustomerToHubSpot } from "../src/mappings/customer.js";
import { logger } from "../src/utils/logger.js";

/**
 * Controlled, single-record proof of concept:
 * Shopify (1 customer) -> mapping/validation -> HubSpot Contact (1 create/update).
 *
 * Matches strictly by email - the client-mandated primary key for contacts.
 * A customer with no email is a hard failure, never a fallback match.
 */
async function main() {
  const store = getStoreConfig("b2b");
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Fetching one customer from Shopify...");
  const customer = await getFirstCustomer(shopify);

  if (!customer) {
    logger.error({ store: store.storeId }, "No customers found in this store - nothing to sync.");
    process.exitCode = 1;
    return;
  }

  logger.info(
    {
      shopifyCustomerId: customer.id,
      hasEmail: Boolean(customer.email),
      locale: customer.locale,
      country: customer.defaultAddress?.countryCodeV2,
    },
    "Fetched Shopify customer (safe, non-secret fields only - email withheld from logs)",
  );

  if (!customer.email) {
    logger.error({ shopifyCustomerId: customer.id }, "Customer has no email - cannot sync without one.");
    process.exitCode = 1;
    return;
  }

  logger.info("Verifying HubSpot Contact property configuration...");
  const existingProperties = await getExistingPropertyNames("contacts");

  const { properties, skippedMissingProperties } = mapShopifyCustomerToHubSpot(customer, store, existingProperties);

  if (Object.keys(properties).length === 0) {
    logger.error(
      "No mappable properties exist on the HubSpot Contact object. 'email' should exist by default - check the portal configuration.",
    );
    process.exitCode = 1;
    return;
  }

  const contactsApi = new HubSpotObjectApi("contacts");

  // Duplicate-prevention: email is the ONLY primary match key for contacts -
  // never fall back to name or another weak signal (see docs/object-matching-rules.md).
  const searchResult = await contactsApi.searchByFilters([
    { propertyName: "email", operator: "EQ", value: customer.email },
  ]);
  const existingRecordId = searchResult.results[0]?.id;

  if (existingRecordId) {
    logger.info({ hubspotContactId: existingRecordId }, "Existing HubSpot contact found by email - updating");
    const updated = await contactsApi.update(existingRecordId, properties);
    logger.info(
      { hubspotContactId: updated.id, propertiesWritten: Object.keys(properties), skippedMissingProperties },
      "HubSpot contact UPDATED",
    );
  } else {
    logger.info("No existing HubSpot contact matched this email - creating a new one");
    const created = await contactsApi.create(properties);
    logger.info(
      { hubspotContactId: created.id, propertiesWritten: Object.keys(properties), skippedMissingProperties },
      "HubSpot contact CREATED",
    );
  }
}

main().catch((error) => {
  const details =
    error instanceof ShopifyGraphQLError
      ? { message: error.message, graphQLErrors: error.graphQLErrors }
      : { message: error instanceof Error ? error.message : String(error) };
  logger.error({ err: details }, "PoC customer sync FAILED");
  process.exitCode = 1;
});
