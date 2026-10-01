import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getMetafieldHubSpotPropertyName,
  convertMetafieldValue,
  ensureMetafieldPropertyExists,
} from "../../src/utils/metafieldMapping.js";

describe("getMetafieldHubSpotPropertyName", () => {
  it("derives a sanitized dynamic name from namespace + key", () => {
    expect(getMetafieldHubSpotPropertyName("loox", "avg_rating")).toBe("shopify_mf_loox_avg_rating");
  });

  it("sanitizes app namespaces with dashes/dots into valid property names", () => {
    // "mc-facebook.google_product_category" is a real app metafield found live
    // that isn't in the pre-built registry, so it goes through genuine dynamic naming.
    expect(getMetafieldHubSpotPropertyName("mc-facebook", "google_product_category")).toBe(
      "shopify_mf_mc_facebook_google_product_category",
    );
  });

  it("uses the legacy override name for the 3 pre-existing metafields", () => {
    expect(getMetafieldHubSpotPropertyName("custom", "category")).toBe("shopify_category_metafield");
    expect(getMetafieldHubSpotPropertyName("custom", "technical_family")).toBe("shopify_technical_family");
    expect(getMetafieldHubSpotPropertyName("custom", "collection")).toBe("shopify_collection");
  });
});

describe("convertMetafieldValue", () => {
  it("passes through a simple scalar value as-is", () => {
    expect(convertMetafieldValue({ type: "single_line_text_field", value: "Activator" })).toBe("Activator");
  });

  it("extracts a numeric value out of a rating-type JSON blob", () => {
    const value = JSON.stringify({ scale_min: "1.0", scale_max: "5.0", value: "5.0" });
    expect(convertMetafieldValue({ type: "rating", value })).toBe("5.0");
  });

  it("joins a list.single_line_text_field JSON array", () => {
    expect(convertMetafieldValue({ type: "list.single_line_text_field", value: JSON.stringify(["a", "b"]) })).toBe(
      "a, b",
    );
  });

  it("resolves a single metaobject reference to its field values", () => {
    const node = {
      type: "metaobject_reference",
      value: "gid://shopify/Metaobject/1",
      reference: { __typename: "Metaobject", fields: [{ key: "label", value: "Black" }] },
    };
    expect(convertMetafieldValue(node)).toBe("Black");
  });

  it("prefers the 'label' field over an internal taxonomy_reference GID field - confirmed live shape", () => {
    // Shopify's own standard taxonomy-backed metaobjects (Color, Material,
    // Application type, etc.) return both a human-readable label and an
    // internal taxonomy_reference GID - only the label should be used.
    const node = {
      type: "metaobject_reference",
      value: "gid://shopify/Metaobject/1",
      reference: {
        __typename: "Metaobject",
        fields: [
          { key: "label", value: "Rinse-out" },
          { key: "taxonomy_reference", value: "gid://shopify/TaxonomyValue/29656" },
        ],
      },
    };
    expect(convertMetafieldValue(node)).toBe("Rinse-out");
  });

  it("falls back to joining all fields when a metaobject has no 'label' field", () => {
    const node = {
      type: "metaobject_reference",
      value: "gid://shopify/Metaobject/1",
      reference: { __typename: "Metaobject", fields: [{ key: "name", value: "Sulfate-free" }] },
    };
    expect(convertMetafieldValue(node)).toBe("Sulfate-free");
  });

  it("resolves a list of metaobject references, joined", () => {
    const node = {
      type: "list.metaobject_reference",
      value: "[]",
      references: {
        edges: [
          { node: { __typename: "Metaobject", fields: [{ key: "label", value: "Sulfate-free" }] } },
          { node: { __typename: "Metaobject", fields: [{ key: "label", value: "Paraben-free" }] } },
        ],
      },
    };
    expect(convertMetafieldValue(node)).toBe("Sulfate-free, Paraben-free");
  });

  it("resolves a product reference to the referenced product's title", () => {
    const node = {
      type: "product_reference",
      value: "gid://shopify/Product/1",
      reference: { __typename: "Product", title: "Companion Shampoo" },
    };
    expect(convertMetafieldValue(node)).toBe("Companion Shampoo");
  });

  it("resolves a file reference (image) to its URL", () => {
    const node = {
      type: "file_reference",
      value: "gid://shopify/MediaImage/1",
      reference: { __typename: "MediaImage", image: { url: "https://cdn.shopify.com/pic.jpg" } },
    };
    expect(convertMetafieldValue(node)).toBe("https://cdn.shopify.com/pic.jpg");
  });

  it("returns null for a reference-type field with no reference set yet", () => {
    const node = { type: "metaobject_reference", value: null, reference: null };
    expect(convertMetafieldValue(node)).toBeNull();
  });

  it("extracts plain text from a rich_text_field JSON block-tree", () => {
    const value = JSON.stringify({ type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Great stuff" }] }] });
    expect(convertMetafieldValue({ type: "rich_text_field", value })).toBe("Great stuff");
  });

  it("passes through raw JSON as-is for type json", () => {
    const value = JSON.stringify({ preorder: true });
    expect(convertMetafieldValue({ type: "json", value })).toBe(value);
  });
});

describe("ensureMetafieldPropertyExists", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does nothing when the property already exists", async () => {
    global.fetch = vi.fn();

    const existing = new Set(["shopify_mf_judgeme_badge"]);
    await ensureMetafieldPropertyExists("judgeme", "badge", "single_line_text_field", existing);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates the property and adds it to the existing-properties set when missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => "{}" });

    const existing = new Set();
    await ensureMetafieldPropertyExists("custom", "new_field", "single_line_text_field", existing);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/crm/v3/properties/products"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(existing.has("shopify_mf_custom_new_field")).toBe(true);
  });

  it("uses a textarea field type for long-value metafield types", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => "{}" });

    await ensureMetafieldPropertyExists("custom", "long_field", "rich_text_field", new Set());

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.fieldType).toBe("textarea");
  });

  it("treats a 409 (already exists) as success, not a failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify({ message: "already exists" }) });

    const existing = new Set();
    await ensureMetafieldPropertyExists("custom", "race_field", "single_line_text_field", existing);

    expect(existing.has("shopify_mf_custom_race_field")).toBe(true);
  });
});
