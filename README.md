# Shopify → HubSpot Middleware

Custom Node.js (plain JavaScript, ES modules) middleware that reads commerce
data from Shopify Plus (one B2B store, one B2C store) and creates/updates the
corresponding records in HubSpot CRM - without duplicating records or
overwriting the CRM fields HubSpot itself owns.

```
SHOPIFY PLUS  ->  CUSTOM NODE.JS MIDDLEWARE  ->  HUBSPOT CRM
```

Shopify is the source of truth for commerce data (customers, companies,
products, orders, line items). HubSpot remains the owner of CRM/sales fields
(owner, lifecycle stage, lead status, notes, activities). The middleware only
ever writes commerce-reference fields - see
[`docs/field-mapping.md`](docs/field-mapping.md).

This project is plain JavaScript (no build step, no compiler) with runtime
validation via `zod` for environment configuration - not TypeScript.

## Current status

This is under active, phased development. **Nothing here performs a full
migration automatically** - every historical-migration script requires an
explicit `--confirm` flag, and every sync path also has a controlled,
single-record proof-of-concept version you should run and review first.

| Area | Status |
|---|---|
| Shopify Admin GraphQL client (auth, retry, throttle handling) | Done |
| HubSpot CRM REST client (auth, retry, rate-limit handling) | Done |
| Connectivity checks (`check:shopify`, `check:hubspot`) | Done |
| Products + variants sync (duplicate-safe, per-variant HubSpot records) | Done - PoC verified against a real store |
| Customers sync (Shopify Customer -> HubSpot Contact, matched by email) | Built - **blocked** on Shopify Protected Customer Data approval on the current test store |
| Companies sync (Shopify Company -> HubSpot Company, matched by Company ID) | Built - same PII block for contact-level fields on that object |
| Company <-> Contact associations + main-contact flagging | Built - blocked from live testing by the same PII restriction |
| Orders + Line Items sync (compound store+order key, associations) | **Live-tested and proven duplicate-safe against the real store**, including converging with the native integration's own records (found and fixed a real duplicate-record bug - see docs/object-matching-rules.md) |
| Line item idempotency (matched via HubSpot's native `hs_external_id`) | Live-tested - re-syncing an order updates existing line items instead of duplicating them |
| Historical/bulk migration (Products, Orders, Customers, Companies) | Built - locked behind `--confirm`, not yet run for real |
| Webhooks / real-time sync (Products, Customers, Orders + Line Items) | **Products live-tested end-to-end via ngrok + a real Shopify webhook** (found and fixed a duplicate-ID-format bug in the process). Customers/Orders webhooks built the same way, not yet live-tested. Fire-and-forget in-process (no persistent queue yet - see README's Webhook setup section). |
| Rollups (CLV, order count, last order date, currency-safe) - Contacts AND Companies | Built and tested - same calculation serves company-wide purchase history (client requirement, section 12). Live orchestration blocked on Order <-> Contact association, which needs the Shopify PII approval; Order <-> Company has no such block. |

## Architecture

```
src/
  config/       Environment, store registry, currency/language config,
                HubSpot property registry, product metafield mapping
  shopify/      Admin GraphQL client, pagination helper, per-object queries
  hubspot/      REST client, generic object CRUD/search/batch API,
                property-existence checks, association helpers
  mappings/     Pure functions: Shopify data -> HubSpot properties
  utils/        Structured logging (secret-redacting), retry/backoff
  middleware/   Webhook HMAC verification, idempotency store, webhook router (receives + writes)
  sync/         Historical/bulk migration logic (Products, Orders, Customers, Companies),
                Company<->Contact association + main-contact flagging
  services/     Rollup/CLV calculation (currency-safe, cancelled orders excluded)
  index.js      Express entrypoint (health check + webhook routes mounted)
scripts/        Runnable scripts: connectivity checks, PoC syncs, migrations
tests/          Vitest unit tests for the pure mapping/utility/middleware logic
docs/           Field mapping, matching rules, store/currency/language/
                metafield/association mapping reference
```

## Prerequisites

- Node.js >= 20 (no build step required - plain JavaScript, ES modules)
- A Shopify Plus store with a custom app (Admin API access token)
- A HubSpot Private App with the CRM scopes listed below

## Installation

```bash
npm install
cp .env.example .env
```

Then fill in `.env` (never commit it - it's already in `.gitignore`):

```
SHOPIFY_B2B_STORE_URL=your-store.myshopify.com
SHOPIFY_B2B_ACCESS_TOKEN=shpat_...
HUBSPOT_ACCESS_TOKEN=pat-...
```

See `.env.example` for every available variable and its default.

## Shopify setup

1. In the target store's admin: **Settings -> Apps and sales channels ->
   Develop apps -> Create an app**.
2. Configuration -> Admin API integration -> Configure -> enable at least:
   `read_products`, `read_customers`, `read_orders`, `read_companies`.
   (Metafield reads are covered by the parent object's scope - there is no
   separate `read_metafields` scope.)
3. Install the app, then reveal and copy the **Admin API access token**
   (shown once).
4. If you need customer/order PII fields (email, name, phone, address):
   under the app's **Configuration** tab, request **Protected customer data
   access**. On some store plans this instead shows "Upgrade plan" - PII API
   access is gated by the store's Shopify plan tier (Shopify/Advanced/Plus),
   separate from app approval. The client's production stores are Shopify
   Plus, so this should not block production use.

## HubSpot setup

1. Create a Private App (already done for this project - "Shopify Custom
   Migration").
2. Scopes needed: Contacts, Companies, Products, Orders, Line Items -
   read/write on each.
3. Copy the **Access token** (this is the only credential the middleware
   uses day to day - the client secret is not used unless a specific OAuth
   flow requires it).
4. Create the custom properties listed in
   [`docs/field-mapping.md`](docs/field-mapping.md) before running any sync
   for that object - the scripts check live property existence and skip
   (rather than fail or guess) anything not yet created.

## Local development

```bash
npm run dev     # starts the Express server (node --watch, auto-restarts on file changes)
npm start       # runs the server without watch mode
```

## Running the connectivity checks

```bash
npm run check:shopify
npm run check:hubspot
```

Both log only safe, non-secret metadata (shop name/domain, portal ID, object
scope confirmation) - never tokens.

## Running the proof-of-concept syncs

Each of these touches **at most one record** end to end, so you can verify
behavior before trusting it with real data:

```bash
npm run poc:product-sync    # 1 product (all its variants) -> HubSpot Products
npm run poc:customer-sync   # 1 customer -> HubSpot Contact
npm run poc:company-sync    # 1 B2B company -> HubSpot Company
npm run poc:order-sync      # 1 order + its line items -> HubSpot Order/Line Items
```

Read the logged `skippedMissingProperties` field after each run - it tells
you exactly which HubSpot custom properties still need to be created before
that object's sync is complete. See [`docs/field-mapping.md`](docs/field-mapping.md).

## Running tests

```bash
npm test          # single run
npm run test:watch
```

Tests cover the pure mapping/config/utility/middleware logic (no live API
calls) - duplicate-prevention rules, currency preservation, HubSpot-owned-
field guarding, retry/backoff behavior, pagination, and webhook signature
verification.

## Migration commands

Each of these walks **every** matching record in one store and requires the
explicit `--confirm` flag - they refuse to run without it, precisely because
(unlike the `poc:*` scripts) they touch more than one record:

```bash
npm run migrate:products  -- --store=b2b --confirm
npm run migrate:orders    -- --store=b2b --confirm
npm run migrate:customers -- --store=b2b --confirm
npm run migrate:companies -- --store=b2b --confirm
```

Run the matching `poc:*-sync` script first and confirm its output, and make
sure the relevant HubSpot properties from `docs/field-mapping.md` exist,
before running any of these for real. One failing record does not stop the
run - failures are logged and counted in the final summary.

## Webhook setup

`src/middleware/webhookRouter.js` handles: HMAC signature verification per
store, duplicate-delivery protection, routing by topic
(`/webhooks/shopify/products`, `/customers`, `/orders`), and the actual
create/update write to HubSpot using the same duplicate-safe matching as the
`poc:*-sync` scripts (REST-payload mapping functions in
`src/mappings/webhookProduct.js`, `webhookCustomer.js`, `webhookOrder.js`).

Two known, intentional gaps (not guessed at): product metafields are not
included in the default webhook payload, and product/orders webhooks don't
associate to Companies (the B2B purchasing-company field on the REST order
webhook payload hasn't been confirmed). Order <-> Contact association is
also not attempted from webhooks - same Protected Customer Data block as
elsewhere.

Processing is fire-and-forget in-process: the route responds `200` to
Shopify immediately, then performs the HubSpot write in the background. This
has **not been tested against a real Shopify-delivered webhook** - only unit
tests of the payload-mapping functions exist so far. There is also no
persistent queue - if the process crashes between the `200` response and
finishing the write, that update is lost; replace with a real queue (Redis/
BullMQ or a DB-backed job table) before relying on this for production
webhook volume.

To register webhooks: create webhook subscriptions in the Shopify custom app
pointing at `https://<your-host>/webhooks/shopify/<topic>`, and set
`SHOPIFY_B2B_WEBHOOK_SECRET` (and/or `SHOPIFY_B2C_WEBHOOK_SECRET`) in `.env`
to the secret Shopify gives you for that app.

## Deployment

Not yet defined for this project. Once the webhook payload mapping is built,
this section should document the target hosting environment, process
manager/orchestration, and required environment variables for that
environment.

## Duplicate prevention / data mapping

See:
- [`docs/object-matching-rules.md`](docs/object-matching-rules.md) - the match key per object type
- [`docs/field-mapping.md`](docs/field-mapping.md) - Shopify field -> HubSpot property, and what's confirmed vs. pending
- [`docs/store-mapping.md`](docs/store-mapping.md)
- [`docs/currency-mapping.md`](docs/currency-mapping.md)
- [`docs/language-mapping.md`](docs/language-mapping.md)
- [`docs/metafield-mapping.md`](docs/metafield-mapping.md)
- [`docs/association-mapping.md`](docs/association-mapping.md)

## Error handling

- All Shopify/HubSpot API calls go through `withRetry()`
  (`src/utils/retry.js`): exponential backoff + jitter, honors a
  `Retry-After`-style hint when the API provides one, and only retries
  errors classified as transient (429, 5xx, HubSpot `CONFLICT`, network
  errors) - never a validation/permission error.
- `src/utils/logger.js` redacts any field whose key looks secret-shaped
  (`token`, `secret`, `authorization`, `password`, `api_key`, etc.) before
  logging, in addition to the mapping/scripts layer never logging raw
  customer PII (e.g. the customer-sync PoC logs `hasEmail: true/false`, not
  the email itself).
- Every PoC and migration script isolates failures per record (e.g. one bad
  line item does not stop the rest of the order's line items from syncing,
  and one bad order does not stop the rest of the migration) and exits with
  a non-zero code on any failure, for scripting/CI use.
- Webhook deliveries are deduplicated in-memory via `X-Shopify-Webhook-Id`
  (`src/middleware/webhookIdempotency.js`) - **this in-memory store does not
  survive a restart or coordinate across multiple instances; replace it with
  a persistent store (Redis/DB) before running behind a load balancer or
  auto-restarting process manager.**

## Troubleshooting

- **"Shopify GraphQL request failed" with no detail**: check the script's
  logged `graphQLErrors` field (the PoC scripts surface it) - the most
  common cause is a missing Admin API scope or, for customer/order PII
  fields, missing Protected Customer Data approval.
- **`skippedMissingProperties` is non-empty**: the corresponding HubSpot
  custom property hasn't been created yet - see `docs/field-mapping.md` for
  the exact label/type to create.
- **A product PoC run matches by `name (weak match - review manually)`**:
  this means `shopify_product_id`/`shopify_variant_id` don't exist as
  HubSpot properties yet, or the specific record hasn't had the ID written
  onto it yet (this resolves itself after the first successful write) -
  don't treat name-matching as a permanent duplicate-prevention strategy.
- **A migration script refuses to run**: it's missing the `--confirm` flag -
  this is intentional, not a bug.
- **`.env` values were pasted into a chat/PR/log accidentally**: rotate both
  the Shopify Admin API token and the HubSpot Private App access token
  immediately (each has a "rotate" action in its respective admin UI), then
  update `.env`.

## Production rollout steps (planned, not yet executed)

1. Confirm every HubSpot property in `docs/field-mapping.md` is created and
   `confirmed: true` where applicable in `src/config/*.js`.
2. Complete historical migration for Phase 1 (US B2B) using
   `npm run migrate:products -- --confirm` etc., in the order Products ->
   Customers -> Companies -> Orders, reviewing each summary's failure count
   before moving to the next.
3. Verify no duplicate records were created by cross-checking match keys.
4. Only then: identify which native Shopify-HubSpot syncs overlap with the
   middleware's responsibilities and disable those specific native syncs -
   never disable the native integration before this point, and never disable
   more than the overlapping objects. The goal is exactly one process
   responsible for each synced field/object.
5. Build the webhook payload -> HubSpot mapping, then enable webhooks for
   real-time sync once tested for idempotency.
6. Repeat for Phase 2 (international B2B), then Phase 3 (B2C).
