import { describe, it, expect } from "vitest";
import { mapShopifyVariantToHubSpot } from "../../src/mappings/product.js";
import { buildProduct, buildVariant, buildMetafield, connectionOf } from "../helpers/shopifyFixtures.js";

describe("mapShopifyVariantToHubSpot", () => {
  it("only includes properties that exist on the HubSpot portal", () => {
    const product = buildProduct();
    const variant = product.variants.edges[0].node;
    const existing = new Set(["name", "description", "price"]);

    const result = mapShopifyVariantToHubSpot(product, variant, existing);

    expect(result.properties).toEqual({
      name: "Test Product",
      description: "Hello world",
      price: "19.99",
    });
    expect(result.skippedMissingProperties).toEqual(
      expect.arrayContaining(["hs_sku", "hs_url", "hs_images", "shopify_product_id", "shopify_variant_id"]),
    );
  });

  it("writes shopify_product_id and shopify_variant_id when those properties exist", () => {
    const product = buildProduct();
    const variant = product.variants.edges[0].node;
    const existing = new Set(["name", "shopify_product_id", "shopify_variant_id"]);

    const result = mapShopifyVariantToHubSpot(product, variant, existing);

    expect(result.properties.shopify_product_id).toBe(product.id);
    expect(result.properties.shopify_variant_id).toBe(variant.id);
  });

  it("qualifies the name with the variant title when a product has multiple variants", () => {
    const variantA = buildVariant({ id: "v1", title: "Small" });
    const variantB = buildVariant({ id: "v2", title: "Large" });
    const product = buildProduct({ variants: connectionOf([variantA, variantB]) });
    const existing = new Set(["name"]);

    const resultA = mapShopifyVariantToHubSpot(product, variantA, existing);
    const resultB = mapShopifyVariantToHubSpot(product, variantB, existing);

    expect(resultA.properties.name).toBe("Test Product - Small");
    expect(resultB.properties.name).toBe("Test Product - Large");
  });

  it("does not qualify the name when there is only one variant", () => {
    const product = buildProduct();
    const variant = product.variants.edges[0].node;
    const existing = new Set(["name"]);

    const result = mapShopifyVariantToHubSpot(product, variant, existing);

    expect(result.properties.name).toBe("Test Product");
  });

  it("strips HTML from the description", () => {
    const product = buildProduct({ descriptionHtml: "<p>Line one</p><p>Line two</p>" });
    const variant = product.variants.edges[0].node;
    const existing = new Set(["description"]);

    const result = mapShopifyVariantToHubSpot(product, variant, existing);

    expect(result.properties.description).toBe("Line oneLine two");
  });

  it("maps any metafield dynamically to a namespaced property name, not a fixed list", () => {
    const product = buildProduct({
      metafields: connectionOf([buildMetafield({ namespace: "judgeme", key: "badge", value: "5 stars" })]),
    });
    const variant = product.variants.edges[0].node;
    const existing = new Set(["name", "shopify_mf_judgeme_badge"]);

    const result = mapShopifyVariantToHubSpot(product, variant, existing);

    expect(result.properties.shopify_mf_judgeme_badge).toBe("5 stars");
  });

  it("skips a metafield's property when that exact HubSpot property doesn't exist yet", () => {
    const product = buildProduct({
      metafields: connectionOf([buildMetafield({ namespace: "judgeme", key: "badge", value: "5 stars" })]),
    });
    const variant = product.variants.edges[0].node;

    const result = mapShopifyVariantToHubSpot(product, variant, new Set(["name"]));

    expect(result.properties.shopify_mf_judgeme_badge).toBeUndefined();
    expect(result.skippedMissingProperties).toContain("shopify_mf_judgeme_badge");
  });

  it("joins native tags into a comma-separated string", () => {
    const product = buildProduct({ tags: ["Bestseller", "New"] });
    const variant = product.variants.edges[0].node;
    const result = mapShopifyVariantToHubSpot(product, variant, new Set(["shopify_tags"]));

    expect(result.properties.shopify_tags).toBe("Bestseller, New");
  });

  it("omits shopify_tags when the product has no tags", () => {
    const product = buildProduct({ tags: [] });
    const variant = product.variants.edges[0].node;
    const result = mapShopifyVariantToHubSpot(product, variant, new Set(["shopify_tags"]));

    expect(result.properties.shopify_tags).toBeUndefined();
  });

  it("joins native Collections (distinct from the collection metafield) into a comma-separated string", () => {
    const product = buildProduct({ collections: connectionOf([{ title: "Top Sellers" }, { title: "Promos" }]) });
    const variant = product.variants.edges[0].node;
    const result = mapShopifyVariantToHubSpot(product, variant, new Set(["shopify_collections"]));

    expect(result.properties.shopify_collections).toBe("Top Sellers, Promos");
  });

  it("reports observed metafields regardless of whether they are mapped", () => {
    const product = buildProduct({
      metafields: connectionOf([buildMetafield({ namespace: "judgeme", key: "badge", value: "<div/>" })]),
    });
    const variant = product.variants.edges[0].node;

    const result = mapShopifyVariantToHubSpot(product, variant, new Set(["name"]));

    expect(result.observedMetafields).toEqual([{ namespace: "judgeme", key: "badge", value: "<div/>" }]);
  });
});
