import { getShopifyClient } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { migrateDeals } from "../src/sync/migrateDeals.js";
import { logger } from "../src/utils/logger.js";

/**
 * Historical migration: every order (+ line items) in one store -> HubSpot
 * Deals/Line Items. See src/mappings/deal.js for why Deals are used instead
 * of the Orders object for this client. Requires the explicit --confirm
 * flag - see scripts/migrate-products.js for why.
 *
 * Usage: npm run migrate:deals -- --store=b2b --confirm
 */
async function main() {
  const args = process.argv.slice(2);
  const storeArg = args.find((a) => a.startsWith("--store="))?.split("=")[1] ?? "b2b";
  const confirmed = args.includes("--confirm");

  if (!confirmed) {
    logger.error(
      { store: storeArg },
      "Refusing to run without --confirm. This will create/update HubSpot Deal and Line Item records for EVERY order in this store. " +
        "Re-run with --confirm once the required HubSpot Deal properties exist.",
    );
    process.exitCode = 1;
    return;
  }

  const store = getStoreConfig(storeArg);
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Starting full deal migration...");
  const summary = await migrateDeals(shopify, store);
  logger.info({ store: store.storeId, ...summary }, "Deal migration complete");

  process.exitCode = summary.dealsFailed > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Deal migration FAILED");
  process.exitCode = 1;
});
