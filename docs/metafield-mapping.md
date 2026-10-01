# Metafield mapping

See `src/config/productMetafields.js`.

The middleware does **not** sync every Shopify metafield - only the ones
explicitly listed in `PRODUCT_METAFIELD_MAPPINGS`, and only once each entry's
`confirmed` flag is set to `true`.

## Current status: nothing confirmed yet

Every entry is currently `confirmed: false`. The `namespace`/`key`/
`hubspotProperty` values present are **placeholders** based on the client's
stated field names (Product Category, Brand, Product Family) - they have not
been verified against the actual store's metafield definitions.

Running `npm run poc:product-sync` logs every metafield actually observed on
the fetched product (`observedMetafields`) - use that output to confirm the
real namespace/key with the client, then:

1. Update the matching entry in `PRODUCT_METAFIELD_MAPPINGS` with the real
   `namespace`/`key`.
2. Confirm the `hubspotProperty` internal name exists on the HubSpot Product
   object (`src/hubspot/properties.js` / the property's `Fill Rate` view in
   HubSpot).
3. Only then set `confirmed: true`.

On the in-house test store, the only metafields observed were from the
`judgeme` review-widget app (`badge`, `widget`, `review_widget_data`) - not
commerce categorization fields. This does not confirm or deny whether the
client's real catalog has category/brand/family metafields; it only tells us
this specific test product doesn't.

## Adding a new metafield mapping

Add a new object to `PRODUCT_METAFIELD_MAPPINGS` with `confirmed: false` first,
verify it end-to-end via the PoC script, then flip it to `true`. Never mark an
entry confirmed without having seen the real namespace/key on an actual
product and having a matching HubSpot property already created.
