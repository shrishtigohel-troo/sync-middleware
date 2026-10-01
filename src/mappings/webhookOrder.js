import { isSupportedCurrency } from "../config/currencies.js";
import { MARKET_BY_STORE } from "../config/stores.js";
import { ORDER_PIPELINE_ID, getOrderPipelineStageId } from "../config/orderPipeline.js";
import { logger } from "../utils/logger.js";
import { toShopifyGid } from "../utils/shopifyGid.js";

/**
 * Maps a Shopify REST "orders/*" webhook payload to HubSpot Order
 * properties. REST-shaped counterpart to src/mappings/order.js. Same
 * compound-key rule applies: shopify_store_id + shopify_order_id together,
 * never shopify_order_id alone (see docs/object-matching-rules.md).
 *
 * NOTE: the B2B "purchasing company" is not read here - the exact REST
 * webhook field for it has not been confirmed, and this deliberately does
 * not guess at an uncertain field name. Order <-> Company association for
 * webhook-driven syncs is not yet implemented; use the GraphQL-based
 * poc-order-sync.js / migrateOrders.js path for that until confirmed.
 *
 * Returns { properties, skippedMissingProperties }
 */
export function mapWebhookOrderToHubSpot(payload, store, existingHubSpotProperties) {
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
    hs_order_name: payload.name,
    hs_currency_code: currencyCode,
    hs_total_price: payload.current_total_price ?? payload.total_price,
    shopify_financial_status: payload.financial_status,
    shopify_fulfillment_status: payload.fulfillment_status ?? "unfulfilled",
    shopify_cancelled: payload.cancelled_at ? "true" : "false",
    // Native HubSpot Order pipeline/stage - see src/config/orderPipeline.js.
    hs_pipeline: ORDER_PIPELINE_ID,
    hs_pipeline_stage: getOrderPipelineStageId({
      cancelled: Boolean(payload.cancelled_at),
      financialStatus: payload.financial_status,
      fulfillmentStatus: payload.fulfillment_status,
    }),
    // HubSpot's own native reference fields - see src/mappings/order.js for why.
    // The REST webhook payload already gives the plain numeric id.
    hs_external_order_id: String(payload.id),
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
      { shopifyOrderId: payload.id, skippedMissingProperties },
      "Skipped writing HubSpot properties that do not exist yet on the Order object",
    );
  }

  return { properties, skippedMissingProperties };
}

/**
 * Maps one REST order line_item to HubSpot Line Item properties.
 * REST-shaped counterpart to src/mappings/lineItem.js.
 */
export function mapWebhookLineItemToHubSpot(lineItem, existingHubSpotProperties) {
  const unitPrice = Number(lineItem.price);
  const discount = Number(lineItem.total_discount ?? "0");
  const amount = (unitPrice * lineItem.quantity - discount).toFixed(2);

  const desired = {
    name: lineItem.title,
    quantity: String(lineItem.quantity),
    price: lineItem.price,
    amount,
    hs_sku: lineItem.sku ?? undefined,
    shopify_variant_id: lineItem.variant_id ? toShopifyGid("ProductVariant", lineItem.variant_id) : undefined,
    // Custom property used to make line item sync idempotent - see src/mappings/lineItem.js
    // for why HubSpot's native hs_external_id field couldn't be used instead.
    shopify_line_item_id: toShopifyGid("LineItem", lineItem.id),
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

  return { properties, skippedMissingProperties };
}
