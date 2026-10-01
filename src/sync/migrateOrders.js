import { iterateAllOrders } from "../shopify/queries/orders.js";
import { getExistingPropertyNames } from "../hubspot/properties.js";
import { HubSpotObjectApi } from "../hubspot/objects.js";
import { associateRecords, getDefaultAssociationType } from "../hubspot/associations.js";
import { mapShopifyOrderToHubSpot } from "../mappings/order.js";
import { mapShopifyLineItemToHubSpot } from "../mappings/lineItem.js";
import { findExistingOrderId } from "./findExistingOrder.js";
import { findExistingLineItemId } from "./findExistingLineItem.js";
import { logger } from "../utils/logger.js";

/**
 * Walks every order (and its line items) in the given store and
 * creates/updates the matching HubSpot Order + Line Item records, using the
 * same compound-key matching as scripts/poc-order-sync.js (Shopify Store ID
 * + Shopify Order ID - never Order ID alone).
 *
 * Order <-> Contact association is attempted whenever the order has a
 * customer email (matched the same way Contacts are matched elsewhere -
 * email only, see docs/object-matching-rules.md). Order <-> Company
 * association is attempted only when the order has a B2B purchasing company
 * that already exists in HubSpot.
 *
 * One failing order (or line item) does not stop the migration - it is
 * logged and counted, and processing continues. Call this from an explicit,
 * human-invoked script (see scripts/migrate-orders.js); it is never
 * triggered automatically.
 */
export async function migrateOrders(shopify, store) {
  const [existingOrderProperties, existingLineItemProperties, existingCompanyProperties] = await Promise.all([
    getExistingPropertyNames("orders"),
    getExistingPropertyNames("line_items"),
    getExistingPropertyNames("companies"),
  ]);

  const ordersApi = new HubSpotObjectApi("orders");
  const lineItemsApi = new HubSpotObjectApi("line_items");
  const companiesApi = new HubSpotObjectApi("companies");
  const contactsApi = new HubSpotObjectApi("contacts");

  const canMatchOrders =
    existingOrderProperties.has("shopify_store_id") && existingOrderProperties.has("shopify_order_id");
  if (!canMatchOrders) {
    logger.warn(
      "shopify_store_id and/or shopify_order_id do not exist on HubSpot Orders yet - every order will be created, none matched/updated, until these properties exist.",
    );
  }

  const canMatchCompanies = existingCompanyProperties.has("shopify_location_id");

  let lineItemToOrderAssociation;
  let orderToCompanyAssociation;
  let orderToContactAssociation;
  try {
    lineItemToOrderAssociation = await getDefaultAssociationType("line_items", "orders");
    orderToCompanyAssociation = await getDefaultAssociationType("orders", "companies");
    orderToContactAssociation = await getDefaultAssociationType("orders", "contacts");
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Could not look up HubSpot association types - associations will be skipped for this run",
    );
  }

  const summary = {
    ordersProcessed: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    ordersFailed: 0,
    lineItemsCreated: 0,
    lineItemsUpdated: 0,
    lineItemsFailed: 0,
    companyAssociationsMade: 0,
    contactAssociationsMade: 0,
  };

  for await (const order of iterateAllOrders(shopify)) {
    summary.ordersProcessed += 1;

    let hubspotOrderId;

    try {
      const { properties: orderProperties } = mapShopifyOrderToHubSpot(order, store, existingOrderProperties);

      if (Object.keys(orderProperties).length === 0) {
        throw new Error("No mappable HubSpot properties exist for this order");
      }

      // Checks BOTH our own compound key AND HubSpot's native reference
      // fields, so we converge with any record the native Shopify
      // integration already created instead of duplicating it - see
      // docs/object-matching-rules.md.
      const existingOrderId = await findExistingOrderId(ordersApi, store, order.id, existingOrderProperties);

      if (existingOrderId) {
        const updated = await ordersApi.update(existingOrderId, orderProperties);
        hubspotOrderId = updated.id;
        summary.ordersUpdated += 1;
      } else {
        const created = await ordersApi.create(orderProperties);
        hubspotOrderId = created.id;
        summary.ordersCreated += 1;
      }

      logger.info(
        { store: store.storeId, shopifyOrderId: order.id, hubspotOrderId, operation: existingOrderId ? "update" : "create", success: true },
        "Migrated order",
      );
    } catch (error) {
      summary.ordersFailed += 1;
      logger.error(
        {
          store: store.storeId,
          shopifyOrderId: order.id,
          operation: "sync",
          success: false,
          errorCategory: error?.name ?? "Unknown",
          err: error instanceof Error ? error.message : String(error),
        },
        "Failed to migrate this order - continuing with the rest",
      );
      continue; // no order record -> nothing to attach line items/associations to
    }

    for (const lineItem of order.lineItems.edges.map((e) => e.node)) {
      try {
        const { properties: lineItemProperties } = mapShopifyLineItemToHubSpot(lineItem, existingLineItemProperties);
        if (Object.keys(lineItemProperties).length === 0) continue;

        // Matched via the custom shopify_line_item_id property so
        // re-running this migration updates existing line items instead of
        // duplicating them - see src/sync/findExistingLineItem.js.
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

        if (lineItemToOrderAssociation) {
          await associateRecords("line_items", hubspotLineItemId, "orders", hubspotOrderId, [lineItemToOrderAssociation]);
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

    if (order.customer?.email && orderToContactAssociation) {
      try {
        const contactMatch = await contactsApi.searchByFilters([
          { propertyName: "email", operator: "EQ", value: order.customer.email },
        ]);
        const hubspotContactId = contactMatch.results[0]?.id;
        if (hubspotContactId) {
          await associateRecords("orders", hubspotOrderId, "contacts", hubspotContactId, [orderToContactAssociation]);
          summary.contactAssociationsMade += 1;
        }
      } catch (error) {
        logger.warn(
          { store: store.storeId, shopifyOrderId: order.id, err: error instanceof Error ? error.message : String(error) },
          "Failed to associate order to its contact - continuing",
        );
      }
    }

    // Matched by the specific Company LOCATION, not the company as a whole -
    // each Shopify Company Location has its own separate HubSpot Company
    // record (see src/mappings/companyLocation.js), so matching by company
    // id alone is now ambiguous (a company with 3 locations has 3 HubSpot
    // records sharing the same shopify_company_id).
    const purchasingLocationId =
      order.purchasingEntity?.__typename === "PurchasingCompany" ? order.purchasingEntity.location?.id : undefined;

    if (purchasingLocationId && canMatchCompanies && orderToCompanyAssociation) {
      try {
        const companyMatch = await companiesApi.searchByFilters([
          { propertyName: "shopify_location_id", operator: "EQ", value: purchasingLocationId },
        ]);
        const hubspotCompanyId = companyMatch.results[0]?.id;
        if (hubspotCompanyId) {
          await associateRecords("orders", hubspotOrderId, "companies", hubspotCompanyId, [orderToCompanyAssociation]);
          summary.companyAssociationsMade += 1;
        }
      } catch (error) {
        logger.warn(
          { store: store.storeId, shopifyOrderId: order.id, err: error instanceof Error ? error.message : String(error) },
          "Failed to associate order to its company - continuing",
        );
      }
    }

    if (summary.ordersProcessed % 25 === 0) {
      logger.info({ store: store.storeId, ...summary }, "Migration progress");
    }
  }

  return summary;
}
