import { Router } from "express";
import { waitUntil } from "@vercel/functions";
import { verifyShopifyWebhook } from "./verifyShopifyWebhook.js";
import { WebhookIdempotencyStore } from "./webhookIdempotency.js";
import { shopifyStores, getStoreConfig } from "../config/stores.js";
import { getShopifyClient } from "../shopify/client.js";
import { getOrderPurchasingCompany } from "../shopify/queries/orders.js";
import { getProductCategoryAndMetafields } from "../shopify/queries/products.js";
import { getCompanyById } from "../shopify/queries/companies.js";
import { getExistingPropertyNames, listObjectProperties } from "../hubspot/properties.js";
import { HubSpotObjectApi } from "../hubspot/objects.js";
import { associateRecords, getDefaultAssociationType, listAssociatedObjectIds } from "../hubspot/associations.js";
import { mapWebhookProductVariantToHubSpot } from "../mappings/webhookProduct.js";
import {
  ensureMetafieldPropertyExists,
  loadExistingDropdownOptions,
  fitExistingDropdownValues,
  buildLabelIndex,
} from "../utils/metafieldMapping.js";
import { mapWebhookCustomerToHubSpot } from "../mappings/webhookCustomer.js";
import { mapCompanyLocationToHubSpot } from "../mappings/companyLocation.js";
import { mapWebhookOrderToHubSpot, mapWebhookLineItemToHubSpot } from "../mappings/webhookOrder.js";
import { toShopifyGid, extractShopifyNumericId } from "../utils/shopifyGid.js";
import { findExistingOrderId } from "../sync/findExistingOrder.js";
import { findExistingProductId } from "../sync/findExistingProduct.js";
import { findExistingLineItemId } from "../sync/findExistingLineItem.js";
import { associateCompanyContacts } from "../sync/associateCompanyContacts.js";
import { ConcurrencyLock } from "./concurrencyLock.js";
import { sendFailureAlert } from "../utils/emailAlert.js";
import { logger } from "../utils/logger.js";

const idempotencyStore = new WebhookIdempotencyStore();

// Serializes processing per Shopify record, so two webhooks that arrive
// close together for the same product/customer/order (which Shopify does
// routinely - e.g. a "create" then an "update" a second later) can never
// both run "search HubSpot, then create if not found" at the same time and
// both create a duplicate. Found via a live test - see
// docs/object-matching-rules.md.
const recordLock = new ConcurrencyLock();

/**
 * Resolves which configured Shopify store sent this webhook, using the
 * X-Shopify-Shop-Domain header - required because the middleware serves
 * webhooks from more than one store (B2B and, eventually, B2C).
 */
function resolveStoreFromRequest(req) {
  const shopDomain = req.get("X-Shopify-Shop-Domain");
  return Object.values(shopifyStores).find((s) => s.storeUrl === shopDomain);
}

/**
 * Processes a single product webhook payload: creates/updates one HubSpot
 * Product per variant, using the same duplicate-safe matching as
 * scripts/poc-product-sync.js. The REST webhook payload includes `vendor`
 * directly, but not the built-in Category or metafields - those are
 * fetched with one extra GraphQL lookup per product (not per variant) via
 * getProductCategoryAndMetafields - see src/mappings/webhookProduct.js.
 */
// Maps shopifyVariantId -> hubspotProductId, populated the moment this
// process creates a product record. Same reasoning as
// recentlyUpsertedOrderIds / recentlyUpsertedLocationRecordIds above -
// HubSpot's Search API is only eventually consistent, and a create+update
// webhook landing back to back for the same product variant (which Shopify
// does routinely) can both run the search before the first create is
// indexed, producing two HubSpot Products for one Shopify variant -
// confirmed live. Grows for the life of the process, same accepted
// tradeoff as ConcurrencyLock.
const recentlyUpsertedProductIds = new Map();

async function handleProductWebhook(payload, store) {
  const productPropertyList = await listObjectProperties("products");
  const existingProperties = new Set(productPropertyList.map((p) => p.name));
  const labelIndex = buildLabelIndex(productPropertyList);
  const productsApi = new HubSpotObjectApi("products");

  let categoryAndMetafields;
  try {
    const shopify = getShopifyClient(store);
    categoryAndMetafields = await getProductCategoryAndMetafields(shopify, toShopifyGid("Product", payload.id));
  } catch (error) {
    logger.warn(
      { shopifyProductId: payload.id, err: error instanceof Error ? error.message : String(error) },
      "Failed to fetch product category/metafields - continuing without them",
    );
  }

  // Auto-create the HubSpot property for any metafield observed on this
  // product that doesn't have one yet, so every metafield genuinely syncs -
  // not just the ones someone remembered to pre-create. Mutates
  // existingProperties in place so the mapping below picks them up
  // immediately, in this same webhook delivery.
  for (const node of categoryAndMetafields?.metafields ?? []) {
    await ensureMetafieldPropertyExists(node.namespace, node.key, node.type, existingProperties, {
      displayName: node.definition?.name,
      labelIndex,
    });
  }

  const dropdownOptions = await loadExistingDropdownOptions();
  const unmatchedDropdownValues = new Map();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const variant of payload.variants ?? []) {
    const mapped = mapWebhookProductVariantToHubSpot(payload, variant, existingProperties, categoryAndMetafields);
    const { properties, unmatched } = fitExistingDropdownValues(mapped.properties, dropdownOptions);
    for (const u of unmatched) unmatchedDropdownValues.set(`${u.propertyName}=${u.value}`, u);
    if (Object.keys(properties).length === 0) {
      skipped += 1;
      continue;
    }

    const variantCacheKey = `${store.storeId}:${variant.id}`;

    // Checks the in-process cache first (avoids the HubSpot Search API's
    // eventual-consistency lag for a create+update landing back to back),
    // then falls back to checking BOTH our own key AND SKU, so we converge
    // with any record the native Shopify integration already created
    // instead of duplicating it (and then failing on HubSpot's
    // SKU-uniqueness constraint) - see docs/object-matching-rules.md.
    let existingRecordId = recentlyUpsertedProductIds.get(variantCacheKey);
    if (!existingRecordId) {
      existingRecordId = await findExistingProductId(
        productsApi,
        toShopifyGid("ProductVariant", variant.id),
        variant.sku,
        existingProperties,
      );
    }

    let hubspotProductId;
    if (existingRecordId) {
      const updatedRecord = await productsApi.update(existingRecordId, properties);
      hubspotProductId = updatedRecord.id;
      updated += 1;
    } else {
      const createdRecord = await productsApi.create(properties);
      hubspotProductId = createdRecord.id;
      created += 1;
    }
    recentlyUpsertedProductIds.set(variantCacheKey, hubspotProductId);
  }

  if (unmatchedDropdownValues.size > 0) {
    const context = { store: store.storeId, shopifyProductId: payload.id, productTitle: payload.title, unmatched: [...unmatchedDropdownValues.values()] };
    logger.warn(context, "Metafield value is not an option of the existing HubSpot dropdown - that field was not written");
    await sendFailureAlert({ subject: "Product metafield value not in HubSpot dropdown", context });
  }

  logger.info(
    { shopifyProductId: payload.id, variantsCreated: created, variantsUpdated: updated, variantsSkipped: skipped },
    "Product webhook processed successfully",
  );
}

/**
 * Processes a single customer webhook payload: creates/updates one HubSpot
 * Contact, matched strictly by email (see docs/object-matching-rules.md).
 */
async function handleCustomerWebhook(payload, store) {
  if (!payload.email) {
    logger.warn({ store: store.storeId, shopifyCustomerId: payload.id }, "Customer webhook has no email - skipping");
    return;
  }

  const existingProperties = await getExistingPropertyNames("contacts");
  const { properties } = mapWebhookCustomerToHubSpot(payload, store, existingProperties);
  if (Object.keys(properties).length === 0) {
    logger.warn({ shopifyCustomerId: payload.id }, "No mappable HubSpot properties exist for this customer - skipped");
    return;
  }

  const contactsApi = new HubSpotObjectApi("contacts");
  const result = await contactsApi.searchByFilters([{ propertyName: "email", operator: "EQ", value: payload.email }]);
  const existingId = result.results[0]?.id;

  if (existingId) {
    await contactsApi.update(existingId, properties);
  } else {
    await contactsApi.create(properties);
  }

  logger.info(
    { shopifyCustomerId: payload.id, operation: existingId ? "update" : "create" },
    "Customer webhook processed successfully",
  );
}

/**
 * Processes company webhooks: creates/updates ONE HubSpot Company record PER
 * Shopify Company Location, named "<company name> (<location name>)" - not
 * one combined record. A Shopify Company with 3 locations produces 3 HubSpot
 * Companies. Matched by shopify_location_id, which is globally unique per
 * location (see src/mappings/companyLocation.js).
 *
 * NOTE: unlike the full migration (src/sync/migrateCompanies.js), this does
 * NOT associate company contacts - the standard Shopify company webhook
 * payload does not include the company's contacts, so there is nothing to
 * associate from here. Run the company migration script periodically (or
 * after new contacts are added) to keep associations current.
 */
// Maps shopifyLocationId -> hubspotRecordId, populated the moment this
// process creates a record. HubSpot's Search API (used below for the normal
// lookup) is only eventually consistent - a create followed by a search a
// couple of seconds later can still come back empty, which is exactly what
// happens with the company_locations webhooks (create + update always land
// back to back for the same change) and produced duplicate HubSpot Companies
// in live testing. This cache lets a second call for the same location
// within this same process skip the search entirely and go straight to the
// correct record. Grows for the life of the process (one entry per distinct
// location ever synced) - same accepted tradeoff as ConcurrencyLock, see
// src/middleware/concurrencyLock.js.
const recentlyUpsertedLocationRecordIds = new Map();

/**
 * Shared upsert: given the mapped HubSpot properties for one Company
 * Location record, finds the existing record by shopify_location_id (if
 * possible) and creates or updates it.
 */
async function upsertHubSpotCompanyLocation(shopifyLocationGid, properties, existingProperties) {
  if (Object.keys(properties).length === 0) {
    logger.warn({ shopifyLocationGid }, "No mappable HubSpot properties exist for this company location - skipped");
    return;
  }

  const companiesApi = new HubSpotObjectApi("companies");

  let existingId = recentlyUpsertedLocationRecordIds.get(shopifyLocationGid);

  if (!existingId && existingProperties.has("shopify_location_id")) {
    const result = await companiesApi.searchByFilters([
      { propertyName: "shopify_location_id", operator: "EQ", value: shopifyLocationGid },
    ]);
    existingId = result.results[0]?.id;

    // Records created before the one-record-per-location model have the
    // right shopify_company_id but no shopify_location_id, so the search
    // above never finds them - and orders, which match companies by
    // location, never get associated. Adopt such a record (setting its
    // location id below) instead of creating a duplicate beside it.
    const shopifyCompanyGid = properties.shopify_company_id;
    if (!existingId && shopifyCompanyGid && existingProperties.has("shopify_company_id")) {
      const legacy = await companiesApi.searchByFilters([
        { propertyName: "shopify_company_id", operator: "EQ", value: shopifyCompanyGid },
        { propertyName: "shopify_location_id", operator: "NOT_HAS_PROPERTY" },
      ]);
      existingId = legacy.results[0]?.id;
      if (existingId) {
        logger.info({ shopifyLocationGid, hubspotCompanyId: existingId }, "Adopting legacy company record that had no shopify_location_id");
      }
    }
  } else if (!existingId) {
    logger.warn(
      { shopifyLocationGid },
      "shopify_location_id does not exist on HubSpot Companies yet - cannot safely match, this will create a duplicate if the location already exists",
    );
  }

  const operation = existingId ? "update" : "create";

  if (existingId) {
    await companiesApi.update(existingId, properties);
  } else {
    const created = await companiesApi.create(properties);
    existingId = created.id;
  }

  recentlyUpsertedLocationRecordIds.set(shopifyLocationGid, existingId);

  logger.info({ shopifyLocationGid, operation }, "Company Location webhook processed successfully");
}

async function handleCompanyWebhook(payload, store) {
  // The companies/create and companies/update REST webhook payload has no
  // plain numeric `id` field, only `admin_graphql_api_id` (already a full
  // gid:// string) - confirmed live, same pattern as the company_locations
  // and company_contacts payloads.
  const companyGid = payload.admin_graphql_api_id;
  const existingProperties = await getExistingPropertyNames("companies");
  const shopify = getShopifyClient(store);
  const company = await getCompanyById(shopify, companyGid);

  if (!company) {
    logger.warn({ shopifyCompanyId: companyGid }, "Company webhook referenced a company that could not be found - skipped");
    return;
  }

  for (const { node: location } of company.locations.edges) {
    const { properties } = mapCompanyLocationToHubSpot(
      {
        companyName: company.name,
        companyNote: company.note,
        companyGid: company.id,
        locationGid: location.id,
        locationName: location.name,
      },
      store,
      existingProperties,
    );
    await upsertHubSpotCompanyLocation(location.id, properties, existingProperties);
  }
}

/**
 * Processes a company_locations/create or company_locations/update webhook -
 * creates/updates the ONE HubSpot Company record for this specific location.
 * The standard Company webhooks (companies/create, companies/update) do NOT
 * fire when a location is added to or changed on an already-existing
 * company, confirmed live - so without this separate handler, a location
 * added after the company already exists would never get its own HubSpot
 * record.
 *
 * The payload carries the location directly at the top level (its own
 * `name` and `admin_graphql_api_id`, already a full gid:// string) plus a
 * nested `company` object with the parent company's `name` and
 * `admin_graphql_api_id` - confirmed live. The nested company object does
 * NOT include the company's note/description, so that field is simply not
 * touched by this path (companies/update keeps it current instead).
 */
async function handleCompanyLocationWebhook(payload, store) {
  const locationGid = payload.admin_graphql_api_id;
  const existingProperties = await getExistingPropertyNames("companies");

  const { properties } = mapCompanyLocationToHubSpot(
    {
      companyName: payload.company?.name,
      companyNote: undefined,
      companyGid: payload.company?.admin_graphql_api_id,
      locationGid,
      locationName: payload.name,
    },
    store,
    existingProperties,
  );
  await upsertHubSpotCompanyLocation(locationGid, properties, existingProperties);
}

/**
 * Processes a company_contacts/create or company_contacts/update webhook -
 * makes Contact <-> Company association live, instead of only running via
 * the periodic migrateCompanies script. Rather than depending on the exact
 * shape of the company_contacts payload (unconfirmed, and this topic's
 * payload may not include a resolvable customer email directly), this
 * re-fetches the full company's current contact list via GraphQL (same
 * query used by the migration script) and re-associates ALL of that
 * company's contacts to EVERY one of its HubSpot location-records - a
 * contact isn't tied to one specific location in our data model, see
 * src/sync/associateCompanyContacts.js.
 */
async function handleCompanyContactWebhook(payload, store) {
  // Two different topics land here with two different payload shapes:
  // company_contacts/create|update have a top-level `company` object, but
  // company_contact_roles/assign|revoke instead nest it under
  // `company_location.company` - confirmed live.
  const companyGid =
    payload.company?.admin_graphql_api_id ?? payload.company_location?.company?.admin_graphql_api_id;
  if (!companyGid) {
    logger.warn(
      { payloadKeys: Object.keys(payload ?? {}), payload },
      "Company Contact webhook missing a resolvable company reference - skipped",
    );
    return;
  }

  const shopify = getShopifyClient(store);
  const company = await getCompanyById(shopify, companyGid);
  if (!company) {
    logger.warn({ companyGid }, "Company Contact webhook referenced a company that could not be found - skipped");
    return;
  }

  const existingContactProperties = await getExistingPropertyNames("contacts");
  const companiesApi = new HubSpotObjectApi("companies");
  const locationRecords = await companiesApi.searchByFilters(
    [{ propertyName: "shopify_company_id", operator: "EQ", value: companyGid }],
    undefined,
    50,
  );

  let contactsAssociated = 0;
  for (const record of locationRecords.results) {
    const result = await associateCompanyContacts(company, record.id, existingContactProperties);
    contactsAssociated += result.associated;
  }

  logger.info(
    { shopifyCompanyId: companyGid, locationRecordsUpdated: locationRecords.results.length, contactsAssociated },
    "Company Contact webhook processed successfully",
  );
}

// Maps shopifyOrderId -> hubspotOrderId, populated the moment this process
// creates an order. Same reasoning as recentlyUpsertedLocationRecordIds
// above - HubSpot's Search API is only eventually consistent, and a
// create + update webhook landing back to back for the same order (which
// Shopify does routinely) can both run the search before the first create
// is indexed, producing two HubSpot Orders for one Shopify order -
// confirmed live. Grows for the life of the process, same accepted
// tradeoff as ConcurrencyLock.
const recentlyUpsertedOrderIds = new Map();

/**
 * Finds the HubSpot Company record for an order's purchasing location: by
 * shopify_location_id, or else a legacy record for the same Shopify company
 * that has no location id yet (created before one-record-per-location -
 * see upsertHubSpotCompanyLocation). A legacy record is given the location
 * id so later lookups match it directly. Returns undefined if neither exists.
 */
export async function findCompanyRecordForLocation({ companyId, locationId }, existingCompanyProperties) {
  const companiesApi = new HubSpotObjectApi("companies");
  const cachedId = recentlyUpsertedLocationRecordIds.get(locationId);
  if (cachedId) return cachedId;

  const byLocation = await companiesApi.searchByFilters([
    { propertyName: "shopify_location_id", operator: "EQ", value: locationId },
  ]);
  if (byLocation.results[0]) return byLocation.results[0].id;

  if (!companyId || !existingCompanyProperties.has("shopify_company_id")) return undefined;
  const legacy = await companiesApi.searchByFilters([
    { propertyName: "shopify_company_id", operator: "EQ", value: companyId },
    { propertyName: "shopify_location_id", operator: "NOT_HAS_PROPERTY" },
  ]);
  const legacyId = legacy.results[0]?.id;
  if (legacyId) {
    await companiesApi.update(legacyId, { shopify_location_id: locationId });
    recentlyUpsertedLocationRecordIds.set(locationId, legacyId);
    logger.info({ shopifyLocationGid: locationId, hubspotCompanyId: legacyId }, "Adopting legacy company record that had no shopify_location_id");
  }
  return legacyId;
}

/**
 * Archives any extra copies of the same Shopify line item on one HubSpot
 * order, keeping the lowest record id. On Vercel two webhooks for the same
 * order can run at the same moment in separate instances (the in-memory
 * ConcurrencyLock does not span instances), so both can create the same
 * line item before either sees the other's. Every run keeps the same
 * record, so two runs cleaning up at once still agree. Only middleware
 * line items (those with shopify_line_item_id) are touched.
 */
export async function removeDuplicateLineItems(lineItemsApi, hubspotOrderId) {
  const byShopifyId = new Map();
  for (const id of await listAssociatedObjectIds("orders", hubspotOrderId, "line_items")) {
    const record = await lineItemsApi.getById(id, ["shopify_line_item_id"]);
    const shopifyLineItemGid = record.properties?.shopify_line_item_id;
    if (!shopifyLineItemGid) continue;
    if (!byShopifyId.has(shopifyLineItemGid)) byShopifyId.set(shopifyLineItemGid, []);
    byShopifyId.get(shopifyLineItemGid).push(id);
  }

  let removed = 0;
  for (const ids of byShopifyId.values()) {
    ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    for (const duplicateId of ids.slice(1)) {
      await lineItemsApi.archive(duplicateId);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Processes a single order webhook payload: creates/updates one HubSpot
 * Order (compound-key matched), its line items, and associates the order to
 * its Contact (matched by email) and, if the order has a B2B purchasing
 * company, to that specific company LOCATION's HubSpot Company record
 * (matched by Shopify Location ID, not Company ID - each location has its
 * own HubSpot Company record now, see src/mappings/companyLocation.js and
 * docs/object-matching-rules.md). The client's HubSpot portal now has the
 * Orders object available, so this is the live path again (see
 * src/mappings/deal.js / src/sync/migrateDeals.js for the Deal-based
 * alternative, kept in place but not used live).
 *
 * The REST order webhook payload does not reliably include the B2B
 * purchasing company/location, so this makes one extra GraphQL lookup
 * (getOrderPurchasingCompany) to fetch it directly from Shopify rather
 * than guessing at an unconfirmed webhook field name.
 */
export async function handleOrderWebhook(payload, store) {
  const [existingOrderProperties, existingLineItemProperties] = await Promise.all([
    getExistingPropertyNames("orders"),
    getExistingPropertyNames("line_items"),
  ]);

  const { properties: orderProperties } = mapWebhookOrderToHubSpot(payload, store, existingOrderProperties);
  if (Object.keys(orderProperties).length === 0) {
    logger.warn({ shopifyOrderId: payload.id }, "No mappable HubSpot properties exist for this order - skipped");
    return;
  }

  const ordersApi = new HubSpotObjectApi("orders");
  const lineItemsApi = new HubSpotObjectApi("line_items");
  const orderCacheKey = `${store.storeId}:${payload.id}`;

  // Checks the in-process cache first (avoids the HubSpot Search API's
  // eventual-consistency lag for a create+update landing back to back),
  // then falls back to searching BOTH our own compound key AND HubSpot's
  // native reference fields, so we converge with any record the native
  // Shopify integration already created instead of duplicating it - see
  // docs/object-matching-rules.md.
  let existingOrderId = recentlyUpsertedOrderIds.get(orderCacheKey);
  if (!existingOrderId) {
    existingOrderId = await findExistingOrderId(
      ordersApi,
      store,
      toShopifyGid("Order", payload.id),
      existingOrderProperties,
    );
  }

  let hubspotOrderId;
  let orderOperation;
  if (existingOrderId) {
    const updated = await ordersApi.update(existingOrderId, orderProperties);
    hubspotOrderId = updated.id;
    orderOperation = "update";
  } else {
    const created = await ordersApi.create(orderProperties);
    hubspotOrderId = created.id;
    orderOperation = "create";
  }
  recentlyUpsertedOrderIds.set(orderCacheKey, hubspotOrderId);

  const customerEmail = payload.email ?? payload.customer?.email;
  if (customerEmail) {
    try {
      const orderToContactAssociation = await getDefaultAssociationType("orders", "contacts");
      if (orderToContactAssociation) {
        const contactsApi = new HubSpotObjectApi("contacts");
        const contactMatch = await contactsApi.searchByFilters([
          { propertyName: "email", operator: "EQ", value: customerEmail },
        ]);
        const hubspotContactId = contactMatch.results[0]?.id;
        if (hubspotContactId) {
          await associateRecords("orders", hubspotOrderId, "contacts", hubspotContactId, [orderToContactAssociation]);
        }
      }
    } catch (error) {
      logger.warn(
        { shopifyOrderId: payload.id, err: error instanceof Error ? error.message : String(error) },
        "Failed to associate order to its contact - continuing",
      );
    }
  }

  try {
    const existingCompanyProperties = await getExistingPropertyNames("companies");
    const orderToCompanyAssociation = await getDefaultAssociationType("orders", "companies");
    if (existingCompanyProperties.has("shopify_location_id") && orderToCompanyAssociation) {
      const shopify = getShopifyClient(store);
      const purchasing = await getOrderPurchasingCompany(shopify, toShopifyGid("Order", payload.id));
      let hubspotCompanyId = purchasing?.locationId
        ? await findCompanyRecordForLocation(purchasing, existingCompanyProperties)
        : undefined;
      // The location has no HubSpot record yet (e.g. its company_locations
      // webhook was missed - confirmed live on order #3821, placed under a
      // second location that never synced). Sync the whole company from
      // Shopify the same way companies/update does, then look again.
      if (!hubspotCompanyId && purchasing?.locationId && purchasing.companyId) {
        logger.info({ shopifyOrderId: payload.id, ...purchasing }, "Order's company location has no HubSpot record - syncing the company first");
        await recordLock.withLock(`company:${store.storeId}:${extractShopifyNumericId(purchasing.companyId)}`, () =>
          handleCompanyWebhook({ admin_graphql_api_id: purchasing.companyId }, store),
        );
        hubspotCompanyId = await findCompanyRecordForLocation(purchasing, existingCompanyProperties);
      }
      if (hubspotCompanyId) {
        await associateRecords("orders", hubspotOrderId, "companies", hubspotCompanyId, [orderToCompanyAssociation]);
      } else if (purchasing?.locationId) {
        logger.warn(
          { shopifyOrderId: payload.id, ...purchasing },
          "No HubSpot Company found for this order's purchasing location - order not associated to a company",
        );
      }
    }
  } catch (error) {
    logger.warn(
      { shopifyOrderId: payload.id, err: error instanceof Error ? error.message : String(error) },
      "Failed to associate order to its company - continuing",
    );
  }

  const lineItemToOrderAssociation = await getDefaultAssociationType("line_items", "orders");

  // Line items already attached to this HubSpot order, keyed by
  // shopify_line_item_id. Read through the order's associations (strongly
  // consistent) rather than relying only on the Search API: orders/create
  // and orders/updated land back to back, and the second webhook's search
  // could not see the line item the first had just created, giving the
  // order two copies of every line item - confirmed live on order #3802.
  const attachedLineItemIds = new Map();
  if (existingLineItemProperties.has("shopify_line_item_id")) {
    for (const id of await listAssociatedObjectIds("orders", hubspotOrderId, "line_items")) {
      const record = await lineItemsApi.getById(id, ["shopify_line_item_id"]);
      const shopifyLineItemGid = record.properties?.shopify_line_item_id;
      if (shopifyLineItemGid && !attachedLineItemIds.has(shopifyLineItemGid)) {
        attachedLineItemIds.set(shopifyLineItemGid, id);
      }
    }
  }

  let lineItemsCreated = 0;
  let lineItemsUpdated = 0;
  for (const lineItem of payload.line_items ?? []) {
    const { properties: lineItemProperties } = mapWebhookLineItemToHubSpot(lineItem, existingLineItemProperties, payload.currency);
    if (Object.keys(lineItemProperties).length === 0) continue;

    // Matched via the custom shopify_line_item_id property, checking this
    // order's attached line items first, then search - see src/sync/findExistingLineItem.js.
    const shopifyLineItemGid = toShopifyGid("LineItem", lineItem.id);
    const existingLineItemId =
      attachedLineItemIds.get(shopifyLineItemGid) ??
      (await findExistingLineItemId(lineItemsApi, shopifyLineItemGid, existingLineItemProperties));

    let hubspotLineItemId;
    if (existingLineItemId) {
      const updated = await lineItemsApi.update(existingLineItemId, lineItemProperties);
      hubspotLineItemId = updated.id;
      lineItemsUpdated += 1;
    } else {
      const created = await lineItemsApi.create(lineItemProperties);
      hubspotLineItemId = created.id;
      lineItemsCreated += 1;
    }

    if (lineItemToOrderAssociation) {
      await associateRecords("line_items", hubspotLineItemId, "orders", hubspotOrderId, [lineItemToOrderAssociation]);
    }
  }

  const lineItemsRemoved = existingLineItemProperties.has("shopify_line_item_id")
    ? await removeDuplicateLineItems(lineItemsApi, hubspotOrderId)
    : 0;

  logger.info(
    { shopifyOrderId: payload.id, hubspotOrderId, operation: orderOperation, lineItemsCreated, lineItemsUpdated, lineItemsRemoved },
    "Order webhook processed successfully",
  );
}

/**
 * Express router mounting Shopify webhook endpoints. Each route:
 * 1. Verifies the HMAC signature against the sending store's webhook secret
 * 2. Deduplicates via the delivery's X-Shopify-Webhook-Id header
 * 3. Responds 200 immediately (so Shopify does not retry/time out), then
 *    processes the write to HubSpot in the background
 *
 * NOTE: background processing here is fire-and-forget in-process - there is
 * no persistent queue. If the process crashes between the 200 response and
 * finishing the HubSpot write, that update is lost. For production-scale
 * webhook volume, replace this with a real queue (e.g. a database-backed
 * job table or Redis/BullMQ) - this is flagged as a known limitation, not
 * silently glossed over.
 */
export function createWebhookRouter() {
  const router = Router();

  router.use((req, res, next) => {
    const store = resolveStoreFromRequest(req);
    if (!store) {
      logger.warn({ shopDomain: req.get("X-Shopify-Shop-Domain") }, "Webhook received for an unconfigured store");
      res.status(404).json({ error: "Unknown store" });
      return;
    }

    // Topics registered via the store's Notifications page (products, orders,
    // customers) are signed with the store-wide webhook secret. Topics that
    // can only be registered through the app's own API connection - Company
    // and Company Location events are not offered as a Notifications-page
    // topic at all - are instead signed with the app's Client Secret. Using
    // the wrong one here fails every delivery with 401, which is exactly what
    // happened in testing before this branch was added - see
    // docs/object-matching-rules.md.
    const topic = req.get("X-Shopify-Topic") ?? "";
    const isAppRegisteredTopic =
      topic.startsWith("companies/") ||
      topic.startsWith("company_locations/") ||
      topic.startsWith("company_contacts/") ||
      topic.startsWith("company_contact_roles/");
    const secret = isAppRegisteredTopic ? store.appClientSecret : store.webhookSecret;

    if (!secret) {
      logger.error(
        { store: store.storeId, topic, secretType: isAppRegisteredTopic ? "appClientSecret" : "webhookSecret" },
        "Webhook received but the required secret is not configured for this store/topic",
      );
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }
    req.shopifyStoreId = store.storeId;
    verifyShopifyWebhook(secret)(req, res, next);
  });

  router.use((req, res, next) => {
    const webhookId = req.get("X-Shopify-Webhook-Id");
    if (!webhookId) {
      res.status(400).json({ error: "Missing X-Shopify-Webhook-Id header" });
      return;
    }
    if (!idempotencyStore.markIfNew(webhookId)) {
      logger.info({ webhookId }, "Duplicate webhook delivery - already processed, acknowledging without reprocessing");
      res.status(200).json({ status: "duplicate-ignored" });
      return;
    }
    logger.info(
      { store: req.shopifyStoreId, topic: req.get("X-Shopify-Topic"), webhookId },
      "Webhook received - verified and accepted for processing",
    );
    next();
  });

  router.post("/products", (req, res) => {
    res.status(200).json({ status: "accepted" });
    const store = getStoreConfig(req.shopifyStoreId);
    waitUntil(recordLock
      .withLock(`product:${store.storeId}:${req.body?.id}`, () => handleProductWebhook(req.body, store))
      .catch((error) => {
        const context = { store: store.storeId, shopifyProductId: req.body?.id, err: error instanceof Error ? error.message : String(error) };
        logger.error(context, "Product webhook processing FAILED");
        return sendFailureAlert({ subject: "Product webhook failed", context });
      }));
  });

  router.post("/customers", (req, res) => {
    res.status(200).json({ status: "accepted" });
    const store = getStoreConfig(req.shopifyStoreId);
    waitUntil(recordLock
      .withLock(`customer:${store.storeId}:${req.body?.id}`, () => handleCustomerWebhook(req.body, store))
      .catch((error) => {
        const context = { store: store.storeId, shopifyCustomerId: req.body?.id, err: error instanceof Error ? error.message : String(error) };
        logger.error(context, "Customer webhook processing FAILED");
        return sendFailureAlert({ subject: "Customer webhook failed", context });
      }));
  });

  router.post("/companies", (req, res) => {
    res.status(200).json({ status: "accepted" });
    const store = getStoreConfig(req.shopifyStoreId);
    const shopifyCompanyId = extractShopifyNumericId(req.body?.admin_graphql_api_id);
    waitUntil(recordLock
      .withLock(`company:${store.storeId}:${shopifyCompanyId}`, () => handleCompanyWebhook(req.body, store))
      .catch((error) => {
        const context = {
          store: store.storeId,
          shopifyCompanyId,
          err: error instanceof Error ? error.message : String(error),
          graphQLErrors: error?.graphQLErrors,
        };
        logger.error(context, "Company webhook processing FAILED");
        return sendFailureAlert({ subject: "Company webhook failed", context });
      }));
  });

  router.post("/company_locations", (req, res) => {
    res.status(200).json({ status: "accepted" });
    const store = getStoreConfig(req.shopifyStoreId);
    const shopifyCompanyId = extractShopifyNumericId(req.body?.company?.admin_graphql_api_id);
    waitUntil(recordLock
      .withLock(`company:${store.storeId}:${shopifyCompanyId}`, () => handleCompanyLocationWebhook(req.body, store))
      .catch((error) => {
        const context = {
          store: store.storeId,
          shopifyCompanyId,
          err: error instanceof Error ? error.message : String(error),
          graphQLErrors: error?.graphQLErrors,
        };
        logger.error(context, "Company Location webhook processing FAILED");
        return sendFailureAlert({ subject: "Company Location webhook failed", context });
      }));
  });

  router.post("/company_contacts", (req, res) => {
    res.status(200).json({ status: "accepted" });
    const store = getStoreConfig(req.shopifyStoreId);
    const shopifyCompanyId = extractShopifyNumericId(
      req.body?.company?.admin_graphql_api_id ?? req.body?.company_location?.company?.admin_graphql_api_id,
    );
    waitUntil(recordLock
      .withLock(`company:${store.storeId}:${shopifyCompanyId}`, () => handleCompanyContactWebhook(req.body, store))
      .catch((error) => {
        const context = {
          store: store.storeId,
          shopifyCompanyId,
          payloadKeys: Object.keys(req.body ?? {}),
          err: error instanceof Error ? error.message : String(error),
          graphQLErrors: error?.graphQLErrors,
        };
        logger.error(context, "Company Contact webhook processing FAILED");
        return sendFailureAlert({ subject: "Company Contact webhook failed", context });
      }));
  });

  router.post("/orders", (req, res) => {
    res.status(200).json({ status: "accepted" });
    const store = getStoreConfig(req.shopifyStoreId);
    waitUntil(recordLock
      .withLock(`order:${store.storeId}:${req.body?.id}`, () => handleOrderWebhook(req.body, store))
      .catch((error) => {
        const context = { store: store.storeId, shopifyOrderId: req.body?.id, err: error instanceof Error ? error.message : String(error) };
        logger.error(context, "Order webhook processing FAILED");
        return sendFailureAlert({ subject: "Order webhook failed", context });
      }));
  });

  return router;
}
