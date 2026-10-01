import { isSupportedCurrency } from "../config/currencies.js";
import { MARKET_BY_STORE } from "../config/stores.js";
import { logger } from "../utils/logger.js";

/**
 * Maps a Shopify order to HubSpot Deal properties.
 *
 * The client's real HubSpot portal does not expose the "Orders" object
 * (confirmed live - it did not appear in the Objects settings search), so
 * per the SOW (Section 12, "Orders and Deals"), one Deal is created per
 * Shopify order instead. Deals are a default object on every HubSpot
 * account, unlike Orders.
 *
 * The compound unique identifier is still (Shopify Store ID + Shopify Order
 * ID) - same reasoning as src/mappings/order.js: two Shopify stores can
 * share the same order number.
 *
 * Unlike Orders, there is no native Shopify-HubSpot integration writing to
 * Deals, so there is no second "native reference field" key to check here -
 * see src/sync/findExistingDeal.js.
 *
 * dealstage/pipeline are deliberately NOT set here - the client's default
 * pipeline/stage IDs have not been confirmed, and guessing one could put
 * every synced order into the wrong stage of their sales process. Leave
 * these to be set manually or default-assigned by HubSpot until confirmed.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapShopifyOrderToHubSpotDeal(order, store, existingHubSpotProperties) {
  const currencyCode = order.currentTotalPriceSet.shopMoney.currencyCode;
  if (!isSupportedCurrency(currencyCode)) {
    logger.warn(
      { shopifyOrderId: order.id, currencyCode },
      "Order currency is not in the configured supported-currency list - confirm with the client before proceeding. Value is still preserved as-is.",
    );
  }

  const desired = {
    shopify_store_id: store.storeId,
    shopify_order_id: order.id,
    shopify_original_currency: currencyCode,
    shopify_channel: store.channel,
    shopify_market: MARKET_BY_STORE[store.storeId] ?? undefined,
    // Order status - a cancelled order is still synced (never dropped), just flagged.
    shopify_financial_status: order.displayFinancialStatus,
    shopify_fulfillment_status: order.displayFulfillmentStatus,
    shopify_cancelled: order.cancelledAt ? "true" : "false",
    // Candidate native HubSpot Deal properties - only written if confirmed to exist.
    dealname: order.name,
    amount: order.currentTotalPriceSet.shopMoney.amount,
    deal_currency_code: currencyCode,
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
      "Skipped writing HubSpot properties that do not exist yet on the Deal object - create them first, see docs/field-mapping.md",
    );
  }

  return { properties, skippedMissingProperties };
}
