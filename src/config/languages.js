/**
 * HubSpot "Preferred Language" values the client supports.
 * Keep this list and the mapping below in sync with the actual HubSpot
 * property option values configured on the Contact "preferred_language"
 * (or equivalent) property.
 */
export const HUBSPOT_PREFERRED_LANGUAGES = ["English", "Spanish", "French", "Italian"];

/**
 * Maps a Shopify customer/order locale (IETF language tag, e.g. from
 * `customer.locale`) to a HubSpot Preferred Language option.
 *
 * This mapping is intentionally explicit and configurable rather than
 * derived (e.g. by just taking the language subtag) so unexpected locales
 * fail loudly instead of silently guessing.
 */
export const LOCALE_TO_HUBSPOT_LANGUAGE = {
  en: "English",
  "en-US": "English",
  "en-GB": "English",
  es: "Spanish",
  "es-MX": "Spanish",
  "es-ES": "Spanish",
  fr: "French",
  "fr-FR": "French",
  it: "Italian",
  "it-IT": "Italian",
};

/**
 * Resolves a Shopify locale to a HubSpot Preferred Language.
 * Returns undefined (rather than guessing) when the locale is not mapped -
 * callers must decide how to handle unmapped locales (e.g. log + skip field).
 */
export function resolvePreferredLanguage(locale) {
  if (!locale) return undefined;
  if (LOCALE_TO_HUBSPOT_LANGUAGE[locale]) return LOCALE_TO_HUBSPOT_LANGUAGE[locale];
  const base = locale.split("-")[0];
  return base ? LOCALE_TO_HUBSPOT_LANGUAGE[base] : undefined;
}
