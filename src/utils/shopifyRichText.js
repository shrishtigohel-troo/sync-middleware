/**
 * Shopify's `rich_text_field` metafield type stores its value as a JSON
 * string (a tree of nodes: root -> paragraph/heading/list -> text), not
 * plain HTML or plain text. This extracts just the readable text out of
 * that structure, joined with newlines between top-level blocks.
 *
 * Returns "" if the value isn't valid rich-text JSON (never throws) - a
 * bad/unexpected shape should not crash a whole product's sync.
 */
export function extractPlainTextFromShopifyRichText(jsonValue) {
  if (!jsonValue) return "";

  let root;
  try {
    root = JSON.parse(jsonValue);
  } catch {
    return "";
  }

  function collectText(node, out) {
    if (!node) return;
    if (typeof node.value === "string") {
      out.push(node.value);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) collectText(child, out);
    }
  }

  if (!Array.isArray(root.children)) return "";

  const blocks = root.children.map((block) => {
    const parts = [];
    collectText(block, parts);
    return parts.join("");
  });

  return blocks.filter(Boolean).join("\n");
}
