# Client hand-off: HubSpot properties checklist

Give this to whoever has admin access to the client's real HubSpot portal.
These custom properties must exist before the middleware can write to each
object. The middleware safely skips (never errors) any property that
doesn't exist yet, so these can be created in any order — but nothing will
sync fully until they're all in place.

**Before starting**: check **Settings → Account Management → Account Defaults**
or the Properties page for a "X out of Y custom properties used" banner. We
hit a 10-property limit on our own test portal partway through — if the
client's real portal has a similar cap, some of these may need to be
prioritized or the plan may need reviewing first.

For every property below: go to **Settings → Properties → Data Management →
Properties**, switch the "Select an object" dropdown to the object listed,
click **Create property**, and use **Single-line text** as the field type
unless noted otherwise.

## Contacts

| Label | Notes |
|---|---|
| Shopify Customer ID | |
| Shopify Store | |
| Preferred Language | Check first — HubSpot or another app may already have a "Preferred Language" property; don't create a duplicate |
| Is Main Company Contact | |
| Total Orders | |
| Last Order Date | Field type: **Date picker** |
| Revenue (USD) | Field type: **Number** |
| Revenue (EUR) | Field type: **Number** |
| Revenue (MXN) | Field type: **Number** |
| Revenue (GTQ) | Field type: **Number** |
| Revenue (CRC) | Field type: **Number** |

## Companies

| Label | Notes |
|---|---|
| Shopify Company ID | |
| Shopify Store | |
| Total Orders | |
| Last Order Date | Field type: **Date picker** |
| Revenue (USD) | Field type: **Number** |
| Revenue (EUR) | Field type: **Number** |
| Revenue (MXN) | Field type: **Number** |
| Revenue (GTQ) | Field type: **Number** |
| Revenue (CRC) | Field type: **Number** |

## Products

| Label | Notes |
|---|---|
| Shopify Product ID | |
| Shopify Variant ID | |
| SKU | Check first — HubSpot's native `hs_sku` / "SKU" field already exists on Products by default, don't duplicate |
| Product Category | **Pending client confirmation of the actual Shopify metafield name** — do not create until confirmed, see docs/metafield-mapping.md |
| Brand | Same as above — pending confirmation |
| Product Family | Same as above — pending confirmation |

## Orders — NOT USED for this client, see Deals below

The client's real HubSpot portal does not expose the Orders object
(confirmed live via the Objects settings search - "Orders" returned no
results). Per section 12 of the SOW, **Deals are used instead** — see the
Deals section below. This Orders section is left here only because the
sandbox testing environment used it; do not create these properties in the
real client portal.

## Deals

| Label | Notes |
|---|---|
| Shopify Store ID | |
| Shopify Order ID | Together with Shopify Store ID, this is the unique key — the same order number from two different stores must never be treated as the same Deal |
| Original Currency | |
| B2B/B2C Channel | |
| Market | Phase 1: static value "United States" for the B2B store, written automatically — no client input needed for Phase 1 |
| Financial Status | Intentionally a custom field, not a HubSpot native one — see docs/field-mapping.md for why |
| Fulfillment Status | Same reasoning as above |
| Cancelled | Field type: single-line text (stores "true"/"false") |

Deal Name, Amount, and Deal Currency use HubSpot's own native Deal fields
(no custom property needed) — just confirm the portal's multi-currency
setting is enabled if orders in more than one currency are expected later.

**Not set by the middleware:** Deal Stage and Pipeline. These are left for
the client's own sales process — the middleware never guesses which stage a
synced order should land in. If a specific stage/pipeline is required for
these to show up in the right place, let us know which one to use.

## Line Items

| Label | Notes |
|---|---|
| Shopify Line Item ID | Intentionally a custom field, not HubSpot's native "External line item id" (`hs_external_id`) — that field silently discards API writes, confirmed via testing. See docs/object-matching-rules.md. |

## What to hand back to us

- Confirmation that all properties above are created (or which ones aren't, and why)
- The exact real Shopify metafield namespace/key for Product Category, Brand, and Product Family (needed before those three properties can go live)
- Confirmed Market values, if applicable
- Confirmation of the custom property limit on this portal (in case it needs to be addressed before Phase 2/3)
