import { iterateAllActiveProducts } from "../shopify/queries/products.js";
import { getExistingPropertyNames } from "../hubspot/properties.js";
import { HubSpotObjectApi } from "../hubspot/objects.js";
import { mapShopifyVariantToHubSpot } from "../mappings/product.js";
import { findExistingProductId } from "./findExistingProduct.js";
import { logger } from "../utils/logger.js";

/**
 * Walks every active product (and every variant on it) in the given store
 * and creates/updates the matching HubSpot Product record for each variant,
 * using the same duplicate-safe matching logic as scripts/poc-product-sync.js
 * (shopify_variant_id -> hs_sku -> weak name match).
 *
 * One failing variant does not stop the migration - it is logged and
 * counted, and processing continues with the next record. Call this from an
 * explicit, human-invoked script (see scripts/migrate-products.js); it is
 * never triggered automatically.
 */
export async function migrateProducts(shopify, store) {
  const existingProperties = await getExistingPropertyNames("products");
  const productsApi = new HubSpotObjectApi("products");

  const summary = {
    productsProcessed: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    variantsFailed: 0,
    variantsSkippedNoProperties: 0,
  };

  for await (const product of iterateAllActiveProducts(shopify)) {
    summary.productsProcessed += 1;
    const variants = product.variants.edges.map((e) => e.node);

    for (const variant of variants) {
      const { properties, skippedMissingProperties } = mapShopifyVariantToHubSpot(product, variant, existingProperties);

      if (Object.keys(properties).length === 0) {
        summary.variantsSkippedNoProperties += 1;
        logger.error(
          { store: store.storeId, shopifyProductId: product.id, shopifyVariantId: variant.id },
          "No mappable HubSpot properties exist - skipping this variant",
        );
        continue;
      }

      try {
        const existingRecordId = await findExistingProductId(productsApi, variant.id, variant.sku, existingProperties);

        if (existingRecordId) {
          await productsApi.update(existingRecordId, properties);
          summary.variantsUpdated += 1;
        } else {
          await productsApi.create(properties);
          summary.variantsCreated += 1;
        }

        logger.info(
          {
            store: store.storeId,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            operation: existingRecordId ? "update" : "create",
            success: true,
            skippedMissingProperties,
          },
          "Migrated product variant",
        );
      } catch (error) {
        summary.variantsFailed += 1;
        logger.error(
          {
            store: store.storeId,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            operation: "sync",
            success: false,
            errorCategory: error?.name ?? "Unknown",
            err: error instanceof Error ? error.message : String(error),
          },
          "Failed to migrate this variant - continuing with the rest",
        );
      }
    }

    if (summary.productsProcessed % 25 === 0) {
      logger.info({ store: store.storeId, ...summary }, "Migration progress");
    }
  }

  return summary;
}
