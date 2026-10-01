import { getHubSpotClient } from "../src/hubspot/client.js";
import { getExistingPropertyNames } from "../src/hubspot/properties.js";
import { getSyncableProductMetafieldDefinitions } from "../src/config/productMetafields.js";
import { logger } from "../src/utils/logger.js";

/**
 * One-time setup: creates every syncable Product metafield property in
 * HubSpot that doesn't already exist. Skips ones that already exist rather
 * than failing on them. See src/config/productMetafields.js for the full
 * list and why some metafields are excluded (files, JSON, references).
 *
 * Usage: node scripts/setup-product-metafield-properties.js --confirm
 */
async function main() {
  const confirmed = process.argv.includes("--confirm");
  if (!confirmed) {
    logger.error("Refusing to run without --confirm. This will create up to ~27 new Product properties in HubSpot.");
    process.exitCode = 1;
    return;
  }

  const client = getHubSpotClient();
  const existing = await getExistingPropertyNames("products");

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const definition of getSyncableProductMetafieldDefinitions()) {
    if (existing.has(definition.hubspotProperty)) {
      skipped += 1;
      continue;
    }

    try {
      await client.request("POST", "/crm/v3/properties/products", {
        name: definition.hubspotProperty,
        label: definition.name,
        type: "string",
        fieldType: definition.handling === "richText" || definition.type === "multi_line_text_field" ? "textarea" : "text",
        groupName: "productinformation",
      });
      created += 1;
      logger.info({ property: definition.hubspotProperty }, "Created HubSpot property");
    } catch (error) {
      failed += 1;
      logger.error(
        { property: definition.hubspotProperty, err: error instanceof Error ? error.message : String(error) },
        "Failed to create this property - continuing with the rest",
      );
    }
  }

  logger.info({ created, skipped, failed }, "Product metafield property setup complete");
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Setup script FAILED");
  process.exitCode = 1;
});
