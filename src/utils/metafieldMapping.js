import { extractPlainTextFromShopifyRichText } from "./shopifyRichText.js";
import { PRODUCT_METAFIELD_DEFINITIONS } from "../config/productMetafields.js";
import { getHubSpotClient } from "../hubspot/client.js";
import { listObjectProperties } from "../hubspot/properties.js";
import { logger } from "./logger.js";

/**
 * The 30 metafields in src/config/productMetafields.js were already
 * created as real HubSpot properties (via
 * scripts/setup-product-metafield-properties.js) using key-only names like
 * `shopify_mf_retail_eligible` - NOT the `shopify_mf_<namespace>_<key>`
 * pattern this file's dynamic naming uses for anything else. Without this
 * override, the dynamic path would generate a different name
 * (`shopify_mf_custom_retail_eligible`) than what's actually live in
 * HubSpot, and every one of those 30 properties would silently stop being
 * written to - confirmed live via a dry run before this override existed.
 *
 * Anything NOT in this list (e.g. app-injected metafields like Loox
 * reviews, discovered after the fact) falls through to genuine dynamic
 * naming below.
 */
const LEGACY_PROPERTY_OVERRIDES = Object.fromEntries(
  PRODUCT_METAFIELD_DEFINITIONS.filter((d) => d.handling !== "unsupported").map((d) => [
    `${d.namespace}.${d.key}`,
    d.hubspotProperty,
  ]),
);

/**
 * Derives the HubSpot property internal name for any Shopify metafield,
 * dynamically - not from a fixed list. This is what allows the middleware
 * to handle metafields it has never seen before (e.g. ones injected by a
 * newly installed Shopify app), without a code change.
 */
export function getMetafieldHubSpotPropertyName(namespace, key) {
  const overrideKey = `${namespace}.${key}`;
  if (LEGACY_PROPERTY_OVERRIDES[overrideKey]) {
    return LEGACY_PROPERTY_OVERRIDES[overrideKey];
  }
  const sanitized = `${namespace}_${key}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  // HubSpot property internal names have a length limit - truncated
  // defensively rather than risking an API rejection on a long app namespace.
  return `shopify_mf_${sanitized}`.slice(0, 100);
}

const LEGACY_PROPERTY_OVERRIDE_VALUES = new Set(Object.values(LEGACY_PROPERTY_OVERRIDES));

/**
 * True for any HubSpot property name this file could have generated for a
 * metafield - either the dynamic shopify_mf_* pattern or one of the legacy
 * override names. Used to find and clear stale metafield properties when a
 * metafield is removed/emptied in Shopify - without this, a cleared
 * metafield would leave its old value stuck in HubSpot forever, since the
 * sync only ever writes a value when one exists, never clears one.
 */
export function isMetafieldDerivedProperty(propertyName) {
  if (EXISTING_DROPDOWN_PROPERTIES.has(propertyName) || RETIRED_DUPLICATE_PROPERTIES.has(propertyName)) return false;
  return propertyName.startsWith("shopify_mf_") || LEGACY_PROPERTY_OVERRIDE_VALUES.has(propertyName);
}

/**
 * Pre-existing HubSpot dropdown properties some metafields write into
 * (`existingHubSpotDropdown` in src/config/productMetafields.js). They hold
 * data entered in HubSpot before this middleware existed (e.g. Retail
 * Eligible on 146 products, while Shopify has it on only a handful), so
 * they are excluded from isMetafieldDerivedProperty above: an empty
 * Shopify metafield leaves the HubSpot value as it is instead of clearing it.
 */
export const EXISTING_DROPDOWN_PROPERTIES = new Set(
  PRODUCT_METAFIELD_DEFINITIONS.filter((d) => d.existingHubSpotDropdown).map((d) => d.hubspotProperty),
);

// The middleware's own copies of those four, no longer written. Left as
// they are (never cleared) until someone decides to delete them in HubSpot.
const RETIRED_DUPLICATE_PROPERTIES = new Set([
  "shopify_category_metafield",
  "shopify_collection",
  "shopify_technical_family",
  "shopify_metafield_technical_family",
  "shopify_mf_retail_eligible",
]);

const normalizeOption = (value) => String(value).trim().toLowerCase();

/**
 * Reads the current options of the pre-existing dropdown properties:
 * Map<propertyName, Map<normalized option, exact option value>>. Call once
 * per sync run/webhook, not per variant.
 */
export async function loadExistingDropdownOptions() {
  const options = new Map();
  for (const property of await listObjectProperties("products")) {
    if (!EXISTING_DROPDOWN_PROPERTIES.has(property.name)) continue;
    options.set(property.name, new Map((property.options ?? []).map((o) => [normalizeOption(o.value), o.value])));
  }
  return options;
}

/**
 * Rewrites values for the pre-existing dropdown properties to the exact
 * option HubSpot expects (Shopify "COLOR KEEP" -> option "Color Keep").
 * A value matching no option is removed from the write and returned in
 * `unmatched`, rather than adding an option (the property definitions are
 * never changed) or letting HubSpot reject the whole product update.
 * Returns { properties, unmatched: [{ propertyName, value }] }.
 */
export function fitExistingDropdownValues(properties, dropdownOptions) {
  const fitted = { ...properties };
  const unmatched = [];
  for (const propertyName of EXISTING_DROPDOWN_PROPERTIES) {
    if (!(propertyName in fitted)) continue;
    const exact = dropdownOptions.get(propertyName)?.get(normalizeOption(fitted[propertyName]));
    if (exact === undefined) {
      unmatched.push({ propertyName, value: fitted[propertyName] });
      delete fitted[propertyName];
    } else {
      fitted[propertyName] = exact;
    }
  }
  return { properties: fitted, unmatched };
}

/**
 * Resolves one referenced node (from a metafield's `reference` or
 * `references` field) into a plain display string. Returns null if the
 * reference type isn't one we know how to render as text.
 */
function resolveReferenceNode(node) {
  if (!node) return null;
  switch (node.__typename) {
    case "Metaobject": {
      // Shopify's own standard taxonomy-backed metaobjects (Color, Material,
      // Hair type, etc.) always carry a human-readable "label" field
      // alongside an internal "taxonomy_reference" GID - confirmed live.
      // Prefer that label; only fall back to joining every field for
      // fully custom metaobjects that don't follow this convention.
      const labelField = node.fields.find((f) => f.key === "label");
      if (labelField?.value) return labelField.value;
      return node.fields
        .map((f) => f.value)
        .filter(Boolean)
        .join(" / ");
    }
    case "Product":
      return node.title;
    case "MediaImage":
      return node.image?.url ?? null;
    case "GenericFile":
      return node.url ?? null;
    default:
      return null;
  }
}

/**
 * Converts one Shopify metafield node - { namespace, key, value, type,
 * reference, references } - into a plain string suitable for a HubSpot
 * text property, based entirely on its own `type`, not a fixed registry.
 * This is what makes metafield handling dynamic/per-product rather than
 * limited to a pre-known list.
 *
 * Returns null when there is genuinely nothing to write (e.g. a reference
 * field with no value set yet) - never throws.
 */
export function convertMetafieldValue(node) {
  const { type, value, reference, references } = node;

  if (!value && !reference && (!references || references.edges.length === 0)) {
    return null;
  }

  if (type === "rich_text_field") {
    return extractPlainTextFromShopifyRichText(value) || null;
  }

  if (type === "rating") {
    try {
      const parsed = JSON.parse(value);
      return parsed?.value != null ? String(parsed.value) : value;
    } catch {
      return value;
    }
  }

  if (type.startsWith("list.")) {
    const baseType = type.slice("list.".length);
    if (["metaobject_reference", "product_reference", "file_reference"].includes(baseType)) {
      if (!references) return null;
      const parts = references.edges.map((e) => resolveReferenceNode(e.node)).filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.join(", ") : value;
    } catch {
      return value;
    }
  }

  if (["metaobject_reference", "product_reference", "file_reference"].includes(type)) {
    return reference ? resolveReferenceNode(reference) : null;
  }

  // Simple scalar types (single_line_text_field, multi_line_text_field,
  // string, url, boolean, number_integer, number_decimal, json, date,
  // date_time, color, weight, volume, dimension, money, ...) - used as-is.
  return value;
}

const LONG_VALUE_METAFIELD_TYPES = new Set(["rich_text_field", "multi_line_text_field", "json"]);

/**
 * Creates the HubSpot Product property for any metafield that doesn't have
 * one yet, so every metafield a product actually has genuinely syncs - not
 * just the ones someone remembered to pre-create. Called from the live
 * webhook path (src/middleware/webhookRouter.js) before mapping, for any
 * observed metafield whose derived property name isn't in
 * existingHubSpotProperties yet.
 *
 * Mutates existingHubSpotProperties in place (adds the newly created name)
 * so the same mapping pass that triggered this can immediately write the
 * value too, instead of needing a second webhook delivery.
 */
export async function ensureMetafieldPropertyExists(namespace, key, type, existingHubSpotProperties) {
  const propertyName = getMetafieldHubSpotPropertyName(namespace, key);
  if (existingHubSpotProperties.has(propertyName)) return;

  const client = getHubSpotClient();
  const fieldType = LONG_VALUE_METAFIELD_TYPES.has(type) || type.startsWith("list.") ? "textarea" : "text";

  try {
    await client.request("POST", "/crm/v3/properties/products", {
      name: propertyName,
      label: `${namespace}.${key}`,
      type: "string",
      fieldType,
      groupName: "productinformation",
    });
    existingHubSpotProperties.add(propertyName);
    logger.info({ namespace, key, propertyName }, "Auto-created missing HubSpot property for a product metafield");
  } catch (error) {
    // A 409 (property already exists) can happen if two webhooks for
    // different variants of the same product both observe this metafield
    // for the first time concurrently - safe to treat as already created.
    if (error?.status === 409) {
      existingHubSpotProperties.add(propertyName);
      return;
    }
    logger.error(
      { namespace, key, propertyName, err: error instanceof Error ? error.message : String(error) },
      "Failed to auto-create HubSpot property for a product metafield - this metafield will be skipped this time",
    );
  }
}
