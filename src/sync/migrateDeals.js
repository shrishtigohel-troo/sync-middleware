import { iterateAllOrders } from "../shopify/queries/orders.js";
import { getExistingPropertyNames } from "../hubspot/properties.js";
import { HubSpotObjectApi } from "../hubspot/objects.js";
import { associateRecords, getDefaultAssociationType } from "../hubspot/associations.js";
import { mapShopifyOrderToHubSpotDeal } from "../mappings/deal.js";
import { mapShopifyLineItemToHubSpot } from "../mappings/lineItem.js";
import { findExistingDealId } from "./findExistingDeal.js";
import { findExistingLineItemId } from "./findExistingLineItem.js";
import { logger } from "../utils/logger.js";

/**
 * Walks every order (and its line items) in the given store and
 * creates/updates the matching HubSpot Deal + Line Item records, using the
 * same compound-key matching as src/sync/migrateOrders.js (Shopify Store ID
 * + Shopify Order ID). See src/mappings/deal.js for why Deals are used
 * instead of the Orders object for this client.
 *
 * Deal <-> Contact association is attempted whenever the order has a
 * customer email (matched by email, same rule as Contacts elsewhere). Deal
 * <-> Company association is attempted only when the order has a B2B
 * purchasing company that already exists in HubSpot.
 *
 * One failing order (or line item) does not stop the migration - it is
 * logged and counted, and processing continues. Call this from an explicit,
 * human-invoked script (see scripts/migrate-deals.js); it is never
 * triggered automatically.
 */
export async function migrateDeals(shopify, store) {
  const [existingDealProperties, existingLineItemProperties, existingCompanyProperties] = await Promise.all([
    getExistingPropertyNames("deals"),
    getExistingPropertyNames("line_items"),
    getExistingPropertyNames("companies"),
  ]);

  const dealsApi = new HubSpotObjectApi("deals");
  const lineItemsApi = new HubSpotObjectApi("line_items");
  const companiesApi = new HubSpotObjectApi("companies");
  const contactsApi = new HubSpotObjectApi("contacts");

  const canMatchDeals =
    existingDealProperties.has("shopify_store_id") && existingDealProperties.has("shopify_order_id");
  if (!canMatchDeals) {
    logger.warn(
      "shopify_store_id and/or shopify_order_id do not exist on HubSpot Deals yet - every order will create a new Deal, none matched/updated, until these properties exist.",
    );
  }

  const canMatchCompanies = existingCompanyProperties.has("shopify_location_id");

  let lineItemToDealAssociation;
  let dealToCompanyAssociation;
  let dealToContactAssociation;
  try {
    lineItemToDealAssociation = await getDefaultAssociationType("line_items", "deals");
    dealToCompanyAssociation = await getDefaultAssociationType("deals", "companies");
    dealToContactAssociation = await getDefaultAssociationType("deals", "contacts");
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Could not look up HubSpot association types - associations will be skipped for this run",
    );
  }

  const summary = {
    dealsProcessed: 0,
    dealsCreated: 0,
    dealsUpdated: 0,
    dealsFailed: 0,
    lineItemsCreated: 0,
    lineItemsUpdated: 0,
    lineItemsFailed: 0,
    companyAssociationsMade: 0,
    contactAssociationsMade: 0,
  };

  for await (const order of iterateAllOrders(shopify)) {
    summary.dealsProcessed += 1;

    let hubspotDealId;

    try {
      const { properties: dealProperties } = mapShopifyOrderToHubSpotDeal(order, store, existingDealProperties);

      if (Object.keys(dealProperties).length === 0) {
        throw new Error("No mappable HubSpot properties exist for this order");
      }

      const existingDealId = await findExistingDealId(dealsApi, store, order.id, existingDealProperties);

      if (existingDealId) {
        const updated = await dealsApi.update(existingDealId, dealProperties);
        hubspotDealId = updated.id;
        summary.dealsUpdated += 1;
      } else {
        const created = await dealsApi.create(dealProperties);
        hubspotDealId = created.id;
        summary.dealsCreated += 1;
      }

      logger.info(
        { store: store.storeId, shopifyOrderId: order.id, hubspotDealId, operation: existingDealId ? "update" : "create", success: true },
        "Migrated deal",
      );
    } catch (error) {
      summary.dealsFailed += 1;
      logger.error(
        {
          store: store.storeId,
          shopifyOrderId: order.id,
          operation: "sync",
          success: false,
          errorCategory: error?.name ?? "Unknown",
          err: error instanceof Error ? error.message : String(error),
        },
        "Failed to migrate this order to a Deal - continuing with the rest",
      );
      continue; // no deal record -> nothing to attach line items/associations to
    }

    for (const lineItem of order.lineItems.edges.map((e) => e.node)) {
      try {
        const { properties: lineItemProperties } = mapShopifyLineItemToHubSpot(lineItem, existingLineItemProperties);
        if (Object.keys(lineItemProperties).length === 0) continue;

        const existingLineItemId = await findExistingLineItemId(lineItemsApi, lineItem.id, existingLineItemProperties);

        let hubspotLineItemId;
        if (existingLineItemId) {
          const updated = await lineItemsApi.update(existingLineItemId, lineItemProperties);
          hubspotLineItemId = updated.id;
          summary.lineItemsUpdated += 1;
        } else {
          const created = await lineItemsApi.create(lineItemProperties);
          hubspotLineItemId = created.id;
          summary.lineItemsCreated += 1;
        }

        if (lineItemToDealAssociation) {
          await associateRecords("line_items", hubspotLineItemId, "deals", hubspotDealId, [lineItemToDealAssociation]);
        }
      } catch (error) {
        summary.lineItemsFailed += 1;
        logger.error(
          {
            store: store.storeId,
            shopifyOrderId: order.id,
            shopifyLineItemId: lineItem.id,
            operation: "sync",
            success: false,
            err: error instanceof Error ? error.message : String(error),
          },
          "Failed to migrate this line item - continuing with the rest",
        );
      }
    }

    if (order.customer?.email && dealToContactAssociation) {
      try {
        const contactMatch = await contactsApi.searchByFilters([
          { propertyName: "email", operator: "EQ", value: order.customer.email },
        ]);
        const hubspotContactId = contactMatch.results[0]?.id;
        if (hubspotContactId) {
          await associateRecords("deals", hubspotDealId, "contacts", hubspotContactId, [dealToContactAssociation]);
          summary.contactAssociationsMade += 1;
        }
      } catch (error) {
        logger.warn(
          { store: store.storeId, shopifyOrderId: order.id, err: error instanceof Error ? error.message : String(error) },
          "Failed to associate deal to its contact - continuing",
        );
      }
    }

    // Matched by the specific Company LOCATION, not the company as a whole -
    // see the matching comment in src/sync/migrateOrders.js for why.
    const purchasingLocationId =
      order.purchasingEntity?.__typename === "PurchasingCompany" ? order.purchasingEntity.location?.id : undefined;

    if (purchasingLocationId && canMatchCompanies && dealToCompanyAssociation) {
      try {
        const companyMatch = await companiesApi.searchByFilters([
          { propertyName: "shopify_location_id", operator: "EQ", value: purchasingLocationId },
        ]);
        const hubspotCompanyId = companyMatch.results[0]?.id;
        if (hubspotCompanyId) {
          await associateRecords("deals", hubspotDealId, "companies", hubspotCompanyId, [dealToCompanyAssociation]);
          summary.companyAssociationsMade += 1;
        }
      } catch (error) {
        logger.warn(
          { store: store.storeId, shopifyOrderId: order.id, err: error instanceof Error ? error.message : String(error) },
          "Failed to associate deal to its company - continuing",
        );
      }
    }

    if (summary.dealsProcessed % 25 === 0) {
      logger.info({ store: store.storeId, ...summary }, "Migration progress");
    }
  }

  return summary;
}
