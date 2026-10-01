import { isSupportedCurrency } from "../config/currencies.js";

/**
 * Computes commerce rollup fields from a list of orders (already
 * matched/associated in HubSpot) belonging to a single record - either a
 * Contact (per-customer CLV) or a Company (company-wide purchase history,
 * per the client's B2B requirement in section 12 of the brief). The
 * calculation itself doesn't care which - it's just "rollups for this set
 * of orders" - so the same function serves both; see
 * mapRollupsToHubSpotProperties below for applying the result to either
 * object type's properties (the internal property names are identical on
 * both Contacts and Companies, so no separate mapping function is needed).
 *
 * Currency-safe by design: revenue is bucketed per currency and never
 * summed across currencies (a $100 USD order and a €100 EUR order do NOT
 * become "$200"). If a single combined figure is ever needed for reporting,
 * that conversion must happen in HubSpot's own multi-currency/reporting
 * layer (see docs/currency-mapping.md), not here.
 *
 * `orders` items: { currencyCode, amount, orderDate, cancelled }
 *
 * Cancelled/refunded orders are excluded from revenue and order-count
 * totals (but the caller may still want to sync them to HubSpot as
 * records - this only affects the rollup calculation).
 *
 * Returns: {
 *   totalOrders: number,
 *   lastOrderDate: string | undefined,   // ISO date of the most recent non-cancelled order
 *   revenueByCurrency: Record<currencyCode, string>  // string to preserve decimal precision
 * }
 */
export function computeContactRollups(orders) {
  const countedOrders = orders.filter((o) => !o.cancelled);

  const revenueByCurrency = {};
  let lastOrderDate;

  for (const order of countedOrders) {
    const currency = order.currencyCode;
    const amount = Number(order.amount);

    if (!isSupportedCurrency(currency)) {
      // Still counted (do not silently drop real revenue), but bucketed
      // under its own currency code rather than merged into a known one.
    }

    const current = revenueByCurrency[currency] ? Number(revenueByCurrency[currency]) : 0;
    revenueByCurrency[currency] = (current + amount).toFixed(2);

    if (!lastOrderDate || new Date(order.orderDate) > new Date(lastOrderDate)) {
      lastOrderDate = order.orderDate;
    }
  }

  return {
    totalOrders: countedOrders.length,
    lastOrderDate,
    revenueByCurrency,
  };
}

/**
 * Alias for computeContactRollups - identical function, used when the
 * caller is computing company-wide purchase history rather than a single
 * contact's CLV. Kept as a separate export purely for readability at call
 * sites (see src/config/hubspotProperties.js for the company rollup
 * properties this feeds into).
 */
export const computeCompanyRollups = computeContactRollups;

/**
 * Maps a computeContactRollups()/computeCompanyRollups() result onto
 * HubSpot properties, following the same "only write what's confirmed to
 * exist" rule as every other mapping in this project (see
 * src/hubspot/properties.js). Works for either Contacts or Companies - pass
 * that object type's existingHubSpotProperties set; the internal property
 * names (shopify_total_orders, shopify_revenue_usd, etc.) are the same on
 * both objects, just independently confirmed per object.
 */
export function mapRollupsToHubSpotProperties(rollups, existingHubSpotProperties) {
  const currencyPropertyMap = {
    USD: "shopify_revenue_usd",
    EUR: "shopify_revenue_eur",
    MXN: "shopify_revenue_mxn",
    GTQ: "shopify_revenue_gtq",
    CRC: "shopify_revenue_crc",
  };

  const desired = {
    shopify_total_orders: String(rollups.totalOrders),
    shopify_last_order_date: rollups.lastOrderDate,
  };

  for (const [currency, amount] of Object.entries(rollups.revenueByCurrency)) {
    const property = currencyPropertyMap[currency];
    if (property) {
      desired[property] = amount;
    }
    // Currencies with no configured property (unexpected/new currency) are
    // intentionally not written - see docs/currency-mapping.md. The data is
    // still available in `rollups.revenueByCurrency` for review.
  }

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
