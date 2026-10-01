# Project Handoff — Shopify ↔ HubSpot Middleware (Difiaba Professional)

This document is for whoever picks up this project next. It covers what access
you need, what's done, what's blocked, and what to do next.

## 1. Access you need

| What | Details |
|---|---|
| Project folder | `c:\shopify-hubspot-middleware` on this machine, or wherever it's been moved to a shared repo |
| `.env` file | Holds every credential the middleware needs (Shopify store URL, Shopify Admin API access token, Shopify webhook secret, Shopify app Client ID/Secret, HubSpot access token). Get this transferred securely — never over chat/email in plain text |
| Shopify Partner / Dev Dashboard | App name: **"Sync Middleware - Difiaba"**. Used to manage the Shopify app's scopes, redirect URLs, and distribution |
| Client's real Shopify store | Store handle: `difiabapro` (admin URL: `admin.shopify.com/store/difiabapro`). Canonical API domain is **`s1wn3s-ni.myshopify.com`**, not `difiabapro.myshopify.com` — this matters when running scripts or the OAuth helper (see Section 5) |
| Client's real HubSpot portal | Private/Legacy App name: **"Shopify Sync Middleware"** |
| ngrok account | Reserved domain: `affected-rare-sandal.ngrok-free.dev` — used to expose the local server for webhook testing |
| Resend account | Being set up for email failure alerts (recipient: `crm@trooinbound.com`) — get the API key once created |

## 2. What's fully built and tested

- **Live sync for Contacts, Companies, Orders, Line Items** — creates/updates records in HubSpot the moment something changes in Shopify, via webhooks
- **Duplicate-prevention** for every object type (email for Contacts, Shopify Company ID for Companies, Store ID + Order ID compound key for Orders, Shopify Line Item ID for Line Items)
- **Order → Contact and Order → Company automatic linking** — including a live GraphQL lookup for the B2B purchasing company, since the standard webhook payload doesn't include it
- **Company Locations** — works whether a company has 1 or many Shopify locations; writes `shopify_locations` (all names, one per line) and `shopify_location_count`
- **Currency handling** — 5 currencies (USD, EUR, MXN, GTQ, CRC), always preserved exactly as Shopify shows them, never combined or converted
- **Concurrency/race-condition fix** — prevents duplicate records when two webhooks for the same record arrive close together
- **133 automated tests, all passing** — run with `npm test`

See `docs/object-matching-rules.md` and `docs/field-mapping.md` for the full technical detail and the *why* behind each decision.

## 3. Shopify side — done

- App created via Dev Dashboard (not the old legacy "Create app" flow — Shopify is phasing that out)
- Scopes: read-only — `read_companies`, `read_customers`, `read_orders`, `read_products` (confirmed the middleware never writes back to Shopify, only reads)
- Installed on the real store, Admin API access token retrieved and verified
- **8 webhooks live**, all pointing at `https://affected-rare-sandal.ngrok-free.dev/webhooks/shopify/...`:
  - Product creation, Product update → `/webhooks/shopify/products`
  - Order creation, Order update → `/webhooks/shopify/orders`
  - Customer creation, Customer update → `/webhooks/shopify/customers`
  - Company creation, Company update → `/webhooks/shopify/companies` (registered via GraphQL API, not the Notifications page — Shopify doesn't expose Company events there)

## 4. HubSpot side — mostly done

**Properties created** on Contacts, Companies, Orders, Line Items (see `docs/client-handoff-hubspot-properties.md` for the exact list). Products object was recently enabled on the client's portal — its properties still need to be created.

**Private/Legacy App scopes** — in progress. Exact list needed (10 total, no more):
```
crm.objects.contacts.read / write
crm.objects.companies.read / write
crm.objects.orders.read / write
crm.objects.products.read / write
crm.objects.line_items.read / write
```
This was blocked earlier by a "not authorized, ask a Super Admin" error — check whether that's been resolved before assuming the scopes are actually granted.

## 5. Key gotchas learned the hard way (read before repeating the work)

- **The store's canonical domain isn't always the one shown in the URL bar.** `difiabapro.myshopify.com` is a connected alias — the real one Shopify uses for OAuth/API is `s1wn3s-ni.myshopify.com`. If a script/OAuth flow fails with a domain mismatch, this is why.
- **Dev Dashboard apps don't show the Admin API access token in the UI** the way old legacy custom apps did. To get the token, you have to do a real OAuth exchange — see `scripts/oauth-get-token.js`, a one-time helper script built for exactly this. It needs the app's Client ID + Secret in `.env`, and a redirect URL registered in the app that matches the ngrok domain's host exactly (Shopify rejects mismatched hosts).
- **Company webhooks aren't available on Shopify's regular Notifications page** — they had to be registered directly via the GraphQL `webhookSubscriptionCreate` mutation, and they're signed with the app's **Client Secret**, not the store-wide webhook secret shown on the Notifications page. Two different secrets, don't mix them up.
- **HubSpot's Products object isn't included on Marketing Hub Enterprise by default** — it needed the client to enable it separately (has since been done).
- **Never rely on HubSpot's native fields for our own duplicate-matching** — e.g. `hs_external_id` on Line Items silently discards API writes (confirmed by live testing). Always use our own custom `shopify_*` properties instead.
- **The Deal-vs-Order decision flipped twice** — started on Orders (sandbox testing), switched to Deals when the client's real portal seemed to lack the Orders object, then switched back to Orders once the client added it. The Deal-based code (`src/mappings/deal.js`, `src/sync/migrateDeals.js`, etc.) is still in the codebase, just not wired into the live path — don't delete it, it may be needed again.
- **No historical migration** — client explicitly confirmed Phase 1 is sync-only, going forward from now, not a backfill of old data. This contradicts the original Q&A doc's Q4 answer (which said backfill was included) — flagged to the client but not yet formally re-confirmed in writing anywhere except this handoff.

## 6. Currently blocked / pending — pick up here

1. **Confirm the 10 HubSpot scopes actually got added** — the Super Admin permission issue may or may not be resolved yet
2. **Create Product properties in HubSpot** now that the Products object is enabled (Shopify Product ID, Shopify Variant ID, Product Category, Brand — see `docs/field-mapping.md`)
3. **Get exact metafield namespace/key** for 3 Shopify Product metafields from the client: "Category" (custom, distinct from Shopify's built-in Category), "Technical Family", "Collection" — needed to finish `src/config/productMetafields.js`
4. **Finish building email alerting** — client chose Email (not Slack), recipient is `crm@trooinbound.com`, using Resend as the sending service. Needs: (a) a Resend API key in `.env` as `RESEND_API_KEY`, (b) the actual alert-sending code wired into the webhook error handlers in `src/middleware/webhookRouter.js` (not yet built as of this handoff)
5. **Run 2 remaining test scenarios**: a cancelled/refunded order, and a repeat customer placing a second order — confirm both update existing records rather than duplicating
6. **Full live end-to-end test** — once the HubSpot token/scopes are confirmed working
7. **Deploy to a permanent server** (AWS EC2, Render, or Railway — all three are viable per the Q&A doc) — currently still running locally via `npm run dev` + ngrok, not production-ready

## 7. How to run things locally

```bash
npm install
npm test              # run all 133 tests
npm run dev           # start the middleware server (port 3000 by default)
```

Then in a separate terminal:
```bash
ngrok http 3000 --domain=affected-rare-sandal.ngrok-free.dev
```

To re-run the one-time OAuth token exchange (if the Shopify token ever needs refreshing):
```bash
node scripts/oauth-get-token.js --shop=s1wn3s-ni.myshopify.com --redirect-uri=https://affected-rare-sandal.ngrok-free.dev/oauth/callback --port=3001
```
(Needs `SHOPIFY_B2B_APP_CLIENT_ID` and `SHOPIFY_B2B_APP_CLIENT_SECRET` set in `.env` first, and ngrok pointed at port 3001 instead of 3000 for that one operation.)
