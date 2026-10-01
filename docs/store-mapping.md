# Store mapping

See `src/config/stores.js` for the live registry.

The middleware treats every synced record as belonging to exactly one
Shopify store, identified by an internal `storeId`:

| `storeId` | `channel` | Purpose | Phase |
|---|---|---|---|
| `b2b` | `b2b` | US B2B Shopify Plus store | Phase 1 (current) |
| `b2c` | `b2c` | B2C Shopify Plus store | Phase 3 |

A store is only "configured" (registered in `shopifyStores`) if **both** its
`_STORE_URL` and `_ACCESS_TOKEN` environment variables are set - this lets
Phase 1 run with only the B2B store configured, without the code needing to
know about phases explicitly.

`storeId` and `channel` are written onto every synced Order (`shopify_store_id`,
`shopify_channel`) and Contact/Company (`shopify_store`) so records stay
attributable to their source store even after they land in HubSpot.

## Legal Entity

`LEGAL_ENTITY_BY_STORE` in `src/config/stores.js` is a placeholder, currently
`null` for both stores. **Pending client input** - do not invent a value. Once
provided, populate this map and start writing it wherever Legal Entity is
required (see the main requirements doc, section 16).

## Market

Market is a required concept (per the requirements) but has no implementation
yet - there is no confirmed mapping from a Shopify store/market configuration
to a HubSpot "Market" value. Do not invent this mapping. Treat it as an open
item alongside Legal Entity.
