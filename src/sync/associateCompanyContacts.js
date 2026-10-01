import { HubSpotObjectApi } from "../hubspot/objects.js";
import { associateRecords, getDefaultAssociationType } from "../hubspot/associations.js";
import { logger } from "../utils/logger.js";

/**
 * Associates every contact on a Shopify B2B company to the matching HubSpot
 * Company, and flags the main contact via the shopify_is_main_contact
 * property (a plain custom property, chosen deliberately instead of relying
 * on any undocumented HubSpot "primary company" mechanic - see
 * docs/association-mapping.md).
 *
 * Each company contact is matched to a HubSpot Contact strictly by email
 * (same rule as everywhere else - see docs/object-matching-rules.md). A
 * company contact with no matching HubSpot contact yet is skipped and
 * logged, not created here - contact creation is the customer sync's job
 * (scripts/poc-customer-sync.js / src/sync/migrateCustomers.js), run that
 * first so contacts exist before calling this.
 *
 * Requires Shopify's Protected Customer Data approval to read each
 * contact's email (see docs/object-matching-rules.md) - the Shopify company
 * query already requests it, so this only runs once that's available.
 *
 * Returns { associated, mainContactFlagged, skippedNoMatch }
 */
export async function associateCompanyContacts(company, hubspotCompanyId, existingContactProperties) {
  const contactsApi = new HubSpotObjectApi("contacts");
  const companyToContactAssociation = await getDefaultAssociationType("companies", "contacts");

  if (!companyToContactAssociation) {
    logger.warn(
      "No default HubSpot association type found between companies and contacts - contact associations skipped for this company.",
    );
    return { associated: 0, mainContactFlagged: 0, skippedNoMatch: 0 };
  }

  let associated = 0;
  let mainContactFlagged = 0;
  let skippedNoMatch = 0;

  for (const edge of company.contacts.edges) {
    const contact = edge.node;
    const email = contact.customer?.email;

    if (!email) {
      skippedNoMatch += 1;
      logger.warn(
        { shopifyCompanyId: company.id, shopifyContactId: contact.id },
        "Company contact has no resolvable email - cannot match to a HubSpot contact, skipping",
      );
      continue;
    }

    const match = await contactsApi.searchByFilters([{ propertyName: "email", operator: "EQ", value: email }]);
    const hubspotContactId = match.results[0]?.id;

    if (!hubspotContactId) {
      skippedNoMatch += 1;
      logger.info(
        { shopifyCompanyId: company.id, shopifyContactId: contact.id },
        "No matching HubSpot contact yet for this company contact - run the customer sync first",
      );
      continue;
    }

    await associateRecords("companies", hubspotCompanyId, "contacts", hubspotContactId, [companyToContactAssociation]);
    associated += 1;

    if (contact.isMainContact && existingContactProperties.has("shopify_is_main_contact")) {
      await contactsApi.update(hubspotContactId, { shopify_is_main_contact: "true" });
      mainContactFlagged += 1;
    }
  }

  return { associated, mainContactFlagged, skippedNoMatch };
}
