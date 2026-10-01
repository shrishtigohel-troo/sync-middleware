import { describe, it, expect } from "vitest";
import { mapWebhookProductVariantToHubSpot } from "../../src/mappings/webhookProduct.js";

function buildPayload(overrides = {}) {
  return {
    id: 111,
    title: "Hat",
    body_html: "<p>Nice hat</p>",
    image: { src: "https://cdn.shopify.com/hat.jpg" },
    variants: [{ id: 222, sku: "HAT-1", price: "19.99", title: "Default Title" }],
    ...overrides,
  };
}

describe("mapWebhookProductVariantToHubSpot", () => {
  it("maps a single-variant product without qualifying the name", () => {
    const payload = buildPayload();
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], new Set(["name", "price"]));

    expect(result.properties.name).toBe("Hat");
    expect(result.properties.price).toBe("19.99");
  });

  it("qualifies the name when there are multiple variants", () => {
    const payload = buildPayload({
      variants: [
        { id: 1, sku: "S", price: "10", title: "Small" },
        { id: 2, sku: "L", price: "12", title: "Large" },
      ],
    });
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[1], new Set(["name"]));

    expect(result.properties.name).toBe("Hat - Large");
  });

  it("strips HTML from body_html", () => {
    const payload = buildPayload({ body_html: "<div>Line <b>one</b></div>" });
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], new Set(["description"]));

    expect(result.properties.description).toBe("Line one");
  });

  it("only writes properties that exist on the portal", () => {
    const payload = buildPayload();
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], new Set(["name"]));

    expect(result.properties.shopify_product_id).toBeUndefined();
    expect(result.skippedMissingProperties).toContain("shopify_product_id");
  });

  it("writes IDs in the same gid:// form the GraphQL-based sync uses, not a plain number", () => {
    // Regression test: webhook payloads give plain numeric IDs, but GraphQL-based
    // syncs write gid://shopify/... - if these two forms don't match, duplicate
    // matching silently breaks and every webhook update creates a new record.
    const payload = buildPayload();
    const result = mapWebhookProductVariantToHubSpot(
      payload,
      payload.variants[0],
      new Set(["shopify_product_id", "shopify_variant_id"]),
    );

    expect(result.properties.shopify_product_id).toBe("gid://shopify/Product/111");
    expect(result.properties.shopify_variant_id).toBe("gid://shopify/ProductVariant/222");
  });

  it("maps vendor (native REST field, no extra lookup needed) to Brand", () => {
    const payload = buildPayload({ vendor: "Difiaba Professional" });
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], new Set(["shopify_brand"]));

    expect(result.properties.shopify_brand).toBe("Difiaba Professional");
  });

  it("maps the built-in Category (fetched separately) when provided", () => {
    const payload = buildPayload();
    const categoryAndMetafields = { category: { fullName: "Hair Coloring Accessories in Hair Care" }, metafields: [] };
    const result = mapWebhookProductVariantToHubSpot(
      payload,
      payload.variants[0],
      new Set(["shopify_product_category"]),
      categoryAndMetafields,
    );

    expect(result.properties.shopify_product_category).toBe("Hair Coloring Accessories in Hair Care");
  });

  it("maps native tags (present directly on the REST payload) as-is", () => {
    const payload = buildPayload({ tags: "Bestseller, New" });
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], new Set(["shopify_tags"]));

    expect(result.properties.shopify_tags).toBe("Bestseller, New");
  });

  it("maps native Collections (fetched separately) when provided", () => {
    const payload = buildPayload();
    const categoryAndMetafields = { category: null, collections: ["Top Sellers", "Promos"], metafields: [] };
    const result = mapWebhookProductVariantToHubSpot(
      payload,
      payload.variants[0],
      new Set(["shopify_collections"]),
      categoryAndMetafields,
    );

    expect(result.properties.shopify_collections).toBe("Top Sellers, Promos");
  });

  it("skips built-in Category and metafields entirely when the extra lookup wasn't provided", () => {
    const payload = buildPayload();
    const result = mapWebhookProductVariantToHubSpot(
      payload,
      payload.variants[0],
      new Set(["shopify_product_category", "family"]),
    );

    expect(result.properties.shopify_product_category).toBeUndefined();
    expect(result.properties.family).toBeUndefined();
  });
});

describe("mapWebhookProductVariantToHubSpot - pre-existing HubSpot dropdowns", () => {
  const existing = new Set(["name", "kind", "collection", "shopify_mf_retail_eligible", "shopify_mf_subtitle"]);

  it("writes Retail Eligible into the existing kind field when Shopify has a value", () => {
    const payload = buildPayload();
    const metafields = [{ namespace: "custom", key: "retail_eligible", type: "single_line_text_field", value: "Yes" }];
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], existing, { category: null, metafields });

    expect(result.properties.kind).toBe("Yes");
    expect(result.properties).not.toHaveProperty("shopify_mf_retail_eligible");
  });

  it("does not clear kind, collection or the old duplicate when the metafields are empty in Shopify", () => {
    const payload = buildPayload();
    const result = mapWebhookProductVariantToHubSpot(payload, payload.variants[0], existing, { category: null, metafields: [] });

    expect(result.properties).not.toHaveProperty("kind");
    expect(result.properties).not.toHaveProperty("collection");
    expect(result.properties).not.toHaveProperty("shopify_mf_retail_eligible");
    expect(result.properties.shopify_mf_subtitle).toBe("");
  });
});
