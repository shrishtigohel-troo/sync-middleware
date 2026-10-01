/**
 * Supported transaction currencies. The middleware must preserve the Shopify
 * order's original currency and amount - this list is used for validation
 * only, never for conversion.
 */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "MXN", "GTQ", "CRC"];

export function isSupportedCurrency(code) {
  return SUPPORTED_CURRENCIES.includes(code);
}

export function assertSupportedCurrency(code) {
  if (!isSupportedCurrency(code)) {
    throw new Error(
      `Unsupported currency "${code}". Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}. ` +
        "If this is a new market currency, confirm with the client before adding it.",
    );
  }
  return code;
}
