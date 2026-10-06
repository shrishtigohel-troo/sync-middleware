import { isSupportedCurrency } from "../config/currencies.js";
import { resolveOrderMarket, orderKey } from "../config/stores.js";
import { ORDER_PIPELINE_ID, getOrderPipelineStageId } from "../config/orderPipeline.js";
import { extractShopifyNumericId } from "../utils/shopifyGid.js";
import { logger } from "../utils/logger.js";

/**
 * Maps a Shopify order to HubSpot Order properties.
 *
 * The compound unique identifier is (Shopify Store ID + Shopify Order ID) -
 * two Shopify stores can share the same order number, so callers must
 * search on BOTH shopify_store_id AND shopify_order_id together, never
 * shopify_order_id alone (see docs/object-matching-rules.md).
 *
 * The original transaction currency and amount are preserved as-is; this
 * mapping never converts currency.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapShopifyOrderToHubSpot(order, store, existingHubSpotProperties) {
  // The customer's currency and amount (presentment money), falling back to
  // the store's - identical for US orders. See src/mappings/webhookOrder.js.
  const customerTotal = order.currentTotalPriceSet.presentmentMoney ?? order.currentTotalPriceSet.shopMoney;
  const currencyCode = customerTotal.currencyCode;
  const address = order.shippingAddress ?? order.billingAddress;
  if (!isSupportedCurrency(currencyCode)) {
    logger.warn(
      { shopifyOrderId: order.id, currencyCode },
      "Order currency is not in the configured supported-currency list - confirm with the client before proceeding. Value is still preserved as-is.",
    );
  }

  const desired = {
    shopify_store_id: store.storeId,
    shopify_order_id: order.id,
    shopify_order_key: orderKey(store, order.id),
    shopify_original_currency: currencyCode,
    shopify_channel: store.channel,
    shopify_market: resolveOrderMarket(store, { countryCode: address?.countryCodeV2, countryName: address?.country }),
    // Candidate native HubSpot Order properties - only written if confirmed to exist.
    hs_order_name: order.name,
    hs_currency_code: currencyCode,
    hs_total_price: customerTotal.amount,
    // Order status - a cancelled order is still synced (never dropped), just flagged.
    shopify_financial_status: order.displayFinancialStatus,
    shopify_fulfillment_status: order.displayFulfillmentStatus,
    shopify_cancelled: order.cancelledAt ? "true" : "false",
    // Native HubSpot Order pipeline/stage - derived from Shopify's own
    // status fields so every order shows a stage, not just ones the native
    // Shopify integration also touched. See src/config/orderPipeline.js.
    hs_pipeline: ORDER_PIPELINE_ID,
    hs_pipeline_stage: getOrderPipelineStageId({
      cancelled: Boolean(order.cancelledAt),
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      shipmentStatuses: (order.fulfillments ?? [])
        .filter((f) => f.status !== "CANCELLED")
        .map((f) => f.displayStatus),
    }),
    // HubSpot's own native reference fields (used by the native Shopify
    // integration). Writing these too lets our matching logic find - and
    // safely converge with - a record the native integration already
    // created for this order, instead of creating a duplicate. See
    // docs/object-matching-rules.md.
    hs_external_order_id: extractShopifyNumericId(order.id),
    hs_source_store: store.storeUrl,
  };

  const properties = {};
  const skippedMissingProperties = [];

  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue;
    if (existingHubSpotProperties.has(key)) {
      properties[key] = value;
    } else {
      skippedMissingProperties.push(key);
    }
  }

  if (skippedMissingProperties.length > 0) {
    logger.warn(
      { shopifyOrderId: order.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Order object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties };
}
