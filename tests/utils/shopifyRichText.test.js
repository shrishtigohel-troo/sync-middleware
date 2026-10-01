import { describe, it, expect } from "vitest";
import { extractPlainTextFromShopifyRichText } from "../../src/utils/shopifyRichText.js";

describe("extractPlainTextFromShopifyRichText", () => {
  it("extracts text from a single paragraph", () => {
    const json = JSON.stringify({
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "Hello world" }] }],
    });
    expect(extractPlainTextFromShopifyRichText(json)).toBe("Hello world");
  });

  it("joins multiple text runs within one block", () => {
    const json = JSON.stringify({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Bold " }, { type: "text", value: "and normal" }],
        },
      ],
    });
    expect(extractPlainTextFromShopifyRichText(json)).toBe("Bold and normal");
  });

  it("joins separate top-level blocks with newlines", () => {
    const json = JSON.stringify({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "First line" }] },
        { type: "paragraph", children: [{ type: "text", value: "Second line" }] },
      ],
    });
    expect(extractPlainTextFromShopifyRichText(json)).toBe("First line\nSecond line");
  });

  it("returns empty string for invalid JSON, never throws", () => {
    expect(extractPlainTextFromShopifyRichText("not json")).toBe("");
  });

  it("returns empty string for null/undefined input", () => {
    expect(extractPlainTextFromShopifyRichText(null)).toBe("");
    expect(extractPlainTextFromShopifyRichText(undefined)).toBe("");
  });

  it("returns empty string when there are no children blocks", () => {
    expect(extractPlainTextFromShopifyRichText(JSON.stringify({ type: "root" }))).toBe("");
  });
});
