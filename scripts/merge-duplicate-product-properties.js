import { getHubSpotClient } from "../src/hubspot/client.js";
import { getExistingPropertyNames } from "../src/hubspot/properties.js";
import { HubSpotObjectApi } from "../src/hubspot/objects.js";
import { loadExistingDropdownOptions, fitExistingDropdownValues } from "../src/utils/metafieldMapping.js";
import { logger } from "../src/utils/logger.js";

/**
 * One-time cleanup: merges the Product properties the middleware created as
 * duplicates of fields that already existed in HubSpot (same label) into
 * those existing fields, then archives the duplicates so each label shows
 * once. The live sync already writes the existing fields - see
 * `existingHubSpotDropdown` in src/config/productMetafields.js.
 *
 * For every product with a value in a duplicate, that value (which the
 * middleware originally copied from Shopify) is written into the existing
 * field, matched to its dropdown options. The existing fields' definitions
 * are never changed. If any value matches no dropdown option, nothing is
 * archived, so no data is lost.
 *
 * Without --confirm this only prints what it would do.
 * Usage: node scripts/merge-duplicate-product-properties.js [--confirm]
 */

// duplicate -> existing field. Order matters for the two Technical Family
// duplicates: the live one wins over the empty test leftover.
const DUPLICATES = [
  ["shopify_category_metafield", "category"],
  ["shopify_collection", "collection"],
  ["shopify_technical_family", "family"],
  ["shopify_metafield_technical_family", "family"],
  ["shopify_mf_retail_eligible", "kind"],
];

async function findProductsWithValue(propertyName, propertiesToFetch) {
  const client = getHubSpotClient();
  const records = [];
  let after;
  do {
    const page = await client.request("POST", "/crm/v3/objects/products/search", {
      filterGroups: [{ filters: [{ propertyName, operator: "HAS_PROPERTY" }] }],
      properties: propertiesToFetch,
      limit: 100,
      ...(after ? { after } : {}),
    });
    records.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  return records;
}

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const existing = await getExistingPropertyNames("products");
  const duplicates = DUPLICATES.filter(([duplicate]) => existing.has(duplicate));
  const propertiesToFetch = ["name", ...new Set(DUPLICATES.flat())];
  const dropdownOptions = await loadExistingDropdownOptions();

  const updates = new Map();
  const unmatched = [];
  for (const [duplicate, target] of duplicates) {
    for (const record of await findProductsWithValue(duplicate, propertiesToFetch)) {
      const pending = updates.get(record.id) ?? { name: record.properties.name, current: record.properties, properties: {} };
      if (target in pending.properties) continue;

      const fitted = fitExistingDropdownValues({ [target]: record.properties[duplicate] }, dropdownOptions);
      if (fitted.unmatched.length > 0) {
        unmatched.push({ product: record.properties.name, id: record.id, duplicate, value: record.properties[duplicate] });
        continue;
      }
      if (fitted.properties[target] !== record.properties[target]) {
        pending.properties[target] = fitted.properties[target];
      }
      updates.set(record.id, pending);
    }
  }

  const toWrite = [...updates].filter(([, u]) => Object.keys(u.properties).length > 0);
  for (const [id, u] of toWrite) {
    for (const [target, value] of Object.entries(u.properties)) {
      logger.info({ product: u.name, id, field: target, from: u.current[target] ?? null, to: value }, "Copy into existing field");
    }
  }
  for (const u of unmatched) logger.warn(u, "Value matches no dropdown option - not copied");
  logger.info(
    { productsToUpdate: toWrite.length, unmatched: unmatched.length, duplicatesToArchive: duplicates.map(([d]) => d) },
    confirmed ? "Applying" : "Dry run - re-run with --confirm to apply",
  );
  if (!confirmed) return;

  if (unmatched.length > 0) {
    logger.error("Some values match no dropdown option - nothing archived. Add the options in HubSpot or fix the values, then re-run.");
    process.exitCode = 1;
    return;
  }

  const productsApi = new HubSpotObjectApi("products");
  for (let i = 0; i < toWrite.length; i += 100) {
    await productsApi.batchUpdate(toWrite.slice(i, i + 100).map(([id, u]) => ({ id, properties: u.properties })));
  }
  logger.info({ productsUpdated: toWrite.length }, "Values copied into existing fields");

  const client = getHubSpotClient();
  for (const [duplicate] of duplicates) {
    await client.request("DELETE", `/crm/v3/properties/products/${duplicate}`);
    logger.info({ property: duplicate }, "Archived duplicate property (restorable in HubSpot for 90 days)");
  }
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Merge script FAILED");
  process.exitCode = 1;
});
