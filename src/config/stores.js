import { env } from "./env.js";

function buildStoreConfig(storeId, channel, storeUrl, accessToken, apiVersion, webhookSecret, appClientSecret) {
  if (!storeUrl || !accessToken) {
    return undefined;
  }
  return { storeId, channel, storeUrl, accessToken, apiVersion, webhookSecret, appClientSecret };
}

/**
 * Registry of configured Shopify stores. A store is only registered if both
 * its URL and access token are present in the environment - this lets
 * Phase 1 (B2B only) run without B2C credentials configured yet.
 */
export const shopifyStores = Object.fromEntries(
  [
    buildStoreConfig(
      "b2b",
      "b2b",
      env.SHOPIFY_B2B_STORE_URL,
      env.SHOPIFY_B2B_ACCESS_TOKEN,
      env.SHOPIFY_B2B_API_VERSION,
      env.SHOPIFY_B2B_WEBHOOK_SECRET,
      env.SHOPIFY_B2B_APP_CLIENT_SECRET,
    ),
    buildStoreConfig(
      "b2c",
      "b2c",
      env.SHOPIFY_B2C_STORE_URL,
      env.SHOPIFY_B2C_ACCESS_TOKEN,
      env.SHOPIFY_B2C_API_VERSION,
      env.SHOPIFY_B2C_WEBHOOK_SECRET,
      env.SHOPIFY_B2C_APP_CLIENT_SECRET,
    ),
  ]
    .filter((store) => store !== undefined)
    .map((store) => [store.storeId, store]),
);

export function getStoreConfig(storeId) {
  const store = shopifyStores[storeId];
  if (!store) {
    throw new Error(
      `Unknown or unconfigured Shopify store "${storeId}". Configure SHOPIFY_${storeId.toUpperCase()}_STORE_URL and _ACCESS_TOKEN.`,
    );
  }
  return store;
}

export function listConfiguredStores() {
  return Object.values(shopifyStores);
}

/**
 * PENDING CLIENT INPUT: Legal Entity is not yet provided per store/market.
 * Do not invent a value - surface as null until confirmed and configured here.
 */
export const LEGAL_ENTITY_BY_STORE = {
  b2b: null,
  b2c: null,
};

/**
 * Market (Section 2, Step 2 of the SOW) is a static, per-store business
 * fact for Phase 1 - not something read from a Shopify field - since Phase 1
 * is scoped to US B2B only. b2c is left null until the client confirms its
 * market(s) in a later phase, rather than guessing.
 */
export const MARKET_BY_STORE = {
  b2b: "United States",
  b2c: null,
};
