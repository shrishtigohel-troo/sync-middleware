# Field mapping (live, current state)

This is the up-to-date source of truth for exactly which Shopify fields sync
to which HubSpot properties **right now**, for the client's real B2B store.
Use this for testing, if what you see in HubSpot doesn't match a row below,
that's a bug, report it.

The mapping code (`src/mappings/*.js`) never assumes a property exists. It
checks the live property list before writing anything, and logs (never
fails) whenever a desired property is missing from the portal.

## HubSpot source-of-truth rule

Shopify is the source of truth for commerce data. HubSpot remains the owner
of CRM/sales fields (owner, lifecycle stage, lead status, notes, activities,
segmentation). The middleware never writes those fields.

---

## Contacts (Shopify Customer → HubSpot Contact)

Matched by **email** (never any other key).

| Shopify field | HubSpot property |
|---|---|
| `email` | `email` (native) |
| `firstName` | `firstname` (native) |
| `lastName` | `lastname` (native) |
| `phone` | `phone` (native) |
| Shopify Customer ID | `shopify_customer_id` |
| Store (`b2b`) | `shopify_store` |
| `locale` | `preferred_language` |
| Is main contact of a B2B company | `shopify_is_main_contact` — only set via the periodic `migrateCompanies` script, not the live webhook |
| Purchase history (calculated) | `shopify_total_orders`, `shopify_last_order_date`, `shopify_revenue_usd`/`_eur`/`_mxn`/`_gtq`/`_crc` — one property per currency, never summed together |

---

## Companies (Shopify Company Location → HubSpot Company)

**Important, this is not one-record-per-company.** Each Shopify Company
**Location** gets its own separate HubSpot Company record, named
`"<Company Name> (<Location Name>)"`. A Shopify Company with 3 locations
produces 3 separate HubSpot Company records.

Matched by **`shopify_location_id`** (globally unique per location, this is
the only reliable key since `shopify_company_id` is shared across every one
of a company's location-records).

| Shopify field | HubSpot property |
|---|---|
| `"<company.name> (<location.name>)"` | `name` (native) |
| Company `note` | `description` (native) — only set on the `companies/create`/`companies/update` path, not on `company_locations/*` |
| Shopify Company ID | `shopify_company_id` |
| Shopify Location ID | `shopify_location_id` — **the matching key** |
| Store (`b2b`) | `shopify_store` |

**Contacts on a company** (the people, not the location records) are
associated to **every one** of that company's location-records, since a
contact isn't tied to a specific location in our data model. This only
happens via the periodic `migrateCompanies` script, not automatically on the
live webhook path.

**Legacy properties, no longer written**: `shopify_locations` (joined list of
names) and `shopify_location_count` exist in the HubSpot portal from an
earlier version of this feature, but the current live code does not write to
them. Safe to ignore.

---

## Products (per Shopify variant → HubSpot Product)

Each Shopify product variant becomes its own HubSpot Product record.
Matched by Shopify Variant ID, falling back to SKU (to converge with records
the native Shopify-HubSpot integration may have already created).

| Shopify field | HubSpot property |
|---|---|
| Product title (+ variant title, if >1 variant) | `name` (native) |
| Description (HTML stripped) | `description` (native) |
| Variant price | `price` (native) |
| Variant SKU | `hs_sku` (native) |
| Storefront URL | `hs_url` (native) |
| Featured image | `hs_images` (native) |
| Shopify Product ID | `shopify_product_id` |
| Shopify Variant ID | `shopify_variant_id` |
| Vendor | `shopify_brand` |
| Shopify's built-in Category taxonomy | `shopify_product_category` |
| Native Shopify **Tags** (all tags, comma-joined) | `shopify_tags` |
| Native Shopify **Collections** (all collections the product belongs to, comma-joined) | `shopify_collections` — distinct from the "Collection" metafield below |

### Metafields (fully dynamic)

Every metafield a product actually has gets synced automatically, this is
not a fixed list. The property name is derived from the metafield's own
namespace/key, except for the ~30 originally curated metafields (Category,
Technical Family, Collection, etc.) which keep their original property
names for backward compatibility, see `src/utils/metafieldMapping.js`.

Handles: plain text, rich text (HTML stripped), ratings, lists, and
reference-type metafields (metaobject/product/file references, resolved to
a human-readable label, e.g. "Rinse-out" not a raw ID).

---

## Orders (Shopify Order → HubSpot Order)

**Live, this is the Orders object, not Deals** (confirmed available on this
portal). Matched by the compound key Shopify Store ID + Shopify Order ID
(also checks HubSpot's own native reference fields, to converge with
anything the native Shopify integration already created).

| Shopify field | HubSpot property |
|---|---|
| Order name | `hs_order_name` (native) |
| Currency | `hs_currency_code` (native) + `shopify_original_currency` |
| Total price | `hs_total_price` (native) |
| Store ID | `shopify_store_id` |
| Shopify Order ID | `shopify_order_id` |
| Channel (`b2b`) | `shopify_channel` |
| Financial status | `shopify_financial_status` — custom field, deliberately not HubSpot's native payment-status field (that one is still being written by the native integration; using it too would cause a conflict) |
| Fulfillment status | `shopify_fulfillment_status` — same reasoning |
| Cancelled (present/absent) | `shopify_cancelled` (`"true"`/`"false"`) — a cancelled order still syncs, never dropped |
| Pipeline Stage | `hs_pipeline_stage` (native) — automatically derived from Shopify's own order status: Cancelled → **Cancelled**, fulfilled → **Delivered**, paid but not yet fulfilled → **Processed**, otherwise → **Open**. See `src/config/orderPipeline.js`. |

**Associations (live):**
- **Order → Contact**: matched by the order's customer email.
- **Order → Company**: matched by the specific Company **Location** the order was placed under (`shopify_location_id`), not the company as a whole, since a company can have several HubSpot records. If the order's company location doesn't have a HubSpot record yet (e.g. the company hasn't been re-synced since the location model was introduced), no association is made, this is data staleness, not a code bug — resaving the company in Shopify fixes it.
- **Order → Line Items**: every product in the order becomes its own Line Item record, associated back to that Order. An order with 5 products shows 5 associated Line Item records (HubSpot's UI displays this as "5 records" in the list view, or the single item's name if there's only 1).

## Line Items (per Shopify order line → HubSpot Line Item)

| Shopify field | HubSpot property |
|---|---|
| Title | `name` (native) |
| Quantity | `quantity` (native) |
| Unit price | `price` (native) |
| Discounted total | `amount` (native) |
| SKU | `hs_sku` (native) |
| Variant ID | `shopify_variant_id` |
| Shopify Line Item ID | `shopify_line_item_id` — custom field, **not** HubSpot's native "External line item id", that field silently discards API writes (confirmed via testing) |

---

## What's confirmed working live (tested with real Shopify changes, not just code review)

- ✅ Products (including Tags, Collections, and dynamic metafields)
- ✅ Customers
- ✅ Companies (per-location model, single and multiple locations)
- ✅ Orders (create/update, line items, Contact association)
- ✅ Order → Company association (fixed and confirmed working for companies re-synced after the per-location rebuild; **older, un-refreshed company records will not have an association** until they're resaved once)

## Not yet tested live

- Cancelled/refunded order scenario
- Repeat customer scenario (multiple orders, same customer)
- Live Contact ↔ Company association (only runs via the manual `migrateCompanies` script, not the live webhook)
