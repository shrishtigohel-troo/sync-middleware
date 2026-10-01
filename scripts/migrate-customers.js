import { getShopifyClient } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { migrateCustomers } from "../src/sync/migrateCustomers.js";
import { logger } from "../src/utils/logger.js";

/**
 * Historical migration: every customer in one store -> HubSpot Contacts.
 * Requires the explicit --confirm flag - see scripts/migrate-products.js for
 * why. Run poc:customer-sync first and verify its output before using this.
 *
 * Usage: npm run migrate:customers -- --store=b2b --confirm
 */
async function main() {
  const args = process.argv.slice(2);
  const storeArg = args.find((a) => a.startsWith("--store="))?.split("=")[1] ?? "b2b";
  const confirmed = args.includes("--confirm");

  if (!confirmed) {
    logger.error(
      { store: storeArg },
      "Refusing to run without --confirm. This will create/update HubSpot Contact records for EVERY customer in this store. " +
        "Re-run with --confirm once you've verified poc:customer-sync's output and the required HubSpot properties exist.",
    );
    process.exitCode = 1;
    return;
  }

  const store = getStoreConfig(storeArg);
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Starting full customer migration...");
  const summary = await migrateCustomers(shopify, store);
  logger.info({ store: store.storeId, ...summary }, "Customer migration complete");

  process.exitCode = summary.contactsFailed > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Customer migration FAILED");
  process.exitCode = 1;
});
