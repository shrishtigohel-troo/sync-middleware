/**
 * A "connection" shape (Shopify's cursor-based pagination format):
 * { edges: [{ node, cursor }], pageInfo: { hasNextPage, endCursor } }
 */

/**
 * Generic cursor-based paginator for Shopify Admin GraphQL connections.
 * `fetchPage` receives the current cursor (null for the first page) and
 * must return one page. Yields nodes one at a time so callers can process
 * (and persist progress for) large datasets without loading everything
 * into memory at once.
 */
export async function* paginate(fetchPage) {
  let cursor = null;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const edge of page.edges) {
      yield edge.node;
    }
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
}
