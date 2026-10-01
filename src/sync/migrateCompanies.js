import { iterateAllCompanies } from "../shopify/queries/companies.js";
import { getExistingPropertyNames } from "../hubspot/properties.js";
import { HubSpotObjectApi } from "../hubspot/objects.js";
import { mapCompanyLocationToHubSpot } from "../mappings/companyLocation.js";
import { associateCompanyContacts } from "./associateCompanyContacts.js";
import { logger } from "../utils/logger.js";

/**
 * Walks every B2B company in the given store and creates/updates ONE
 * HubSpot Company record PER Shopify Company Location, named
 * "<company name> (<location name>)" - matched strictly by Shopify Location
 * ID (never company name, and never company ID alone - a company with
 * several locations has several HubSpot records that all share the same
 * shopify_company_id, so shopify_location_id is the only thing unique to
 * one record - see docs/object-matching-rules.md and
 * src/mappings/companyLocation.js).
 *
 * A company's contacts don't belong to one specific location in our data
 * model, so each contact is associated to EVERY one of that company's
 * location records - a contact can act on behalf of the whole company, not
 * just one site.
 *
 * One failing company (or location within it) does not stop the migration.
 * Call this from an explicit, human-invoked script (see
 * scripts/migrate-companies.js); it is never triggered automatically.
 *
 * NOTE: cross-store company consolidation (the same real-world company
 * existing as separate records in more than one Shopify store) is not
 * implemented - no matching key for that has been confirmed by the client
 * yet. Each store's companies are migrated independently.
 */
export async function migrateCompanies(shopify, store) {
  const existingProperties = await getExistingPropertyNames("companies");
  const companiesApi = new HubSpotObjectApi("companies");
  const canMatch = existingProperties.has("shopify_location_id");

  if (!canMatch) {
    logger.warn(
      "shopify_location_id does not exist on HubSpot Companies yet - every location will be created, none matched/updated, until this property exists.",
    );
  }

  const existingContactProperties = await getExistingPropertyNames("contacts");

  const summary = {
    companiesProcessed: 0,
    locationsProcessed: 0,
    locationsCreated: 0,
    locationsUpdated: 0,
    locationsFailed: 0,
    contactsAssociated: 0,
    mainContactsFlagged: 0,
    contactsSkippedNoMatch: 0,
  };

  for await (const company of iterateAllCompanies(shopify)) {
    summary.companiesProcessed += 1;

    if (company.locations.edges.length === 0) {
      logger.warn({ store: store.storeId, shopifyCompanyId: company.id }, "Company has no locations - skipping");
      continue;
    }

    for (const { node: location } of company.locations.edges) {
      summary.locationsProcessed += 1;

      try {
        const { properties } = mapCompanyLocationToHubSpot(
          {
            companyName: company.name,
            companyNote: company.note,
            companyGid: company.id,
            locationGid: location.id,
            locationName: location.name,
          },
          store,
          existingProperties,
        );
        if (Object.keys(properties).length === 0) {
          throw new Error("No mappable HubSpot properties exist for this company location");
        }

        let existingCompanyId;
        if (canMatch) {
          const result = await companiesApi.searchByFilters([
            { propertyName: "shopify_location_id", operator: "EQ", value: location.id },
          ]);
          existingCompanyId = result.results[0]?.id;
        }

        let hubspotCompanyId;
        if (existingCompanyId) {
          const updated = await companiesApi.update(existingCompanyId, properties);
          hubspotCompanyId = updated.id;
          summary.locationsUpdated += 1;
        } else {
          const created = await companiesApi.create(properties);
          hubspotCompanyId = created.id;
          summary.locationsCreated += 1;
        }

        logger.info(
          {
            store: store.storeId,
            shopifyCompanyId: company.id,
            shopifyLocationId: location.id,
            operation: existingCompanyId ? "update" : "create",
            success: true,
          },
          "Migrated company location",
        );

        if (company.contacts.edges.length > 0) {
          const contactResult = await associateCompanyContacts(company, hubspotCompanyId, existingContactProperties);
          summary.contactsAssociated += contactResult.associated;
          summary.mainContactsFlagged += contactResult.mainContactFlagged;
          summary.contactsSkippedNoMatch += contactResult.skippedNoMatch;
        }
      } catch (error) {
        summary.locationsFailed += 1;
        logger.error(
          {
            store: store.storeId,
            shopifyCompanyId: company.id,
            shopifyLocationId: location.id,
            operation: "sync",
            success: false,
            err: error instanceof Error ? error.message : String(error),
          },
          "Failed to migrate this company location - continuing with the rest",
        );
      }
    }

    if (summary.companiesProcessed % 25 === 0) {
      logger.info({ store: store.storeId, ...summary }, "Migration progress");
    }
  }

  return summary;
}
