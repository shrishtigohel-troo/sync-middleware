# Currency mapping

See `src/config/currencies.js`.

Supported transaction currencies: `USD`, `EUR`, `MXN`, `GTQ`, `CRC`.

## Rule: never convert, always preserve

The middleware **preserves the Shopify order's original currency code and
amount exactly as returned by Shopify** (`currentTotalPriceSet.shopMoney`).
It never converts an amount to another currency and never overwrites the
original value with a converted one.

`isSupportedCurrency()` / `assertSupportedCurrency()` exist for **validation
only** - to flag (via a log warning, not a hard failure) if an order comes in
with a currency outside the five listed above, so it can be reviewed with the
client rather than silently mapped. Encountering an unsupported currency does
not block the sync; the value is still written as-is.

## HubSpot multi-currency

HubSpot's native company-currency / multi-currency feature can be used for
consolidated cross-currency reporting, using HubSpot's own conversion rates.
That is separate from, and does not replace, the original per-order currency
field the middleware writes (`shopify_original_currency`). Establish HubSpot's
multi-currency configuration as a reporting-layer concern, not something the
sync logic itself performs.
