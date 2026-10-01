# Language mapping

See `src/config/languages.js`.

HubSpot "Preferred Language" values the client supports: `English`, `Spanish`,
`French`, `Italian`.

`LOCALE_TO_HUBSPOT_LANGUAGE` maps a Shopify locale (IETF language tag, e.g.
`customer.locale`) to one of those four values. The mapping is intentionally
explicit rather than derived (e.g. by naively taking the first two letters of
the locale) so an unexpected locale fails loudly/logs a skip instead of
silently guessing a language.

`resolvePreferredLanguage()` tries an exact locale match first (`es-MX`), then
falls back to the base language subtag (`es`), and returns `undefined` -
never a guess - if nothing matches. Callers must decide how to handle
`undefined` (currently: the property is simply omitted from the write).

## Adding a new locale

Add it to `LOCALE_TO_HUBSPOT_LANGUAGE` in `src/config/languages.js`, mapping
to one of the four confirmed `HUBSPOT_PREFERRED_LANGUAGES` values. Do not add
a fifth language value without confirming HubSpot's actual property options
first - the property is a fixed dropdown, not free text.
