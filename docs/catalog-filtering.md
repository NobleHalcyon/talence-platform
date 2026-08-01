# Catalog and collection filtering

Date: 2026-08-01

## Architecture

Catalog and collection inventory use the same `FilterGroup` / `FilterRule` tree from `apps/web/features/filters/model.ts`. Normal controls produce a root AND group. Logic mode adds OR groups and explicit rule/group negation, with two nested group levels. The validator bounds IDs, text, arrays, children, depth, and serialized URL size before the tree reaches a database RPC.

The complete tree is encoded in the `filters` URL parameter. Search, scope, sort, cursor, result view, and responsive page size remain separate parameters. Legacy catalog and collection parameters are translated into the shared model where reasonable; retired price-availability and currency filter parameters are ignored and are never emitted.

The browser does not filter the complete catalog. `catalog_filter_search` and `collection_inventory_filter_page` validate and evaluate the tree inside PostgreSQL. Values are passed as JSON data and are never concatenated into raw SQL.

Repeated quick-filter selections update pills immediately and debounce into one server navigation. This keeps a multi-select open, avoids overlapping catalog scans, and preserves a single stable URL/history entry for the completed selection burst.

## Database and ingestion

Additive migrations normalize:

- Oracle and face `supertypes`, `card_types`, and `subtypes`;
- face `power_numeric`, `toughness_numeric`, and `loyalty_numeric` while preserving raw text;
- distinct printing/face `artists`;
- existing canonical keywords and legalities for indexed filtering.

The catalog worker performs the same normalization on network-free fixtures. Database derivation triggers keep promoted rows and additive backfills consistent. GIN, trigram, and numeric indexes cover justified array, artist-search, and range paths.

Direct positive printing facets are extracted as typed values and used to materialize an indexed candidate set before the recursive logic evaluator runs. The complete filter tree is still evaluated against every candidate, so this optimization cannot weaken AND/OR/NOT semantics. Price-floor responses use the documented `{ cards: ... }` envelope.

`catalog_filter_facets` supplies bounded, searchable catalog-derived options for sets, languages, types, subtypes, artists, keywords, formats, rarities, and finishes. Set and mana SVGs are fetched only by same-origin Talence routes from allowlisted Scryfall SVG hosts, cached for 30 days by the framework/upstream response policy, checked for bounded SVG content, and given a Talence fallback where appropriate. No browser hotlinks an option asset indefinitely.

## Matching semantics

Oracle-level fields are colors, identity, normalized types, mana value, P/T/L, keywords, rules text, and legalities. Printing-level fields are set, language, rarity, finish, artist, and release date. Printing-level rules select eligible printings before Oracle representative ranking, so a displayed representative satisfies every active printing rule.

Multi-face type arrays are the union of normalized face values at Oracle level. Each P/T/L rule matches when at least one face satisfies that rule; separate rules may be satisfied by different faces. Numeric projections accept negative, fractional, and unusually high values. `*`, `X`, and expressions remain nonnumeric and are included only when an active P/T/L rule explicitly enables `includeVariable`.

One legality rule requires every selected format to have the selected legality state. More complex combinations use separate rules in logic mode.

Collection filtering runs against owned balance rows. Catalog fields describe the owned printing/card, while finish, condition, and owned quantity use the balance identity and quantity. Ownership semantics and all inventory mutation functions are unchanged.

## UI contract

- Search remains primary.
- Quick popovers expose color identity, card type, set, rarity, and mana value.
- Active rules remain synchronized and appear as removable chips.
- The Advanced Filters count includes active scope controls.
- Desktop uses a 37 rem side panel; mobile uses a full-viewport sheet.
- Sections collapse independently and footer actions remain sticky.
- Sort stays beside result view controls.
- Searchable multi-selects remain open for repeated selection, cap rendered options, and support arrow keys, Enter/Space, Escape, visible focus, accessible labels, and non-color-only selection states.
- CSP continues to require nonces for inline scripts and explicitly permits same-origin external Next.js script elements so filter URL navigation is not blocked by a nonce generated for a later route request.

## Public application RPCs and routes

- `catalog_filter_search`
- `catalog_filter_price_floors`
- `catalog_filter_facets`
- `collection_inventory_filter_page`
- `collection_filter_analytics`
- `GET /api/catalog/facets`
- `GET /api/catalog/assets/set/[code]`
- `GET /api/catalog/assets/mana/[symbol]`

All remain admitted-user-only through existing authentication/RLS assertions. Device `/api/v1` contracts are unchanged.

## Known limits

- Logic mode intentionally has no raw Scryfall query language.
- No saved searches, presets, price ranges, flavor-text filtering, or artist-image browsing are included.
- Slider tracks use practical visual bounds, while their numeric inputs accept values outside those bounds.
