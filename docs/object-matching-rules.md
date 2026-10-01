# Object matching / duplicate-prevention rules

These rules are enforced in code (see `src/mappings/*.js` and the `scripts/poc-*.js`
proof-of-concept scripts), not just documented convention. If you change a
matching key, update both this file and the corresponding mapping module.

## Contacts

- **Primary match key: email.** One Shopify customer email = one HubSpot contact,
  regardless of which store (B2B or B2C) the customer exists in. Never create a
  second contact just because the same email exists in both stores.
- Shopify Customer ID is stored as a reference property (`shopify_customer_id`)
  but is **never** used as the match key - email is always checked first and only.
- A Shopify customer with no email is a hard failure, not a fallback-match case.

## Companies

- **Primary match key: Shopify Company ID** (`shopify_company_id`).
- Company **name is never** used as the automatic match key. Name similarity may
  only be used to flag possible duplicates for manual review.
- **Pending / not yet defined**: a cross-store company consolidation key (e.g.
  shared tax ID or domain) for when the same real-world company exists as
  separate Company records in more than one Shopify store. Do not invent this
  rule - it must come from the client. Track this as an open item until then.
- **Locations**: a company's Shopify locations (1 or many) are written into
  a single `shopify_locations` field (all names joined with newlines) plus a
  `shopify_location_count` field - not one HubSpot record per location. This
  behaves identically regardless of location count. On the live webhook
  path, location names require one extra GraphQL lookup
  (`getCompanyLocationNames` in `src/shopify/queries/companies.js`), since
  the standard REST company webhook payload doesn't include them.

## Products

- **Match key: Shopify Product ID + Variant ID / SKU.**
- Each Shopify **variant** becomes its own HubSpot Product record (a product
  with 3 variants produces 3 HubSpot Products), matched in this priority order:
  1. `shopify_variant_id` (exact)
  2. `hs_sku` (exact)
  3. `name` (weak - logged as "review manually", never silently trusted)
- **The SKU fallback exists specifically for native-integration records.**
  Unlike Orders, Products have no dedicated native reference field at all -
  confirmed live: a record the native Shopify-HubSpot integration created
  had no `shopify_*` fields populated, only name/description/price/SKU.
  Without the SKU fallback, the middleware creates a second Product for
  anything native sync already created, then fails outright when writing
  `hs_sku` - HubSpot enforces SKU uniqueness, and the native record already
  holds it. This exact failure happened live on the client's real store
  (`"Cannot set ... hs_sku ... already has that value"`) before the fix.
- This dual-key check was already correct in the historical migration path
  (`src/sync/migrateProducts.js`) but was missing from the **live webhook
  path** until found via this real failure - both now share one
  implementation, `src/sync/findExistingProduct.js`.

## Orders

- **Compound match key: Shopify Store ID + Shopify Order ID.** Neither field
  alone is sufficient - two different Shopify stores can issue an order with
  the same order number (e.g. B2B store order #1001 and B2C store order #1001
  are different transactions and must stay separate). This was validated live:
  searching HubSpot for "#1012" turned up an order from a *different* Shopify
  store that happened to share the same order number - proof the compound key
  is necessary, not theoretical.
- **Also checked: HubSpot's native reference fields** (`hs_source_store` +
  `hs_external_order_id`), populated by the native Shopify-HubSpot
  integration if it's still running. A live test found this integration had
  *already* created records for orders our middleware then tried to sync,
  and because the middleware only checked its own compound key, it created a
  duplicate. Fixed via `src/sync/findExistingOrder.js`, which checks *both*
  key sets (OR semantics - a match on either wins) before deciding
  create-vs-update. The middleware now also writes `hs_source_store` /
  `hs_external_order_id` on every order it creates, so future lookups (by
  either system) converge on one record.
- **Do not disable this dual check** even after the native integration is
  switched off for orders (per the production rollout plan) - it's cheap
  insurance and costs nothing once native sync is off.
- **Order -> Contact association** is matched by the order's customer email
  against HubSpot Contacts (email-only, same rule as Contacts elsewhere) -
  implemented in both the full migration (`src/sync/migrateOrders.js`) and
  the live webhook path (`src/middleware/webhookRouter.js`). This requires
  Protected Customer Data approval to read the customer's email, which is
  available on Shopify Plus stores (this project's scope).
- **Order -> Company association** is currently only implemented in the full
  migration path, matched via the order's B2B purchasing company. The live
  webhook path does not attempt this - the standard REST order webhook
  payload does not reliably expose the purchasing company field.
- **Market** (`shopify_market`) is a static, per-store value for Phase 1
  (`"United States"` for the b2b store - see `MARKET_BY_STORE` in
  `src/config/stores.js`), not something read from a Shopify field, since
  Phase 1 is scoped to US B2B only. It will need to become a real per-order
  value once Phase 2 (international B2B) begins.

## Orders vs Deals (client decision - Orders is the current live path)

- Earlier, the client's real HubSpot portal did not expose the Orders
  object (confirmed live via the Objects settings search returning no
  results for "Orders"), so the live path was switched to create one
  HubSpot **Deal** per Shopify order instead (per SOW section 12, "Orders
  and Deals"). The client has since added the Orders object, so **the live
  webhook path targets Orders again** (`src/middleware/webhookRouter.js`).
- **The Deal-based code is kept in place, not deleted** -
  `src/mappings/deal.js`, `src/mappings/webhookDeal.js`,
  `src/sync/migrateDeals.js`, `src/sync/findExistingDeal.js`,
  `scripts/migrate-deals.js` - in case the client's HubSpot setup changes
  again. It is simply not wired into the live webhook path right now.
- **Order -> Company association on the live webhook path**: the standard
  REST order webhook payload does not reliably include the B2B purchasing
  company, so rather than guess at an unconfirmed field name, the live
  webhook handler makes one extra GraphQL lookup
  (`getOrderPurchasingCompanyId` in `src/shopify/queries/orders.js`) to
  fetch the order's purchasing company directly from Shopify, then
  associates the Order the same way `src/sync/migrateOrders.js` does. This
  costs one extra Shopify API call per order webhook, only when a Company
  match is even possible (skipped entirely if `shopify_company_id` doesn't
  exist yet on Companies).

## Line items

- **Match key: custom `shopify_line_item_id` property.**
- HubSpot's native `hs_external_id` field ("External line item id") looked
  like the right fit for this - purpose-named, and listed as a plain
  writable "number" field. **It is not actually usable via the standard API**:
  a live test showed the create/update response echoes back the value you
  sent, but a follow-up read shows it reverted to `null` - confirmed with
  three separate attempts (direct create, direct update, and a full
  create-then-update workaround), all showing the same silent revert. This
  isn't documented anywhere; it was only found by testing. A custom property
  was used instead, following the same pattern as every other object in this
  project - see `src/sync/findExistingLineItem.js`.
- Re-running the line item sync against the same order now updates existing
  line items instead of creating duplicates, once `shopify_line_item_id` is
  created in the portal (Single-line text, on the Line Item object).

## Concurrent webhook deliveries for the same record

Matching by key (as described above) is not enough on its own to prevent
duplicates - it only tells you whether an existing record *exists at the
moment you check*. Shopify routinely fires two webhooks for the same record
within about a second of each other (e.g. a `products/create` immediately
followed by a `products/update`). If both webhook handlers run their
"search HubSpot, then create if not found" check at the same time, both can
see "no existing record yet" and both create one - producing a duplicate
even though the matching key logic itself is correct.

This was found live: a `products/create` and `products/update` webhook for
the same Shopify product landed about 1 second apart, and both created a
HubSpot product for the same variant ID, resulting in two records.

Fixed with `src/middleware/concurrencyLock.js` (`ConcurrencyLock`), which
serializes webhook processing per Shopify record (keyed by
`store:recordType:shopifyId`) inside `src/middleware/webhookRouter.js`, so a
second webhook for the same record always waits for the first to finish
before it runs its own existence check. This only serializes within a single
running Node.js process - it is not a substitute for the key-based matching
above, and would need to become a distributed lock (e.g. Redis) if the
middleware is ever scaled to multiple instances.

## General principle

The middleware never falls back to a "best guess" match silently. Any
non-primary match strategy used (e.g. product name) is explicitly logged with
a "weak match - review manually" label so it can be audited later.
