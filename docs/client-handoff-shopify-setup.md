# Client hand-off: Shopify setup steps

Give this to whoever has admin access to the client's real B2B Shopify Plus
store. These are the exact steps to create the credentials the middleware
needs.

## 1. Create a custom app

1. Shopify Admin → **Settings → Apps and sales channels → Develop apps**
2. If prompted, click **"Allow custom app development"**
3. Click **Create an app**
4. Name it (e.g., `HubSpot Middleware` or match the existing naming convention)

## 2. Configure Admin API scopes

1. Open the app → **Configuration** tab → next to "Admin API integration" click **Configure**
2. Enable these scopes:
   - `read_products`
   - `read_customers`
   - `read_orders`
   - `read_companies`
   - (Metafield access is included automatically with `read_products` — no separate scope needed)
3. Save

## 3. Install the app and get the token

1. **API credentials** tab → **Install app** → confirm
2. Under "Admin API access token", click **Reveal token once**
3. **Copy it immediately** — Shopify only shows it once. Store it securely (password manager or secrets vault) — never in a chat message, email, or committed file.

## 4. Request Protected Customer Data access

This is the step that was blocked on our dev store and must be checked here:

1. Same app → **Configuration** tab → **Protected customer data access** section
2. Click **Request access** (if this instead shows "Upgrade plan," the store's plan doesn't qualify — flag this immediately, since it would block Customer/Company sync the same way it did in our testing)
3. Fill in the usage justification (e.g., "Internal integration syncing customer records from Shopify to HubSpot CRM for sales/marketing use")
4. Submit — for a custom app on a Plus-tier store, this is typically fast (often near-instant)

## 5. Set up webhooks (once the middleware is deployed to a public URL)

Register these webhook subscriptions, pointing at `https://<production-host>/webhooks/shopify/<topic>`:
- Product update → `/webhooks/shopify/products`
- Order creation → `/webhooks/shopify/orders`
- (Customer creation/update once that path is built out further)

Use the **signing secret** shown on the Notifications → Webhooks page (or the app's own signing secret) as the `SHOPIFY_B2B_WEBHOOK_SECRET` environment variable.

## What to hand back to us

- The Admin API access token (via a secure channel — password manager share link, not chat/email)
- The store domain (e.g., `client-store.myshopify.com`)
- Confirmation that Protected Customer Data access was granted (or the exact message shown if it wasn't)
