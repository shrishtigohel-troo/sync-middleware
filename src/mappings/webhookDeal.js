import { isSupportedCurrency } from "../config/currencies.js";
import { MARKET_BY_STORE } from "../config/stores.js";
import { logger } from "../utils/logger.js";
import { toShopifyGid } from "../utils/shopifyGid.js";

/**
 * Maps a Shopify REST "orders/*" webhook payload to HubSpot Deal
 * properties. REST-shaped counterpart to src/mappings/deal.js - see that
 * file for why Deals are used instead of the Orders object for this client.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapWebhookOrderToHubSpotDeal(payload, store, existingHubSpotProperties) {
  const currencyCode = payload.currency;
  if (!isSupportedCurrency(currencyCode)) {
    logger.warn(
      { shopifyOrderId: payload.id, currencyCode },
      "Order currency is not in the configured supported-currency list - confirm with the client before proceeding. Value is still preserved as-is.",
    );
  }

  const desired = {
    shopify_store_id: store.storeId,
    // gid:// form to match what the GraphQL-based sync paths write - see src/utils/shopifyGid.js.
    shopify_order_id: toShopifyGid("Order", payload.id),
    shopify_original_currency: currencyCode,
    shopify_channel: store.channel,
    shopify_market: MARKET_BY_STORE[store.storeId] ?? undefined,
    shopify_financial_status: payload.financial_status,
    shopify_fulfillment_status: payload.fulfillment_status ?? "unfulfilled",
    shopify_cancelled: payload.cancelled_at ? "true" : "false",
    dealname: payload.name,
    amount: payload.current_total_price ?? payload.total_price,
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
      { shopifyOrderId: payload.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Deal object",
    );
  }

  return { properties, skippedMissingProperties };
}
