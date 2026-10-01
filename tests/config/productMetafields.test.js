import { describe, it, expect } from "vitest";
import {
  PRODUCT_METAFIELD_DEFINITIONS,
  getSyncableProductMetafieldDefinitions,
  convertMetafieldValue,
} from "../../src/config/productMetafields.js";

describe("productMetafields registry", () => {
  it("excludes unsupported (file/JSON/reference/metaobject) fields from the syncable list", () => {
    const syncable = getSyncableProductMetafieldDefinitions();
    const unsupportedKeys = PRODUCT_METAFIELD_DEFINITIONS.filter((d) => d.handling === "unsupported").map((d) => d.key);

    for (const key of unsupportedKeys) {
      expect(syncable.some((d) => d.key === key)).toBe(false);
    }
  });

  it("every syncable definition has a hubspotProperty name", () => {
    for (const definition of getSyncableProductMetafieldDefinitions()) {
      expect(definition.hubspotProperty).toBeTruthy();
    }
  });
});

describe("convertMetafieldValue", () => {
  it("passes through a plain single_line_text_field value unchanged", () => {
    const definition = { handling: "text", type: "single_line_text_field" };
    expect(convertMetafieldValue(definition, "Activator")).toBe("Activator");
  });

  it("joins a list.single_line_text_field JSON array into a comma-separated string", () => {
    const definition = { handling: "text", type: "list.single_line_text_field" };
    expect(convertMetafieldValue(definition, JSON.stringify(["red", "blue"]))).toBe("red, blue");
  });

  it("falls back to the raw value if list JSON fails to parse", () => {
    const definition = { handling: "text", type: "list.single_line_text_field" };
    expect(convertMetafieldValue(definition, "not-json")).toBe("not-json");
  });

  it("extracts plain text for richText handling", () => {
    const definition = { handling: "richText", type: "rich_text_field" };
    const json = JSON.stringify({ type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Great product" }] }] });
    expect(convertMetafieldValue(definition, json)).toBe("Great product");
  });
});
