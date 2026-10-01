import { getShopifyClient } from "../src/shopify/client.js";
import { listConfiguredStores } from "../src/config/stores.js";
import { logger } from "../src/utils/logger.js";

const SHOP_INFO_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
      primaryDomain {
        url
      }
      currencyCode
      ianaTimezone
    }
  }
`;

/**
 * Connectivity check: authenticates against each configured Shopify store
 * and logs only non-secret shop metadata. Run before any sync work to
 * confirm credentials and API version are valid.
 */
async function main() {
  const stores = listConfiguredStores();
  if (stores.length === 0) {
    logger.error(
      "No Shopify stores configured. Set SHOPIFY_B2B_STORE_URL/SHOPIFY_B2B_ACCESS_TOKEN " +
        "(and/or the B2C equivalents) in your .env file.",
    );
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const store of stores) {
    try {
      const client = getShopifyClient(store);
      const data = await client.request(SHOP_INFO_QUERY);
      logger.info(
        {
          storeId: store.storeId,
          channel: store.channel,
          apiVersion: store.apiVersion,
          shopName: data.shop.name,
          domain: data.shop.myshopifyDomain,
          currencyCode: data.shop.currencyCode,
          timezone: data.shop.ianaTimezone,
        },
        "Shopify connection OK",
      );
    } catch (error) {
      failures += 1;
      logger.error(
        { storeId: store.storeId, err: error instanceof Error ? error.message : String(error) },
        "Shopify connection FAILED",
      );
    }
  }

  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Unexpected failure");
  process.exitCode = 1;
});
