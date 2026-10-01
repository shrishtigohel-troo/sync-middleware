import { getShopifyClient } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { migrateCompanies } from "../src/sync/migrateCompanies.js";
import { logger } from "../src/utils/logger.js";

/**
 * Historical migration: every B2B company in one store -> HubSpot Companies.
 * Requires the explicit --confirm flag - see scripts/migrate-products.js for
 * why. Run poc:company-sync first and verify its output before using this.
 *
 * Usage: npm run migrate:companies -- --store=b2b --confirm
 */
async function main() {
  const args = process.argv.slice(2);
  const storeArg = args.find((a) => a.startsWith("--store="))?.split("=")[1] ?? "b2b";
  const confirmed = args.includes("--confirm");

  if (!confirmed) {
    logger.error(
      { store: storeArg },
      "Refusing to run without --confirm. This will create/update HubSpot Company records for EVERY B2B company in this store. " +
        "Re-run with --confirm once you've verified poc:company-sync's output and the required HubSpot properties exist.",
    );
    process.exitCode = 1;
    return;
  }

  const store = getStoreConfig(storeArg);
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Starting full company migration...");
  const summary = await migrateCompanies(shopify, store);
  logger.info({ store: store.storeId, ...summary }, "Company migration complete");

  process.exitCode = summary.companiesFailed > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Company migration FAILED");
  process.exitCode = 1;
});
