import { getShopifyClient, ShopifyGraphQLError } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { getFirstOrder } from "../src/shopify/queries/orders.js";
import { getExistingPropertyNames } from "../src/hubspot/properties.js";
import { HubSpotObjectApi } from "../src/hubspot/objects.js";
import { associateRecords, getDefaultAssociationType } from "../src/hubspot/associations.js";
import { mapShopifyOrderToHubSpot } from "../src/mappings/order.js";
import { mapShopifyLineItemToHubSpot } from "../src/mappings/lineItem.js";
import { findExistingOrderId } from "../src/sync/findExistingOrder.js";
import { findExistingLineItemId } from "../src/sync/findExistingLineItem.js";
import { logger } from "../src/utils/logger.js";

/**
 * Controlled, single-record proof of concept:
 * Shopify (1 order + its line items) -> mapping/validation -> HubSpot
 * Order + Line Items (create/update + associations).
 *
 * Matches the order strictly on the compound key (Shopify Store ID +
 * Shopify Order ID) - see docs/object-matching-rules.md. Contact/company
 * association is best-effort: contact matching requires a customer email,
 * which needs Shopify's Protected Customer Data approval (not yet granted
 * on this store) and is skipped gracefully when unavailable.
 */
async function main() {
  const store = getStoreConfig("b2b");
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Fetching one order from Shopify...");
  const order = await getFirstOrder(shopify);

  if (!order) {
    logger.error({ store: store.storeId }, "No orders found in this store - nothing to sync.");
    process.exitCode = 1;
    return;
  }

  const purchasingCompany =
    order.purchasingEntity?.__typename === "PurchasingCompany" ? order.purchasingEntity.company : null;

  logger.info(
    {
      shopifyOrderId: order.id,
      name: order.name,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      cancelled: Boolean(order.cancelledAt),
      currency: order.currentTotalPriceSet.shopMoney.currencyCode,
      lineItemCount: order.lineItems.edges.length,
      hasCustomerRef: Boolean(order.customer),
      hasCompanyRef: Boolean(purchasingCompany),
    },
    "Fetched Shopify order (safe, non-secret fields only)",
  );

  logger.info("Verifying HubSpot Order and Line Item property configuration...");
  const [existingOrderProperties, existingLineItemProperties] = await Promise.all([
    getExistingPropertyNames("orders"),
    getExistingPropertyNames("line_items"),
  ]);

  const { properties: orderProperties, skippedMissingProperties: orderSkipped } = mapShopifyOrderToHubSpot(
    order,
    store,
    existingOrderProperties,
  );

  if (Object.keys(orderProperties).length === 0) {
    logger.error(
      "No mappable properties exist on the HubSpot Order object yet - create shopify_store_id / shopify_order_id first, see docs/field-mapping.md",
    );
    process.exitCode = 1;
    return;
  }

  const ordersApi = new HubSpotObjectApi("orders");
  const lineItemsApi = new HubSpotObjectApi("line_items");

  // Checks BOTH our own compound key AND HubSpot's native reference fields
  // (in case the native Shopify integration already created this order) -
  // see docs/object-matching-rules.md and src/sync/findExistingOrder.js.
  const existingOrderId = await findExistingOrderId(ordersApi, store, order.id, existingOrderProperties);

  let hubspotOrderId;
  if (existingOrderId) {
    logger.info({ hubspotOrderId: existingOrderId }, "Existing HubSpot order found by compound key - updating");
    const updated = await ordersApi.update(existingOrderId, orderProperties);
    hubspotOrderId = updated.id;
    logger.info(
      { hubspotOrderId, propertiesWritten: Object.keys(orderProperties), skippedMissingProperties: orderSkipped },
      "HubSpot order UPDATED",
    );
  } else {
    logger.info("No existing HubSpot order matched - creating a new one");
    const created = await ordersApi.create(orderProperties);
    hubspotOrderId = created.id;
    logger.info(
      { hubspotOrderId, propertiesWritten: Object.keys(orderProperties), skippedMissingProperties: orderSkipped },
      "HubSpot order CREATED",
    );
  }

  // Line items: matched via HubSpot's native hs_external_id field, so
  // re-running this against the same order updates existing line items
  // instead of creating duplicates - see src/sync/findExistingLineItem.js.
  const lineItemToOrderAssociation = await getDefaultAssociationType("line_items", "orders");
  if (!lineItemToOrderAssociation) {
    logger.warn(
      "No default HubSpot association type found between line_items and orders - line items will be created but NOT associated to the order.",
    );
  }

  for (const lineItem of order.lineItems.edges.map((e) => e.node)) {
    const { properties: lineItemProperties, skippedMissingProperties: lineItemSkipped } = mapShopifyLineItemToHubSpot(
      lineItem,
      existingLineItemProperties,
    );

    if (Object.keys(lineItemProperties).length === 0) {
      logger.warn({ shopifyLineItemId: lineItem.id }, "No mappable properties for this line item - skipping");
      continue;
    }

    const existingLineItemId = await findExistingLineItemId(lineItemsApi, lineItem.id, existingLineItemProperties);

    let hubspotLineItemId;
    if (existingLineItemId) {
      const updated = await lineItemsApi.update(existingLineItemId, lineItemProperties);
      hubspotLineItemId = updated.id;
      logger.info(
        {
          shopifyLineItemId: lineItem.id,
          hubspotLineItemId,
          propertiesWritten: Object.keys(lineItemProperties),
          skippedMissingProperties: lineItemSkipped,
        },
        "HubSpot line item UPDATED",
      );
    } else {
      const created = await lineItemsApi.create(lineItemProperties);
      hubspotLineItemId = created.id;
      logger.info(
        {
          shopifyLineItemId: lineItem.id,
          hubspotLineItemId,
          propertiesWritten: Object.keys(lineItemProperties),
          skippedMissingProperties: lineItemSkipped,
        },
        "HubSpot line item CREATED",
      );
    }

    if (lineItemToOrderAssociation) {
      await associateRecords("line_items", hubspotLineItemId, "orders", hubspotOrderId, [lineItemToOrderAssociation]);
      logger.info({ hubspotLineItemId, hubspotOrderId }, "Associated line item to order");
    }
  }

  // Order <-> Company association, when this order has a B2B purchasing company
  // and we can find the matching HubSpot company by Shopify Company ID.
  if (purchasingCompany && (await getExistingPropertyNames("companies")).has("shopify_company_id")) {
    const companiesApi = new HubSpotObjectApi("companies");
    const companyMatch = await companiesApi.searchByFilters([
      { propertyName: "shopify_company_id", operator: "EQ", value: purchasingCompany.id },
    ]);
    const hubspotCompanyId = companyMatch.results[0]?.id;

    if (hubspotCompanyId) {
      const orderToCompanyAssociation = await getDefaultAssociationType("orders", "companies");
      if (orderToCompanyAssociation) {
        await associateRecords("orders", hubspotOrderId, "companies", hubspotCompanyId, [orderToCompanyAssociation]);
        logger.info({ hubspotOrderId, hubspotCompanyId }, "Associated order to company");
      } else {
        logger.warn("No default HubSpot association type found between orders and companies - skipped");
      }
    } else {
      logger.info(
        { shopifyCompanyId: purchasingCompany.id },
        "Order's purchasing company has no matching HubSpot company yet (run poc:company-sync for it first) - association skipped",
      );
    }
  }

  // Order <-> Contact association intentionally skipped: matching a contact
  // requires the customer's email, which requires Shopify's Protected
  // Customer Data approval (not yet granted on this store - see the
  // customer-sync PoC notes). Revisit once that approval is in place.
  if (order.customer) {
    logger.info(
      { shopifyCustomerId: order.customer.id },
      "Order <-> Contact association skipped - requires Protected Customer Data approval to resolve the customer's email",
    );
  }
}

main().catch((error) => {
  const details =
    error instanceof ShopifyGraphQLError
      ? { message: error.message, graphQLErrors: error.graphQLErrors }
      : { message: error instanceof Error ? error.message : String(error) };
  logger.error({ err: details }, "PoC order sync FAILED");
  process.exitCode = 1;
});
