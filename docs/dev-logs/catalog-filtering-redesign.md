# Catalog and collection filtering redesign

Date: 2026-08-01

Branch: `filter-updates`

Starting checkpoint: `86519f8 feat: redesign catalog browsing and application navigation`

## Existing architecture discovered

- Catalog and collection controls previously parsed separate ad hoc URL parameters and called separate query contracts.
- Catalog Oracle mode already filtered eligible printings before representative ranking for the old fields and defaulted to one physical English representative.
- The database already stored set metadata/SVG URIs, language, colors, color identity, combined type lines, mana value, raw face P/T/L, legalities, artist text, keywords, rules text, rarity, finishes, and release dates.
- Missing query-ready projections were normalized types, numeric P/T/L, distinct multi-face artists, one shared filter tree/compiler, and bounded option/asset routes.
- Scryfall set icons were referenced directly and no shared selector asset cache existed.

## Implementation

- Added shared model validation, URL serialization, AND/OR/NOT evaluation, legacy translation, synchronized quick/advanced controls, active chips, range controls, logic editing, and catalog/collection integration.
- Added normalized schema/backfills/triggers/indexes and catalog, facet, price-floor, collection-page, and collection-analytics functions in migrations `20260801020000` through `20260801020800`.
- Corrected colorless evaluation, all-format legality matching, default-query fast path, stable filtered keyset pagination, and printing-level representative selection.
- Materialized indexed printing candidates before recursive rule evaluation, restored the documented price-floor response envelope, and debounced repeated quick-filter selections into one server navigation. A representative two-set Oracle query dropped from the local statement timeout to approximately 0.8 seconds.
- Added bounded facet API plus allowlisted same-origin Scryfall-derived set/mana SVG caching routes.
- Preserved nonce protection for inline scripts while allowing same-origin external Next.js script elements; this prevents CSP from blocking URL-backed client navigation after the document nonce changes.
- Extended Python normalization for multi-face types, numeric/non-numeric P/T/L, and multiple artists.
- Updated generated database types, canonical feature/schema/pipeline/UX documents, and `docs/catalog-filtering.md`.

## Data safety

All migrations are additive or function-only. No database reset, destructive migration, user change, Auth operation, or inventory mutation was performed. Populated local counts before and after remained:

- 38,416 cards;
- 538,418 printings;
- 550,373 faces;
- 1,047 sets;
- 4 Auth users.

## Validation

- Web typecheck and ESLint passed.
- Focused filter/query/component/route tests passed.
- Full web Vitest suite passed: 48 files / 271 tests.
- Desktop and mobile Playwright filter journeys passed 2/2, including searchable repeated selection, URL persistence, wide/full-screen panels, logic editing, Escape/focus restoration, and zero serious/critical Axe violations.
- Python Ruff and formatting passed.
- Python pytest passed 84 with three environment-gated integration skips.
- Production build, canonical manifest, architecture, formatting, release-hygiene, source-secret, browser-bundle-secret, and production-security-header guards passed. Production npm and Python dependency audits reported no known shipping vulnerabilities.
- Database lint passed with zero schema warnings or errors, and `git diff --check` passed.
- Populated admitted-user RPC probes returned 33,549 default Oracle results, matching LEA representatives for `Black Lotus + LEA`, bounded Alpha set facets, and a normal collection page. A two-set representative query returned 620 eligible Oracle cards, five matching `2xm` representatives on the first page, a valid price-floor envelope, and rejected an inverted range. It completed in approximately 0.8 seconds locally.
- pgTAP coverage was extended in Phase 2 and Phase 3 fixture files for every new field, logic, representative selection, pagination, and owned-printing collection behavior.
- The local Supabase pgTAP launcher could not start because neither `docker.exe` nor `podman.exe` is exposed on this VS Code process PATH; the already-running local database remained healthy. Run the standard database suite once Docker CLI PATH is restored.
- Supabase database-type regeneration is blocked by the same missing container CLI because `supabase gen types` launches `postgres-meta` even when given the direct local database URL. The manually reconciled checked-in types pass strict TypeScript; rerun `npm run db:types:check` once Docker is exposed.

## Manual follow-up

- Apply the nine additive/function-only migrations to hosted Supabase only after review.
- Run `npm run test:supabase` in an environment with the Docker CLI exposed.
- Replace upstream Scryfall SVGs only in accordance with the documented source/provenance policy.
