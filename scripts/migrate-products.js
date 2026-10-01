import { getShopifyClient } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { migrateProducts } from "../src/sync/migrateProducts.js";
import { logger } from "../src/utils/logger.js";

/**
 * Historical migration: every active product/variant in one store ->
 * HubSpot Products. This is NOT run automatically - it requires the
 * explicit --confirm flag, precisely because it can touch a large number of
 * real records (unlike the poc:product-sync scripts, which touch exactly
 * one). Run poc:product-sync first and verify its output before using this.
 *
 * Usage: npm run migrate:products -- --store=b2b --confirm
 */
async function main() {
  const args = process.argv.slice(2);
  const storeArg = args.find((a) => a.startsWith("--store="))?.split("=")[1] ?? "b2b";
  const confirmed = args.includes("--confirm");

  if (!confirmed) {
    logger.error(
      { store: storeArg },
      "Refusing to run without --confirm. This will create/update HubSpot Product records for EVERY active product/variant in this store. " +
        "Re-run with --confirm once you've verified poc:product-sync's output and the required HubSpot properties exist.",
    );
    process.exitCode = 1;
    return;
  }

  const store = getStoreConfig(storeArg);
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Starting full product migration...");
  const summary = await migrateProducts(shopify, store);
  logger.info({ store: store.storeId, ...summary }, "Product migration complete");

  process.exitCode = summary.variantsFailed > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Product migration FAILED");
  process.exitCode = 1;
});
