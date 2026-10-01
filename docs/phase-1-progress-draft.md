# Phase 1 Progress Update — Shopify → HubSpot Integration (US B2B)

Draft date: 2026-09-14

## Summary

Development and testing for Phase 1 is complete on our end. Everything that
does not require real client credentials or client-provided data has been
built, tested, and verified against a live Shopify store. We're now waiting
on client-side access to move from our test environment into their actual
Shopify and HubSpot accounts.

## What's been completed

**Products**
- Reads products and variants from Shopify and creates/updates the matching HubSpot records
- Duplicate-prevention verified: re-syncing the same product updates it instead of creating a copy
- Full historical sync tested end-to-end against real store data
- Real-time sync (webhook) tested live — editing a product in Shopify updates HubSpot within seconds

**Orders & Line Items**
- Matches orders using a compound key (store + order number) so the same order number from two different stores is never confused — this was validated against real duplicate order numbers found in testing
- Automatically recognizes orders already created by the existing native Shopify-HubSpot integration, avoiding duplicate records between the two systems
- Preserves the original order currency and amount exactly, with no conversion
- Full historical sync tested: 12 orders and 13 line items processed with zero failures
- Real-time sync (webhook) tested live — a real order placed through checkout synced into HubSpot automatically, including its line item

**Duplicate prevention (core requirement)**
- Contacts matched by email only
- Companies matched by Shopify Company ID only (never by name)
- Products matched by Shopify Product/Variant ID
- Orders matched by Store ID + Order ID together
- Line items matched by a dedicated tracking field
- All rules are enforced in code and covered by 99 automated tests

**Company-to-contact linking & revenue reporting**
- Logic built and tested for linking B2B company contacts and flagging the main contact
- Logic built and tested for revenue/order-history rollups (kept separate per currency, never combined)
- Both are ready to run against real data as soon as customer data access is available (see Blockers)

**Safety & reliability**
- Never overwrites HubSpot-owned CRM fields (owner, lifecycle stage, lead status, etc.)
- Never logs credentials or raw customer data
- Automatic retry on temporary failures; one failed record never stops a full sync run
- All webhook deliveries verified for authenticity and protected against duplicate processing

**Documentation**
- Full field-mapping, duplicate-prevention rules, and setup guides written
- Client hand-off checklists prepared for both Shopify app setup and HubSpot property creation

## Two real issues found and fixed during testing

1. A duplicate-order bug: the middleware would have created a second HubSpot record for orders the existing native integration had already synced. Fixed and verified.
2. A HubSpot platform quirk: a built-in field meant for exactly our use case was found to silently discard data written to it via the API. Worked around with a dedicated field instead.

Both are now covered by automated tests so they can't silently reappear.

## Blocked — waiting on client, not a development gap

| Item | What's needed |
|---|---|
| Customer sync, Company sync, order-to-contact linking, live revenue rollups | Real Shopify credentials + confirmation that Protected Customer Data access is enabled on the client's store |
| Product Category / Brand / Product Family sync | Client to confirm the exact Shopify metafield names in use |
| Legal Entity / Market values | Client to provide |
| Real environment setup | Client's HubSpot portal access + the ~28 custom properties created (checklist ready to send) |

## Next step

Once the client provides real Shopify + HubSpot access, the remaining work
is verification and a live data run — not new development. Estimated at
1–2 days of work once credentials are in hand.
