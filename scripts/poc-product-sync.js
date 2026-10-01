import { getShopifyClient } from "../src/shopify/client.js";
import { getStoreConfig } from "../src/config/stores.js";
import { getFirstActiveProduct } from "../src/shopify/queries/products.js";
import { getExistingPropertyNames } from "../src/hubspot/properties.js";
import { HubSpotObjectApi } from "../src/hubspot/objects.js";
import { mapShopifyVariantToHubSpot } from "../src/mappings/product.js";
import { logger } from "../src/utils/logger.js";

/**
 * Controlled, single-product proof of concept:
 * Shopify (1 product, all its variants) -> mapping/validation -> HubSpot
 * Products (1 create/update per variant).
 *
 * This intentionally never touches more than one Shopify product. It is not
 * a migration - see docs/ for the phased historical-migration plan once this
 * PoC is verified end to end.
 */
async function main() {
  const store = getStoreConfig("b2b");
  const shopify = getShopifyClient(store);

  logger.info({ store: store.storeId }, "Fetching one active product from Shopify...");
  const product = await getFirstActiveProduct(shopify);

  if (!product) {
    logger.error({ store: store.storeId }, "No active products found in this store - nothing to sync.");
    process.exitCode = 1;
    return;
  }

  const variants = product.variants.edges.map((e) => e.node);
  logger.info(
    {
      shopifyProductId: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      variantCount: variants.length,
      metafieldCount: product.metafields.edges.length,
    },
    "Fetched Shopify product (safe, non-secret fields only)",
  );

  const observedMetafields = product.metafields.edges.map((e) => ({
    namespace: e.node.namespace,
    key: e.node.key,
  }));
  if (observedMetafields.length > 0) {
    logger.info(
      { observedMetafields },
      "Metafields found on this product - compare against src/config/productMetafields.js to confirm which should be mapped",
    );
  }

  logger.info("Verifying HubSpot Product property configuration...");
  const existingProperties = await getExistingPropertyNames("products");
  const productsApi = new HubSpotObjectApi("products");

  let failures = 0;

  for (const variant of variants) {
    const { properties, skippedMissingProperties } = mapShopifyVariantToHubSpot(product, variant, existingProperties);

    if (Object.keys(properties).length === 0) {
      logger.error(
        { shopifyVariantId: variant.id },
        "No mappable properties exist on the HubSpot Product object - create at least 'name' and the properties in docs/field-mapping.md",
      );
      failures += 1;
      continue;
    }

    try {
      // Duplicate-prevention: prefer the Shopify Variant ID reference property;
      // fall back to SKU; only fall back to name as a last resort (logged as weak).
      let existingRecordId;
      let matchStrategy;

      if (existingProperties.has("shopify_variant_id")) {
        const result = await productsApi.searchByFilters([
          { propertyName: "shopify_variant_id", operator: "EQ", value: variant.id },
        ]);
        if (result.results[0]) {
          existingRecordId = result.results[0].id;
          matchStrategy = "shopify_variant_id";
        }
      }

      if (!existingRecordId && variant.sku && existingProperties.has("hs_sku")) {
        const result = await productsApi.searchByFilters([
          { propertyName: "hs_sku", operator: "EQ", value: variant.sku },
        ]);
        if (result.results[0]) {
          existingRecordId = result.results[0].id;
          matchStrategy = "hs_sku";
        }
      }

      if (!existingRecordId && existingProperties.has("name") && properties["name"]) {
        const result = await productsApi.searchByFilters([
          { propertyName: "name", operator: "EQ", value: properties["name"] },
        ]);
        if (result.results[0]) {
          existingRecordId = result.results[0].id;
          matchStrategy = "name (weak match - review manually)";
        }
      }

      if (existingRecordId) {
        logger.info(
          { shopifyVariantId: variant.id, hubspotProductId: existingRecordId, matchStrategy },
          "Existing HubSpot product found - updating",
        );
        const updated = await productsApi.update(existingRecordId, properties);
        logger.info(
          {
            shopifyVariantId: variant.id,
            hubspotProductId: updated.id,
            propertiesWritten: Object.keys(properties),
            skippedMissingProperties,
          },
          "HubSpot product UPDATED",
        );
      } else {
        logger.info({ shopifyVariantId: variant.id }, "No existing HubSpot product matched - creating a new one");
        const created = await productsApi.create(properties);
        logger.info(
          {
            shopifyVariantId: variant.id,
            hubspotProductId: created.id,
            propertiesWritten: Object.keys(properties),
            skippedMissingProperties,
          },
          "HubSpot product CREATED",
        );
      }
    } catch (error) {
      failures += 1;
      logger.error(
        { shopifyVariantId: variant.id, err: error instanceof Error ? error.message : String(error) },
        "Failed to sync this variant - continuing with the rest",
      );
    }
  }

  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "PoC product sync FAILED");
  process.exitCode = 1;
});
