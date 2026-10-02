/**
 * Registry of HubSpot custom properties this middleware expects to exist.
 *
 * This file does NOT create properties automatically. Properties must be
 * created in HubSpot (or via a reviewed one-time setup script) before the
 * middleware writes to them. Internal names below are PROPOSED and must be
 * confirmed against the actual HubSpot property internal names before use -
 * see docs/field-mapping.md.
 *
 * Each entry:
 *   objectType     - "contacts" | "companies" | "products" | "orders" | "deals" | "line_items"
 *   internalName   - the HubSpot property's internal name
 *   label          - human-readable label
 *   middlewareOwned - whether this property is owned/writable by the middleware (commerce data)
 *   confirmed      - whether the property has been confirmed to exist in the portal
 */
import { getSyncableProductMetafieldDefinitions } from "./productMetafields.js";

// Product metafield properties are generated from the single source of
// truth in src/config/productMetafields.js, rather than duplicated by hand
// here - 3 of them (Category metafield, Technical Family, Collection)
// already have dedicated entries below with extra context comments, so
// they're excluded here to avoid listing the same property twice.
const ALREADY_LISTED_METAFIELD_PROPERTIES = new Set([
  "shopify_category_metafield",
  "shopify_technical_family",
  "shopify_collection",
]);
const GENERATED_PRODUCT_METAFIELD_PROPERTIES = getSyncableProductMetafieldDefinitions()
  .filter((d) => !ALREADY_LISTED_METAFIELD_PROPERTIES.has(d.hubspotProperty))
  .map((d) => ({
    objectType: "products",
    internalName: d.hubspotProperty,
    label: d.name,
    middlewareOwned: true,
    confirmed: false,
  }));

export const HUBSPOT_PROPERTY_REGISTRY = [
  // --- Contacts ---
  { objectType: "contacts", internalName: "shopify_customer_id", label: "Shopify Customer ID", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_store", label: "Shopify Store", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "preferred_language", label: "Preferred Language", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_is_main_contact", label: "Is Main Company Contact", middlewareOwned: true, confirmed: false },
  // Rollup/CLV properties (see docs/field-mapping.md and src/services/rollups.js).
  // One revenue property per supported currency - never summed across currencies.
  { objectType: "contacts", internalName: "shopify_total_orders", label: "Total Orders", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_last_order_date", label: "Last Order Date", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_revenue_usd", label: "Revenue (USD)", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_revenue_eur", label: "Revenue (EUR)", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_revenue_mxn", label: "Revenue (MXN)", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_revenue_gtq", label: "Revenue (GTQ)", middlewareOwned: true, confirmed: false },
  { objectType: "contacts", internalName: "shopify_revenue_crc", label: "Revenue (CRC)", middlewareOwned: true, confirmed: false },

  // --- Companies ---
  { objectType: "companies", internalName: "shopify_company_id", label: "Shopify Company ID", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_store", label: "Shopify Store", middlewareOwned: true, confirmed: false },
  // Works the same regardless of 1 vs many locations - all location names joined into one field.
  { objectType: "companies", internalName: "shopify_locations", label: "Shopify Locations", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_location_count", label: "Shopify Location Count", middlewareOwned: true, confirmed: false },
  // Uniquely identifies one Shopify Company Location - each location gets
  // its own HubSpot Company record (see src/mappings/companyLocation.js),
  // so this is the per-record matching key, distinct from
  // shopify_company_id (shared across all of one company's location records).
  { objectType: "companies", internalName: "shopify_location_id", label: "Shopify Location ID", middlewareOwned: true, confirmed: false },
  // Company-wide purchase history rollups (client requirement, section 12) -
  // same calculation and property names as the Contact rollups above, see
  // src/services/rollups.js.
  { objectType: "companies", internalName: "shopify_total_orders", label: "Total Orders", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_last_order_date", label: "Last Order Date", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_revenue_usd", label: "Revenue (USD)", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_revenue_eur", label: "Revenue (EUR)", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_revenue_mxn", label: "Revenue (MXN)", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_revenue_gtq", label: "Revenue (GTQ)", middlewareOwned: true, confirmed: false },
  { objectType: "companies", internalName: "shopify_revenue_crc", label: "Revenue (CRC)", middlewareOwned: true, confirmed: false },

  // --- Products ---
  { objectType: "products", internalName: "shopify_product_id", label: "Shopify Product ID", middlewareOwned: true, confirmed: false },
  { objectType: "products", internalName: "shopify_variant_id", label: "Shopify Variant ID", middlewareOwned: true, confirmed: false },
  { objectType: "products", internalName: "hs_sku", label: "SKU", middlewareOwned: true, confirmed: false },
  // Shopify's built-in/standardized Category taxonomy (product.category.fullName) - not a metafield.
  { objectType: "products", internalName: "shopify_product_category", label: "Product Category", middlewareOwned: true, confirmed: false },
  // Native Vendor field, confirmed live to be the brand name.
  { objectType: "products", internalName: "shopify_brand", label: "Brand", middlewareOwned: true, confirmed: false },
  // Shopify's product "Type" - labelled "Type" to match Shopify. Distinct from HubSpot's built-in "Product type".
  { objectType: "products", internalName: "shopify_product_type", label: "Type", middlewareOwned: true, confirmed: false },
  // A separate custom metafield also named "Category" (distinct from the built-in one above) - see src/config/productMetafields.js.
  { objectType: "products", internalName: "shopify_category_metafield", label: "Category (metafield)", middlewareOwned: true, confirmed: false },
  { objectType: "products", internalName: "shopify_technical_family", label: "Technical Family", middlewareOwned: true, confirmed: false },
  { objectType: "products", internalName: "shopify_collection", label: "Collection", middlewareOwned: true, confirmed: false },
  // Shopify's native Collections (product grouping for storefront browsing) -
  // distinct from the "collection" metafield above. A product can belong to
  // several, so this is a comma-joined list of collection titles.
  { objectType: "products", internalName: "shopify_collections", label: "Collections", middlewareOwned: true, confirmed: false },
  // Shopify's native product Tags, comma-joined.
  { objectType: "products", internalName: "shopify_tags", label: "Tags", middlewareOwned: true, confirmed: false },

  // --- Orders ---
  { objectType: "orders", internalName: "shopify_store_id", label: "Shopify Store ID", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_order_id", label: "Shopify Order ID", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_original_currency", label: "Original Currency", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_channel", label: "B2B/B2C Channel", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_market", label: "Market", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_financial_status", label: "Financial Status", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_fulfillment_status", label: "Fulfillment Status", middlewareOwned: true, confirmed: false },
  { objectType: "orders", internalName: "shopify_cancelled", label: "Cancelled", middlewareOwned: true, confirmed: false },

  // --- Deals ---
  // Used INSTEAD OF the Orders object for the real client rollout - their
  // HubSpot portal does not expose the Orders object (confirmed live via the
  // Objects settings search). See src/mappings/deal.js and section 12 of the
  // SOW. dealname/amount/deal_currency_code are candidate native Deal
  // properties, only written if confirmed to exist.
  { objectType: "deals", internalName: "shopify_store_id", label: "Shopify Store ID", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_order_id", label: "Shopify Order ID", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_original_currency", label: "Original Currency", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_channel", label: "B2B/B2C Channel", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_market", label: "Market", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_financial_status", label: "Financial Status", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_fulfillment_status", label: "Fulfillment Status", middlewareOwned: true, confirmed: false },
  { objectType: "deals", internalName: "shopify_cancelled", label: "Cancelled", middlewareOwned: true, confirmed: false },

  // --- Line Items ---
  // Custom property, NOT HubSpot's native hs_external_id - that field looked
  // right but silently discards writes made via the API (confirmed via
  // testing) - see docs/object-matching-rules.md.
  { objectType: "line_items", internalName: "shopify_line_item_id", label: "Shopify Line Item ID", middlewareOwned: true, confirmed: false },

  // --- Products (generated from src/config/productMetafields.js) ---
  ...GENERATED_PRODUCT_METAFIELD_PROPERTIES,
];

/**
 * Fields the middleware must NEVER write, per the HubSpot source-of-truth
 * rule (see docs/object-matching-rules.md). Listed explicitly so the rule is
 * enforceable in code, not just convention.
 */
export const HUBSPOT_OWNED_FIELDS = {
  contacts: ["hubspot_owner_id", "lifecyclestage", "hs_lead_status"],
  companies: ["hubspot_owner_id", "lifecyclestage"],
  // dealstage/pipeline are deliberately never set by this middleware - see
  // src/mappings/deal.js for why (unconfirmed default pipeline/stage).
  deals: ["hubspot_owner_id", "dealstage", "pipeline"],
};

export function assertNotHubSpotOwnedField(objectType, propertyName) {
  const owned = HUBSPOT_OWNED_FIELDS[objectType];
  if (owned?.includes(propertyName)) {
    throw new Error(
      `Refusing to write HubSpot-owned field "${propertyName}" on ${objectType}. ` +
        "This field belongs to CRM/sales ownership, not commerce sync.",
    );
  }
}
