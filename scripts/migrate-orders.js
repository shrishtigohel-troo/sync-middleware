import { getShopifyClient } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { migrateOrders } from "../src/sync/migrateOrders.js";
import { logger } from "../src/utils/logger.js";

/**
 * Historical migration: every order (+ line items) in one store -> HubSpot
 * Orders/Line Items. Requires the explicit --confirm flag - see
 * scripts/migrate-products.js for why. Run poc:order-sync first and verify
 * its output before using this.
 *
 * Usage: npm run migrate:orders -- --store=b2b --confirm
 */
async function main() {
  const args = process.argv.slice(2);
  const storeArg = args.find((a) => a.startsWith("--store="))?.split("=")[1] ?? "b2b";
  const confirmed = args.includes("--confirm");

  if (!confirmed) {
    logger.error(
      { store: storeArg },
      "Refusing to run without --confirm. This will create/update HubSpot Order and Line Item records for EVERY order in this store. " +
        "Re-run with --confirm once you've verified poc:order-sync's output and the required HubSpot properties exist.",
    );
    process.exitCode = 1;
    return;
  }

  const store = getStoreConfig(storeArg);
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Starting full order migration...");
  const summary = await migrateOrders(shopify, store);
  logger.info({ store: store.storeId, ...summary }, "Order migration complete");

  process.exitCode = summary.ordersFailed > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Order migration FAILED");
  process.exitCode = 1;
});
