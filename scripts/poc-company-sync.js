import { getShopifyClient, ShopifyGraphQLError } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { getFirstCompany } from "../src/shopify/queries/companies.js";
import { getExistingPropertyNames } from "../src/hubspot/properties.js";
import { HubSpotObjectApi } from "../src/hubspot/objects.js";
import { mapShopifyCompanyToHubSpot } from "../src/mappings/company.js";
import { associateCompanyContacts } from "../src/sync/associateCompanyContacts.js";
import { logger } from "../src/utils/logger.js";

/**
 * Controlled, single-record proof of concept:
 * Shopify (1 B2B company) -> mapping/validation -> HubSpot Company (1 create/update).
 *
 * Matches strictly by Shopify Company ID - the client-mandated primary key
 * for companies. Company name is never used as the automatic match key.
 */
async function main() {
  const store = getStoreConfig("b2b");
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Fetching one B2B company from Shopify...");
  const company = await getFirstCompany(shopify);

  if (!company) {
    logger.error({ store: store.storeId }, "No companies found in this store - nothing to sync.");
    process.exitCode = 1;
    return;
  }

  const mainContact = company.contacts.edges.find((e) => e.node.isMainContact)?.node;
  logger.info(
    {
      shopifyCompanyId: company.id,
      name: company.name,
      locationCount: company.locations.edges.length,
      contactCount: company.contacts.edges.length,
      hasMainContact: Boolean(mainContact),
    },
    "Fetched Shopify company (safe, non-secret fields only)",
  );

  logger.info("Verifying HubSpot Company property configuration...");
  const existingProperties = await getExistingPropertyNames("companies");

  const { properties, skippedMissingProperties } = mapShopifyCompanyToHubSpot(company, store, existingProperties);

  if (Object.keys(properties).length === 0) {
    logger.error(
      "No mappable properties exist on the HubSpot Company object. 'name' should exist by default - check the portal configuration.",
    );
    process.exitCode = 1;
    return;
  }

  const companiesApi = new HubSpotObjectApi("companies");m

  // Duplicate-prevention: Shopify Company ID is the ONLY primary match key -
  // company name is never used as the automatic identifier (see docs/object-matching-rules.md).
  let existingRecordId;
  if (existingProperties.has("shopify_company_id")) {
    const result = await companiesApi.searchByFilters([
      { propertyName: "shopify_company_id", operator: "EQ", value: company.id },
    ]);
    existingRecordId = result.results[0]?.id;
  } else {
    logger.warn(
      "shopify_company_id property does not exist on HubSpot Companies yet - cannot safely check for an existing match. Create it before syncing real data.",
    );
  }

  let hubspotCompanyId;
  if (existingRecordId) {
    logger.info({ hubspotCompanyId: existingRecordId }, "Existing HubSpot company found by Shopify Company ID - updating");
    const updated = await companiesApi.update(existingRecordId, properties);
    hubspotCompanyId = updated.id;
    logger.info(
      { hubspotCompanyId, propertiesWritten: Object.keys(properties), skippedMissingProperties },
      "HubSpot company UPDATED",
    );
  } else {
    logger.info("No existing HubSpot company matched - creating a new one");
    const created = await companiesApi.create(properties);
    hubspotCompanyId = created.id;
    logger.info(
      { hubspotCompanyId, propertiesWritten: Object.keys(properties), skippedMissingProperties },
      "HubSpot company CREATED",
    );
  }

  if (company.contacts.edges.length > 0) {
    logger.info("Associating company contacts (matched by email) and flagging the main contact...");
    const existingContactProperties = await getExistingPropertyNames("contacts");
    const contactResult = await associateCompanyContacts(company, hubspotCompanyId, existingContactProperties);
    logger.info(contactResult, "Company contact association complete");
  }
}

main().catch((error) => {
  const details =
    error instanceof ShopifyGraphQLError
      ? { message: error.message, graphQLErrors: error.graphQLErrors }
      : { message: error instanceof Error ? error.message : String(error) };
  logger.error({ err: details }, "PoC company sync FAILED");
  process.exitCode = 1;
});
