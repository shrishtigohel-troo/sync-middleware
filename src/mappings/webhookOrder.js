import { isSupportedCurrency } from "../config/currencies.js";
import { MARKET_BY_STORE } from "../config/stores.js";
import { ORDER_PIPELINE_ID, getOrderPipelineStageId } from "../config/orderPipeline.js";
import { logger } from "../utils/logger.js";
import { toShopifyGid } from "../utils/shopifyGid.js";

// "partially_paid" -> "Partially paid", matching how HubSpot's native
// Shopify integration writes hs_payment_status / hs_fulfillment_status.
function toStatusLabel(value) {
  if (!value) return undefined;
  const text = String(value).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sumAmounts(values) {
  const amounts = values.map(Number).filter((n) => !Number.isNaN(n));
  return amounts.length ? amounts.reduce((a, b) => a + b, 0).toFixed(2) : undefined;
}

function joinNonEmpty(values, separator = ", ") {
  const parts = values.filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
  return parts.length ? parts.join(separator) : undefined;
}

/**
 * HubSpot's native hs_shipping_address_* / hs_billing_address_* fields,
 * which feed the Order record's "Shipping/billing address" card. Returns
 * {} when the order has no such address.
 */
function mapAddress(prefix, address) {
  if (!address) return {};
  return {
    [`${prefix}_name`]: address.name ?? joinNonEmpty([address.first_name, address.last_name], " "),
    [`${prefix}_street`]: joinNonEmpty([address.address1, address.address2]),
    [`${prefix}_city`]: address.city ?? undefined,
    [`${prefix}_state`]: address.province ?? undefined,
    [`${prefix}_country`]: address.country ?? undefined,
    [`${prefix}_postal_code`]: address.zip ?? undefined,
    [`${prefix}_phone`]: address.phone ?? undefined,
  };
}

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
    // Native HubSpot Order fields behind the record's "Order total",
    // "Discount codes" and "Shipment details" cards - the same fields the
    // native Shopify integration fills (compared live against order #3653).
    hs_subtotal_price: payload.current_subtotal_price ?? payload.subtotal_price,
    hs_order_discount: payload.current_total_discounts ?? payload.total_discounts,
    hs_tax: payload.current_total_tax ?? payload.total_tax,
    hs_shipping_cost:
      payload.total_shipping_price_set?.shop_money?.amount ??
      sumAmounts((payload.shipping_lines ?? []).map((line) => line.price)),
    hs_discount_codes: joinNonEmpty((payload.discount_codes ?? []).map((d) => d.code)),
    hs_payment_status: toStatusLabel(payload.financial_status),
    hs_fulfillment_status: toStatusLabel(payload.fulfillment_status ?? "unfulfilled"),
    hs_shipping_tracking_number: joinNonEmpty(
      (payload.fulfillments ?? []).flatMap((f) => f.tracking_numbers ?? [f.tracking_number]),
    ),
    hs_shipping_status_url: joinNonEmpty((payload.fulfillments ?? []).flatMap((f) => f.tracking_urls ?? [f.tracking_url])),
    hs_external_order_url: payload.order_status_url ?? undefined,
    hs_tags: payload.tags || undefined,
    hs_external_created_date: payload.created_at ?? undefined,
    hs_processed_date: payload.processed_at ?? undefined,
    ...mapAddress("hs_shipping_address", payload.shipping_address),
    ...mapAddress("hs_billing_address", payload.billing_address),
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
export function mapWebhookLineItemToHubSpot(lineItem, existingHubSpotProperties, currencyCode) {
  const unitPrice = Number(lineItem.price);
  // discount_allocations carries every discount applied to this line,
  // including order-level codes spread across lines; total_discount is
  // Shopify's older field and is often "0.00" even when a code applied.
  const allocated = sumAmounts((lineItem.discount_allocations ?? []).map((a) => a.amount));
  const discount = Number(allocated ?? lineItem.total_discount ?? "0");
  const amount = (unitPrice * lineItem.quantity - discount).toFixed(2);

  const desired = {
    name: lineItem.title,
    quantity: String(lineItem.quantity),
    price: lineItem.price,
    amount,
    hs_sku: lineItem.sku ?? undefined,
    // Unit discount, as HubSpot's native integration writes it - the
    // Line items card shows "after $X discount" from this.
    discount: discount > 0 && lineItem.quantity ? (discount / lineItem.quantity).toFixed(2) : undefined,
    tax: sumAmounts((lineItem.tax_lines ?? []).map((t) => t.price)),
    hs_line_item_currency_code: currencyCode,
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
