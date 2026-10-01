# Association mapping

See `src/hubspot/associations.js`.

## Why associations are looked up, not hardcoded

HubSpot assigns numeric `associationTypeId` values per object-pair, and these
can differ between portals/objects. Rather than hardcoding a guessed ID
(which would silently create the wrong association, or fail, if guessed
wrong), `getDefaultAssociationType(fromObjectType, toObjectType)` calls
HubSpot's `GET /crm/v4/associations/{from}/{to}/labels` endpoint and picks the
`HUBSPOT_DEFINED`, unlabeled entry - the plain default association HubSpot
itself defines for that pair. If no default exists yet for a given pair, the
function returns `undefined` and callers must skip the association (logging
why) rather than invent a type ID.

## Associations used by this middleware

| From | To | Used by |
|---|---|---|
| `line_items` | `orders` | `scripts/poc-order-sync.js` - every synced line item is associated to its order |
| `orders` | `companies` | `scripts/poc-order-sync.js` - only when the order has a B2B purchasing company AND that company already exists in HubSpot (matched by `shopify_company_id`) |
| `orders` | `contacts` | **Not implemented yet** - requires resolving the order's customer email, which needs Shopify's Protected Customer Data approval (see `docs/object-matching-rules.md`) |
| `companies` | `contacts` | `src/sync/associateCompanyContacts.js` - associates every company contact matched by email; the main contact is flagged via the `shopify_is_main_contact` custom property (not a HubSpot native "primary company" mechanic - see below). Blocked from live testing by the same Protected Customer Data approval. |
| `line_items` | `products` | **Not implemented yet** - would associate each line item to the matching HubSpot Product (by `shopify_variant_id`) |

## Why a custom property instead of HubSpot's "primary company" concept

HubSpot has an internal notion of a contact's primary company association,
but its exact API mechanics were not confirmed at the time this was built.
Rather than guess at an undocumented behavior, `shopify_is_main_contact` is
a plain boolean-style custom property set directly on the Contact - simple,
explicit, and doesn't risk silently relying on the wrong association
semantics.

## Idempotency

HubSpot's v4 association PUT/batch-create endpoints upsert rather than
duplicate when called repeatedly with the same object pair and association
type - safe to re-run without producing duplicate associations.
