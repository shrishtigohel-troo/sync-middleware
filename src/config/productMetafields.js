import { extractPlainTextFromShopifyRichText } from "../utils/shopifyRichText.js";

/**
 * NOTE: actual sync no longer uses this list to decide WHAT to sync - see
 * src/utils/metafieldMapping.js, which handles any metafield dynamically
 * based on its own `type`, including ones not listed here (e.g. app-
 * injected metafields like Loox reviews, discovered live via testing).
 *
 * This registry now serves one purpose: giving
 * scripts/setup-product-metafield-properties.js a known, reviewed list of
 * properties to pre-create in HubSpot ahead of time, for the metafields
 * that were visible in Shopify's own metafield-definitions list (Settings >
 * Custom Data) at the time this was built - 52 total, fetched directly via
 * GraphQL (`metafieldDefinitions(ownerType: PRODUCT)`), not guessed.
 * Metafields discovered dynamically that aren't in this list simply get
 * skipped (not written) until a HubSpot property for them is created too -
 * same "only write what's confirmed to exist" rule as everywhere else.
 *
 * Each entry's `handling` documents how that metafield's value would be
 * converted (see src/utils/metafieldMapping.js for the real, dynamic logic
 * that also covers reference/file types this file marks "unsupported" -
 * this list predates that fuller resolution being built, kept mainly for
 * the property pre-creation script).
 */
export const PRODUCT_METAFIELD_DEFINITIONS = [
  { namespace: "custom", key: "category", name: "Category", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_category_metafield" },
  { namespace: "custom", key: "technical_family", name: "Technical Family", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_technical_family" },
  { namespace: "custom", key: "collection", name: "Collection", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_collection" },
  { namespace: "custom", key: "retail_eligible", name: "Retail Eligible", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_retail_eligible" },
  { namespace: "custom", key: "subtitle", name: "Subtitle", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_subtitle" },
  { namespace: "custom", key: "overview_title", name: "Overview Title", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_overview_title" },
  { namespace: "custom", key: "faq_q1", name: "FAQ Q1", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_faq_q1" },
  { namespace: "custom", key: "faq_q2", name: "FAQ Q2", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_faq_q2" },
  { namespace: "custom", key: "faq_q3", name: "FAQ Q3", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_faq_q3" },
  { namespace: "custom", key: "faq_q4", name: "FAQ Q4", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_faq_q4" },
  { namespace: "custom", key: "faq_q5", name: "FAQ Q5", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_faq_q5" },
  { namespace: "custom", key: "primary_video", name: "Primary Video", type: "url", handling: "text", hubspotProperty: "shopify_mf_primary_video" },
  { namespace: "_easifyBoxBuilder", key: "url", name: "Easify Box Builder URL", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_easify_box_builder_url" },
  { namespace: "restockrocket_production", key: "tracked", name: "Tracked", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_tracked" },
  { namespace: "bundly", key: "extra_data", name: "Bundly Extra Data", type: "multi_line_text_field", handling: "text", hubspotProperty: "shopify_mf_bundly_extra_data" },
  { namespace: "reviews", key: "rating", name: "Product Rating", type: "rating", handling: "text", hubspotProperty: "shopify_mf_product_rating" },
  { namespace: "reviews", key: "rating_count", name: "Product Rating Count", type: "number_integer", handling: "text", hubspotProperty: "shopify_mf_product_rating_count" },
  { namespace: "mm-google-shopping", key: "custom_product", name: "Google Custom Product", type: "boolean", handling: "text", hubspotProperty: "shopify_mf_google_custom_product" },
  { namespace: "shopify--discovery--product_search_boost", key: "queries", name: "Search Product Boosts", type: "list.single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_search_product_boosts" },
  { namespace: "shopify--discovery--product_recommendation", key: "related_products_display", name: "Related Products Settings", type: "single_line_text_field", handling: "text", hubspotProperty: "shopify_mf_related_products_settings" },

  { namespace: "custom", key: "overview", name: "Overview", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_overview" },
  { namespace: "custom", key: "how_to_use", name: "How to Use", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_how_to_use" },
  { namespace: "custom", key: "ingredients_list", name: "Ingredients List", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_ingredients_list" },
  { namespace: "custom", key: "technology", name: "Technology", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_technology" },
  { namespace: "custom", key: "benefits", name: "Benefits", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_benefits" },
  { namespace: "custom", key: "faq_a1", name: "FAQ A1", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_faq_a1" },
  { namespace: "custom", key: "faq_a2", name: "FAQ A2", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_faq_a2" },
  { namespace: "custom", key: "faq_a3", name: "FAQ A3", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_faq_a3" },
  { namespace: "custom", key: "faq_a4", name: "FAQ A4", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_faq_a4" },
  { namespace: "custom", key: "faq_a5", name: "FAQ A5", type: "rich_text_field", handling: "richText", hubspotProperty: "shopify_mf_faq_a5" },

  // Not synced - genuinely can't become a simple HubSpot property (see file header).
  { namespace: "shopify", key: "ingredients", name: "Ingredients", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "color-pattern", name: "Color", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "target-gender", name: "Target Gender", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "age-group", name: "Age Group", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "constitutive-ingredients", name: "Constitutive Ingredients", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "suitable-for-hair-type", name: "Suitable for Hair Type", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "hair-color-shade", name: "Hair Color", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "material", name: "Material", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "product-form", name: "Product Form", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "conditioner-effect", name: "Conditioner Effect", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "chemical-safety-features", name: "Chemical Safety Features", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "shopify", key: "application-type", name: "Application Type", type: "list.metaobject_reference", handling: "unsupported" },
  { namespace: "custom", key: "image_testimonial_slider_1", name: "Image Testimonial Slider 1", type: "file_reference", handling: "unsupported" },
  { namespace: "custom", key: "actionimg1", name: "Action Image 1", type: "file_reference", handling: "unsupported" },
  { namespace: "custom", key: "actionimg2", name: "Action Image 2", type: "file_reference", handling: "unsupported" },
  { namespace: "custom", key: "actionimg3", name: "Action Image 3", type: "file_reference", handling: "unsupported" },
  { namespace: "custom", key: "primary_image", name: "Primary Image", type: "file_reference", handling: "unsupported" },
  { namespace: "custom", key: "json", name: "JSON", type: "json", handling: "unsupported" },
  { namespace: "best_bundles", key: "bundle_child_variants", name: "Bundle Child Variants", type: "json", handling: "unsupported" },
  { namespace: "restockrocket_production", key: "preorder_batch_info", name: "Preorder Batch Info", type: "json", handling: "unsupported" },
  { namespace: "shopify--discovery--product_recommendation", key: "related_products", name: "Related Products", type: "list.product_reference", handling: "unsupported" },
  { namespace: "shopify--discovery--product_recommendation", key: "complementary_products", name: "Complementary Products", type: "list.product_reference", handling: "unsupported" },
];

export function getSyncableProductMetafieldDefinitions() {
  return PRODUCT_METAFIELD_DEFINITIONS.filter((d) => d.handling !== "unsupported");
}

/**
 * Converts one metafield's raw Shopify value into a plain string suitable
 * for a HubSpot text property, based on its `handling` and `type`.
 *
 * - richText: extracted via src/utils/shopifyRichText.js (Shopify stores
 *   this as a JSON block-tree, not plain text).
 * - list.* types: Shopify stores these as a JSON array string
 *   (e.g. '["a","b"]") - parsed and joined with ", ".
 * - everything else ("text" handling, non-list type): used as-is.
 */
export function convertMetafieldValue(definition, rawValue) {
  if (definition.handling === "richText") {
    return extractPlainTextFromShopifyRichText(rawValue);
  }
  if (definition.type.startsWith("list.")) {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.join(", ") : rawValue;
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}
