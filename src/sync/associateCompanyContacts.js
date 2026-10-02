import { HubSpotObjectApi } from "../hubspot/objects.js";
import { associateRecords, getDefaultAssociationType, listAssociatedObjectIds, removeAssociation } from "../hubspot/associations.js";
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
 * Per location: pass `locationGid` and `locationContactIds` (from
 * getCompanyLocationContactIds) and only the contacts Shopify assigns to
 * that location are linked to its HubSpot record - each location record
 * otherwise showed every contact of the company (confirmed live: Streetcar
 * Ct showed all 3 contacts of "Test Single Location Co", Shopify assigns it
 * only one). Contacts of this company that are not assigned to the location
 * are unlinked from it. A contact assigned to no location at all stays
 * linked to every location record. Contacts that are not contacts of this
 * Shopify company (e.g. linked by hand in HubSpot) are never touched.
 * Without `locationGid`, every company contact is linked (older callers).
 *
 * Returns { associated, removed, mainContactFlagged, skippedNoMatch }
 */
export async function associateCompanyContacts(company, hubspotCompanyId, existingContactProperties, options = {}) {
  const { locationGid, locationContactIds } = options;
  const assignedHere = locationGid ? (locationContactIds?.get(locationGid) ?? new Set()) : null;
  const assignedAnywhere = new Set([...(locationContactIds?.values() ?? [])].flatMap((ids) => [...ids]));
  const belongsHere = (contact) => !assignedHere || assignedHere.has(contact.id) || !assignedAnywhere.has(contact.id);
  const currentlyLinked = assignedHere
    ? new Set(await listAssociatedObjectIds("companies", hubspotCompanyId, "contacts"))
    : new Set();
  let removed = 0;
  const contactsApi = new HubSpotObjectApi("contacts");
  const companyToContactAssociation = await getDefaultAssociationType("companies", "contacts");

  if (!companyToContactAssociation) {
    logger.warn(
      "No default HubSpot association type found between companies and contacts - contact associations skipped for this company.",
    );
    return { associated: 0, removed: 0, mainContactFlagged: 0, skippedNoMatch: 0 };
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

    if (!belongsHere(contact)) {
      if (currentlyLinked.has(String(hubspotContactId))) {
        await removeAssociation("companies", hubspotCompanyId, "contacts", hubspotContactId);
        removed += 1;
        logger.info(
          { hubspotCompanyId, hubspotContactId, shopifyLocationId: locationGid },
          "Contact is not assigned to this company location in Shopify - unlinked from its HubSpot record",
        );
      }
      continue;
    }

    await associateRecords("companies", hubspotCompanyId, "contacts", hubspotContactId, [companyToContactAssociation]);
    associated += 1;

    if (contact.isMainContact && existingContactProperties.has("shopify_is_main_contact")) {
      await contactsApi.update(hubspotContactId, { shopify_is_main_contact: "true" });
      mainContactFlagged += 1;
    }
  }

  return { associated, removed, mainContactFlagged, skippedNoMatch };
}
