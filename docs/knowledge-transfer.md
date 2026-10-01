# Knowledge Transfer — Shopify ↔ HubSpot Middleware (Difiaba Professional)

This is a **step-by-step runbook**, not just reference notes. Follow Part A
in order to actually get set up and running. Part B is background/reference
material to read once you're up and running.

---

# PART A — DO THIS, IN ORDER

## Step 1 — Fill in your credentials

You need these before anything else works. Fill in the blanks below
yourself (never share these in chat/email):

```
Shopify Partner Dashboard login (dev.shopify.com)
  Email:
  Password:

Shopify store admin login (admin.shopify.com/store/difiabapro)
  Email:
  Password:

HubSpot portal login (app.hubspot.com, Portal ID 51470717)
  Email:
  Password:

Resend login (resend.com, org "trooinbound")
  Email:
  Password:

ngrok account login (dashboard.ngrok.com)
  Email:
  Password:
```

## Step 2 — Get the project and fill in `.env`

```bash
cd c:\shopify-hubspot-middleware
npm install
```

Open `.env` (create it from `.env.example` if it doesn't exist) and fill
in these values — get them from the logins above, exact locations noted:

```
SHOPIFY_B2B_STORE_URL=s1wn3s-ni.myshopify.com
SHOPIFY_B2B_ACCESS_TOKEN=<from the Shopify app - see Step 3>
SHOPIFY_B2B_WEBHOOK_SECRET=<Shopify store admin -> Settings -> Notifications -> Webhooks, shown at the bottom>
SHOPIFY_B2B_APP_CLIENT_ID=<Dev Dashboard -> app -> App settings -> Credentials>
SHOPIFY_B2B_APP_CLIENT_SECRET=<same page, click Show secret>

HUBSPOT_ACCESS_TOKEN=<HubSpot -> Settings -> Integrations -> Private/Legacy Apps -> "Shopify Sync Middleware" -> Auth tab>

RESEND_API_KEY=<resend.com -> API keys>
ALERT_EMAIL_TO=crm@trooinbound.com
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**Warning:** the Shopify store's real API domain is `s1wn3s-ni.myshopify.com`
— NOT `difiabapro.myshopify.com`, which is just a connected custom domain.
Using the wrong one breaks everything downstream. Confirm this by logging
into the Shopify store admin and checking Settings → Domains.

## Step 3 — Verify the Shopify app is correctly set up

1. Log into **dev.shopify.com** with the Partner Dashboard login
2. Open the app called **"Sync Middleware - Difiaba"**
3. Go to **Versions** → check the active version shows:
   - Scopes: `read_companies, read_customers, read_metaobjects, read_orders, read_products`
   - App URL: `https://affected-rare-sandal.ngrok-free.dev`
   - Redirect URL: `https://affected-rare-sandal.ngrok-free.dev/oauth/callback`
4. If the Admin API access token in your `.env` doesn't work (test in Step
   6 below), you need to redo the OAuth exchange — see **Step 8**.

## Step 4 — Verify the Shopify webhooks

1. Log into the Shopify store admin (`admin.shopify.com/store/difiabapro`)
2. Go to **Settings → Notifications → Webhooks**
3. You should see 6 webhooks listed there (Product creation/update, Order
   creation/update, Customer creation/update), all pointing to
   `https://affected-rare-sandal.ngrok-free.dev/...`
4. The other 2 (Company creation/update) do NOT show on this page — they
   were registered via the API directly. Don't worry if you don't see them
   here, that's expected (see Part B, Section on Shopify setup, for why).

## Step 5 — Verify the HubSpot app

1. Log into HubSpot (`app.hubspot.com`)
2. Go to **Settings → Integrations → Private Apps** (or **Legacy Apps** if
   redirected there)
3. Open **"Shopify Sync Middleware"**
4. Go to the **Scopes** tab, confirm all 10 scopes are checked (5 objects ×
   read+write: Contacts, Companies, Orders, Products, Line Items)
5. Go to the **Auth** tab, confirm there's an Access Token — this should
   match what's in your `.env`

## Step 6 — Start everything and confirm it's alive

**Terminal 1:**
```bash
cd c:\shopify-hubspot-middleware
npm test
```
All tests should pass (171 at time of writing). If not, stop here and
investigate before continuing.

```bash
npm run dev
```
Wait for a log line saying `"msg":"Middleware server listening"`.

**Terminal 2 (separate window, leave Terminal 1 running):**
```bash
ngrok http 3000 --url=affected-rare-sandal.ngrok-free.dev
```
Wait for `"Session Status: online"`.

**Verify both connections work:**
```bash
node scripts/check-shopify-connection.js
node scripts/check-hubspot-connection.js
```
Both should print success messages with no errors.

## Step 7 — Do a live test

1. Go to the Shopify store admin
2. Edit any product (change the title slightly) and save
3. Watch Terminal 1 — you should see:
   ```
   "msg":"Webhook received - verified and accepted for processing"
   "msg":"Product webhook processed successfully"
   ```
4. Go to HubSpot → Products → search for that product → confirm the
   change shows up there

If this works, the whole pipeline is confirmed healthy. If it doesn't, see
Part B's "Real bugs found" section — several similar issues have already
been hit and fixed, the fix might already cover your situation.

## Step 8 — (Only if needed) Re-do the Shopify OAuth token exchange

Only do this if Step 3/6 shows the token is invalid or missing a scope.

1. Stop ngrok (Ctrl+C in Terminal 2)
2. Start it again pointing to port 3001 instead of 3000:
   ```bash
   ngrok http 3001 --url=affected-rare-sandal.ngrok-free.dev
   ```
3. In Terminal 1 (stop `npm run dev` first, or open a 3rd terminal), run:
   ```bash
   node scripts/oauth-get-token.js --shop=s1wn3s-ni.myshopify.com --redirect-uri=https://affected-rare-sandal.ngrok-free.dev/oauth/callback --port=3001 --scopes=read_companies,read_customers,read_metaobjects,read_orders,read_products
   ```
4. It prints a URL — open it in your browser, approve the permissions
5. The script prints a new access token — copy it into `.env` as
   `SHOPIFY_B2B_ACCESS_TOKEN` (it may be identical to the old one if only
   scopes changed, not the token itself)
6. Stop ngrok, restart it back on port 3000, restart `npm run dev`

---

# PART B — BACKGROUND / REFERENCE (read once Part A is done)

## Project Overview

**What it is:** A custom Node.js middleware connecting the client's
**Shopify Plus B2B store** to their **HubSpot CRM**, syncing Customers,
Companies, Products, Orders, and Line Items automatically and in real time
via webhooks.

**Client:** Difiaba Professional (hair care/salon products, B2B).

**Why custom middleware, not native sync:** the client's HubSpot plan
doesn't support custom field mapping for Shopify metafields via the native
integration, and native sync has no reliable duplicate-prevention across
two Shopify stores.

**Current phase:** Phase 1 — US B2B only, live/ongoing sync. **No
historical migration** — client explicitly confirmed sync-only, going
forward, not a backfill of old data.

**Language/stack:** Plain JavaScript (no TypeScript), Node.js, ES Modules,
Express, Vitest for testing, pino for logging, zod for env validation.

## Shopify app — exact configuration

**App name:** Sync Middleware - Difiaba, created via Dev Dashboard (NOT the
old legacy "Create app" flow — Shopify is phasing that out). Custom
distribution, installed on `s1wn3s-ni.myshopify.com`, not embedded.

**Webhooks registered (8 total):**

| Event | URL | How registered |
|---|---|---|
| Product creation/update | `/webhooks/shopify/products` | Notifications page |
| Order creation/update | `/webhooks/shopify/orders` | Notifications page |
| Customer creation/update | `/webhooks/shopify/customers` | Notifications page |
| Company creation/update | `/webhooks/shopify/companies` | **GraphQL API only** — not available on the Notifications page at all |

**Important:** Company webhooks are signed with the app's **Client Secret**
(`SHOPIFY_B2B_APP_CLIENT_SECRET`), NOT the store-wide webhook secret shown
on the Notifications page. Mixing these up causes every Company webhook to
fail with a 401.

## HubSpot properties created

**Contacts (11):** Shopify Customer ID, Shopify Store, Preferred Language
(dropdown), Is Main Company Contact, Total Orders, Last Order Date, Revenue
× 5 currencies (USD/EUR/MXN/GTQ/CRC, never combined).

**Companies (9):** Shopify Company ID, Shopify Store, Shopify Locations,
Shopify Location Count, Total Orders, Last Order Date, Revenue × 5
currencies.

**Orders (8):** Shopify Store ID, Shopify Order ID, Original Currency,
B2B/B2C Channel, Market, Financial Status, Fulfillment Status, Cancelled.

**Line Items (2):** Shopify Line Item ID, Shopify Variant ID.

**Products (~40+, growing dynamically):** Product ID, Variant ID, Product
Category, Brand, plus ~35 metafield-derived properties — see
`src/config/productMetafields.js` for the known list, but sync is fully
**dynamic**, not limited to a fixed list (see Architecture section below).

**Full field mapping tables:** `docs/field-mapping.md`.

**Known duplicate properties (left alone deliberately — client said "no
changes, only additions"):** 3 properties labeled "Technical Family" on
Products (`family` = pre-existing before this project, source unknown;
`shopify_metafield_technical_family` = a test leftover; `shopify_technical_family`
= the correct one the code writes to). Do not touch these without explicit
client sign-off.

## Error Alerting (email failure notifications)

**What it does:** if any webhook fails, an email alert is sent
automatically (in addition to logging), so failures are caught immediately.

**Why email, not Slack:** client chose Email when offered the choice.

**Why Resend:** automated email sending needs a dedicated API, not a
regular inbox (Gmail etc. often silently block automated sends). Resend is
built for exactly this.

**Code:** `src/utils/emailAlert.js` (`sendFailureAlert`), called from every
error handler in `src/middleware/webhookRouter.js`. Deliberately simple —
one email per failure, no batching, no persistent retry queue. If Resend
itself fails, the error is logged but never blocks the webhook processing
it's reporting on.

**Current setup:** sending from Resend's shared sandbox address
(`onboarding@resend.dev`) to `crm@trooinbound.com`.

**Known issue, not yet fixed:** test emails from the shared sender didn't
show up in the recipient's inbox OR spam folder, despite Resend's dashboard
confirming "Delivered" — likely a Google Workspace admin-level security
filter for unverified senders. **Recommended fix:** verify `trooinbound.com`
as a custom domain in Resend (Domains → Add Domain → add the DNS records),
so alerts send from `alerts@trooinbound.com` instead.

## What's proven working LIVE (verified against the real client store/portal)

- **Customer sync** — confirmed
- **Product sync** — confirmed, including full dynamic metafield handling (text, rich text, references resolved to readable labels, app-injected fields like Loox/Google Shopping/Facebook)
- **Company Locations** — confirmed, works for 1 or many locations
- **Email failure alerts** — confirmed delivered (see deliverability caveat above)

## NOT yet tested live

- **Order sync** — built, unit-tested, not yet confirmed on the real store
- **Company sync** — same

## Real bugs found via live testing — all fixed

1. **Webhook ID vs GraphQL ID mismatch.** Webhooks give plain numeric IDs;
   GraphQL gives `gid://shopify/...`. Fixed via `src/utils/shopifyGid.js`.

2. **Duplicate Products from the native integration.** Native-created
   Products have NO Shopify reference fields at all. Fixed by also matching
   on SKU as a fallback (`src/sync/findExistingProduct.js`) — found via a
   real live `"Cannot set hs_sku ... already has that value"` error.

3. **Race-condition duplicates.** Two webhooks arriving ~1 second apart
   could both create a record before either finished. Fixed via
   `src/middleware/concurrencyLock.js`.

4. **`hs_external_id` on Line Items silently discards writes.** Confirmed
   via testing. Switched to a custom `shopify_line_item_id` property.

5. **Metaobject-reference metafields needed the `read_metaobjects` scope**,
   not originally requested. Found live (references resolved to `null`
   with no error). Added the scope, re-authorized.

6. **Metaobject label vs internal GID leaking together.** Fixed to prefer
   just the human-readable `label` field (`src/utils/metafieldMapping.js`).

## Architecture decisions worth understanding before changing anything

- **Shopify scopes are read-only** — the middleware never writes back to
  Shopify, only reads and writes to HubSpot.
- **Dev Dashboard apps don't show the Admin API token in the UI.** Getting
  one requires the OAuth exchange in Step 8 above.
- **Metafield sync is fully dynamic** — `src/utils/metafieldMapping.js`
  classifies and converts any metafield by its own `type` at sync time. New
  app-injected metafields don't need a code change, just a one-time HubSpot
  property creation (logged as "skipped, property doesn't exist yet" until
  then).
- **The Deal-vs-Order decision flipped twice** during this project. The
  Deal-based code (`src/mappings/deal.js`, `src/sync/migrateDeals.js`) is
  still in the codebase, unused but kept in case this changes again.
- **`docs/object-matching-rules.md`** is the source of truth for every
  matching/duplicate-prevention rule — read it before changing matching
  logic.

## Current open items / next steps

1. **Order live test** — not done, no blocker
2. **Company live test** — not done, no blocker
3. **Permanent server hosting** — still local + ngrok; needs AWS EC2, Render, or Railway before production go-live
4. **Native Shopify-HubSpot integration disconnect** — client hasn't approved yet; confirmed the middleware works correctly either way, this is a "cleaner going forward" step, not a functional requirement
5. **2 remaining SOW test scenarios** — cancelled/refunded order, repeat customer
6. **Formal retry/dead-letter queue** — not built; only automatic retry for temporary failures + the new email alerting exist today

## Other reference docs in this repo

- `docs/object-matching-rules.md` — full duplicate-prevention rules and reasoning
- `docs/field-mapping.md` — full Shopify → HubSpot field mapping tables
- `docs/client-handoff-hubspot-properties.md` — property checklist as prepared for the client
- `docs/handoff-to-colleague.md` — an earlier, shorter handoff doc (superseded by this one)
