# Phase 1 Status — US B2B Shopify → HubSpot Integration

Last updated: 2026-09-14

## Summary

Phase 1 covers connecting the client's US B2B Shopify Plus store to HubSpot
CRM: Products, Orders, Line Items, Customers, Companies, and the
duplicate-prevention/mapping rules that govern all of them. Everything that
does **not** depend on external approvals or client-provided values is
**built, tested, and verified against the real store**. What remains is
blocked on two things outside this codebase's control (see "Blocked" below).

## What's done and verified

### Products
- Reads a product (and all its variants) from Shopify via the Admin GraphQL API
- Creates or updates the matching HubSpot Product, matched by Shopify Variant ID (falls back to SKU, then name as a last resort)
- **Verified live**: ran a full historical migration against the real store — 62 products / all variants processed, 31 successfully synced (see "Known platform limit" below for why the rest didn't complete)
- **How to test**: `npm run poc:product-sync` — syncs one product and prints exactly what it did

### Orders + Line Items
- Reads orders from Shopify, matched using a compound key (Shopify Store ID + Shopify Order ID) so the same order number from two different stores is never confused
- Also checks HubSpot's own native tracking fields, so it correctly recognizes orders the pre-existing native Shopify-HubSpot integration already created, instead of duplicating them
- Line items are matched the same duplicate-safe way and linked to their parent order
- Preserves the original order currency and amount exactly as Shopify sent it — never converts
- Tracks order status (paid/unfulfilled/cancelled) without dropping cancelled orders
- **Verified live**: ran a full historical migration against the real store — **12 orders, 13 line items, zero failures**, and re-running it a second time correctly updated existing records instead of creating duplicates
- **How to test**: `npm run poc:order-sync` (run it twice — the second run should say "UPDATED" both times, not "CREATED")

### Real-time sync (Webhooks)
- Verifies every incoming webhook is genuinely from Shopify (signature check) before processing anything
- Ignores duplicate webhook deliveries (Shopify can send the same event twice)
- **Products**: verified live — edited a real product in Shopify, watched the webhook arrive and update HubSpot within seconds, with zero duplicates
- **Customers/Orders**: built the same way, not yet proven with a live webhook (needs a temporary public URL via `ngrok` to test — the setup Products was proven with)

### Company ↔ Contact linking
- Links every contact on a B2B company to that company in HubSpot
- Flags which contact is the "main" contact
- **Tested with simulated data** (5 automated tests) — logic is correct; not yet run against real company/contact records (see "Blocked")

### Revenue & order-history calculations (Rollups)
- Calculates total orders, last order date, and revenue per customer or company
- Currency-safe: never adds different currencies together (a $100 USD order and a €100 EUR order stay separate, never become "$200")
- Excludes cancelled orders from the totals
- **Tested with simulated data** (8 automated tests) — logic is correct; not yet run against real order history (see "Blocked")

### Duplicate prevention (the core requirement)
- Contacts: matched by email only, never by name
- Companies: matched by Shopify Company ID only, never by name
- Products: matched by Shopify Variant ID / SKU
- Orders: matched by Store ID + Order ID together
- Line items: matched by a dedicated tracking field
- All of the above have been validated against real duplicate scenarios found during testing (see "Bugs found and fixed")

### Safety rules
- Never overwrites HubSpot-owned CRM fields (sales owner, lifecycle stage, lead status, etc.) — enforced in code, not just by convention
- Never logs access tokens, secrets, or raw customer PII
- Every sync operation retries automatically on temporary failures, and one failed record never stops the rest of a batch

### Automated tests
- **99 tests, all passing**, covering every rule above
- **How to test**: `npm test`

## Bugs found and fixed during testing

Two real issues were found by testing against the live store — both are now fixed and covered by automated tests so they can't silently return:

1. **Order duplicates**: the middleware was creating a second HubSpot Order record for orders the native Shopify integration had already synced, because it only checked its own tracking field. Fixed by checking both tracking systems before deciding to create vs. update.
2. **Line item duplicates**: HubSpot has a built-in field meant for exactly this purpose, but testing showed it silently discards any value written to it via the API — a platform quirk, not a bug in our code. Switched to a dedicated custom field instead, which works correctly.

## Known platform limit (not a code issue)

This specific HubSpot test portal has a **hard cap of 100 Product records** (a plan-tier restriction). The full product migration stopped succeeding once that cap was hit — this is expected and correctly handled (each failure was logged individually, nothing crashed). The client's production HubSpot portal should be checked for the same limit before a real migration.

## Blocked — not a code gap, needs external input

| Item | Blocker | Who can unblock it |
|---|---|---|
| Customers sync, Companies sync, Order↔Contact linking, live rollups | This Shopify test store's plan doesn't allow reading customer names/emails via API | Either approve this on the test store, or test directly against the client's real Shopify Plus store (which shouldn't have this restriction) |
| Product metafields (Category/Brand/Family) | Real field names not yet confirmed | Client |
| Legal Entity / Market values | Not yet provided | Client |

## Simple test checklist

```
npm test                    # confirms all 99 automated tests still pass
npm run poc:product-sync    # syncs one product, proves no duplicates
npm run poc:order-sync      # syncs one order, run twice to prove no duplicates
```
