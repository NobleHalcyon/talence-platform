# Phase 2 - Canonical catalog pricing and browse

Date: 2026-07-26

Branch: `greenfield/platform-v1`

Required checkpoint subject:
`phase 2: canonical catalog pricing and browse`

Checkpoint SHA: resolve after the final validation run and checkpoint commit
with `git log -1 --oneline`.

## Outcome

Phase 2 implements the first complete catalog and current-price vertical slice:

- PostgreSQL owns normalized catalog identity, current prices, source
  provenance, import state, private staging, validation, atomic promotion,
  admitted-user reads, and bounded catalog RPCs.
- The Python 3.13 worker discovers Scryfall metadata, selects exactly
  `all_cards`, downloads and hashes it safely, normalizes it in bounded batches,
  and drives the database import lifecycle.
- Authenticated users can search and browse the active catalog in table or
  grid form and inspect card, printing, and set detail.
- Platform administrators can inspect catalog health and queue work. No
  provider download or import runs in a web request.
- Missing prices remain absent rather than becoming zero. Every displayed
  observation includes provider, currency, finish, observed time, ingestion
  time, and stale state.

No remote repository action, hosted migration, live provider import, workflow
schedule, secret change, preview deployment, or production deployment was
performed.

## Master-prompt completion

### Database catalog and pricing

- Added sets, oracle cards, printings, ordered faces, legalities, external IDs,
  source files, import runs, catalog state, current prices, and import-scoped
  private staging tables.
- Added generated full-text documents, normalized names, GIN full-text/trigram
  indexes, array indexes, and browse/filter/sort indexes.
- Search builds index-backed card, printing, face, and set candidate unions
  before applying the remaining browse predicates, avoiding broad correlated
  evaluation across unrelated printings.
- Kept catalog identity global and system-written. Active admitted users receive
  read-only access to active identity rows; anonymous users receive none.
- Kept price and operational tables out of direct authenticated table access.
  Bounded security-definer RPCs return price provenance and freshness together.
- Added import source registration, unchanged-active-source detection, worker
  leasing and heartbeat, stale-lease recovery, validation, failure recording,
  staging cleanup, and advisory-locked atomic promotion.
- Added replay-safe queued no-op completion against the database-owned active
  source identity. Matching, unforced queued work can finish without downloading
  the bulk file; forced or changed identity remains queued for a full import.
- Heartbeat and promotion recheck the database sync switch. Closing it during a
  run produces a stable failure, prevents promotion, and preserves the active
  catalog.
- Added an absolute live-import floor in addition to relational validation so a
  syntactically valid but catastrophically truncated source cannot replace the
  active catalog.
- Added admitted-user search/detail/status RPCs and actor-verifying,
  service-role-only platform-admin status/queue RPCs.
- Generated the web database contract for the new public RPC signatures.

### Python catalog worker

- Uses Scryfall bulk metadata and exact `all_cards` selection plus separate set
  metadata.
- Sends a descriptive contact-bearing `User-Agent` and explicit JSON `Accept`
  header, paces metadata requests below ten per second, and bounds retries.
- Requires HTTPS and restricts bulk bytes, including redirects, to
  `data.scryfall.io`.
- Streams the bulk response to an atomic temporary file while enforcing a byte
  ceiling and calculating the literal source SHA-256.
- Parses cards incrementally with `ijson` and writes bounded normalized batches
  for sets, cards, printings, faces, legalities, external IDs, and non-null
  finish-specific prices.
- Preserves printing-level provider color identity independently from face
  colors, including non-oracle objects.
- Combines the raw `all_cards` hash with the normalized consumed-set dependency
  hash for active-catalog identity and replay detection.
- Keeps fixture mode local and network-incapable.
- Treats rejected records as fatal, preserves the prior catalog on any
  pre-promotion or promotion failure, and records bounded stable failure codes.
- Cleans terminal staging after the retention window and recovers only expired
  worker leases.
- Provides `validate`, `fixture-import`, `live-import`, and `status` commands,
  including explicit forced replay and queued-run claiming.
- For an unforced queued live run, discovers provider/set metadata and asks the
  database to reconcile the active identity before downloading `all_cards`.
  Only a confirmed active match completes as a no-download no-op.
- Adds a manual GitHub Actions fixture-validation job. The live job is
  deliberately unreachable, has no secrets, and has no schedule.

### Authenticated web catalog

- `/app/catalog` provides URL-addressable search, set/language/rarity/finish,
  color/color-identity, type, price availability, mana-value, release-date,
  digital/nondefault, sort, view, and bounded cursor controls.
- The default browse language is English. `lang=all` is the stable explicit
  broadening URL and maps to an all-language RPC request; other valid language
  codes remain shareable.
- Search uses the PostgreSQL full-text/trigram surface; no external search
  engine and no live Scryfall search were added.
- Table and grid views share semantic components. The responsive phone layout
  exposes the same filters through a drawer.
- `/app/catalog/cards/[cardId]` renders oracle identity, legalities, faces, and
  a bounded printing sample with an explicit total/truncation notice.
- `/app/catalog/printings/[printingId]` renders exact edition, collector,
  language, rarity, finishes, multi-face identity, direct provider imagery, and
  all current finish-specific observations.
- `/app/catalog/sets/[setCode]` renders set metadata and a bounded printing
  sample with a link back to the complete filtered catalog.
- Loading, empty, malformed-filter, unavailable-catalog, runtime-error, and
  success states are explicit.
- Provider image URLs are rendered directly; no Vercel/Supabase transformation
  or function proxy was introduced.
- Query parsing constrains enum-like filters, color combinations, exact calendar
  dates, and base64url cursor shape before calling the database.
- Price parsing preserves a legitimate zero observation when its provenance is
  complete. Null or missing provider observations render `Price unavailable`.

### Catalog administration

- `/app/admin/catalog` shows database sync state, active version, counts, latest
  source, recent failures/imports, and queued work.
- Platform-admin authorization is rechecked by the database RPC using the
  authenticated actor UUID.
- Queueing requires both `FEATURE_CATALOG_SYNC_ENABLED=true` in the web server
  and `public.catalog_state.sync_enabled=true` in the database.
- The action only creates or replays a queued import row. A worker must claim
  that UUID; no long-running provider work is performed in the request.

## Files changed

### Repository, environment, and automation

- `.github/workflows/catalog-sync.yml`
- `.env.example`
- `apps/web/.env.example`
- `apps/web/playwright.config.ts`

### Database and generated surface

- `supabase/migrations/20260726020000_phase_2_catalog_schema.sql`
- `supabase/migrations/20260726021000_phase_2_catalog_import_functions.sql`
- `supabase/migrations/20260726022000_phase_2_catalog_browse_functions.sql`
- `supabase/migrations/20260726023000_phase_2_catalog_rls_and_grants.sql`
- `supabase/migrations/README.md`
- `supabase/tests/database/200_phase_2_catalog_schema_and_surface.test.sql`
- `supabase/tests/database/210_phase_2_catalog_import_lifecycle.test.sql`
- `supabase/tests/database/220_phase_2_catalog_browse_rpcs.test.sql`
- `supabase/tests/database/230_phase_2_catalog_rls.test.sql`
- `supabase/tests/database/240_phase_2_catalog_search_performance.test.sql`
- `supabase/tests/README.md`
- `apps/web/lib/database/contracts.ts`
- `apps/web/lib/supabase/database.types.ts`

### Catalog worker

- `services/catalog-worker/pyproject.toml`
- `services/catalog-worker/.env.example`
- `services/catalog-worker/README.md`
- `services/catalog-worker/fixtures/scryfall/all_cards.json`
- `services/catalog-worker/src/talence_catalog/{cli,config,database,importer,models,store,timestamps}.py`
- `services/catalog-worker/src/talence_catalog/provider/scryfall.py`
- `services/catalog-worker/src/talence_catalog/normalize/{__init__,card,catalog,sets}.py`
- `services/catalog-worker/tests/{conftest,test_cli,test_config,test_database,test_database_integration,test_importer,test_normalize,test_provider,test_timestamps}.py`

Existing download, snapshot, fixture, and versioning modules remain shared
foundations and are covered by the complete worker suite.

### Web catalog

- `apps/web/app/(authenticated)/app/catalog/page.tsx`
- `apps/web/app/(authenticated)/app/catalog/{loading,error}.tsx`
- `apps/web/app/(authenticated)/app/catalog/cards/[cardId]/page.tsx`
- `apps/web/app/(authenticated)/app/catalog/printings/[printingId]/page.tsx`
- `apps/web/app/(authenticated)/app/catalog/sets/[setCode]/page.tsx`
- `apps/web/app/(authenticated)/app/admin/catalog/page.tsx`
- `apps/web/app/(authenticated)/app/admin/invites/page.tsx`
- `apps/web/components/catalog/*`
- `apps/web/features/catalog/*`
- `apps/web/tests/catalog-{actions,data,query,ui}.test.*`
- `apps/web/e2e/catalog-preview.spec.ts`
- `packages/ui/src/primitives.tsx`

### Documentation

- `README.md`
- `IMPLEMENTATION_STATUS.md`
- `docs/dev-logs/phase-2.md`
- `docs/operations/production-setup.md`
- `supabase/README.md`

## Migrations, functions, and policies

### `20260726020000_phase_2_catalog_schema.sql`

Creates:

- public catalog tables: `catalog_sets`, `catalog_cards`,
  `catalog_printings`, `catalog_faces`, `catalog_legalities`, and
  `catalog_external_ids`;
- public provenance/operations tables: `catalog_source_files`,
  `catalog_import_runs`, and singleton `catalog_state`;
- public current-price table: `current_prices`, keyed by printing, provider,
  currency, and finish;
- private import tables: `catalog_stage_sets`, `catalog_stage_cards`,
  `catalog_stage_printings`, `catalog_stage_faces`,
  `catalog_stage_legalities`, `catalog_stage_external_ids`, and
  `catalog_stage_prices`;
- catalog enums, shape/temporal constraints, generated search columns,
  update-time triggers, `pg_trgm`, and the required browse/import indexes.

An explicit zero price is legal. A missing price is represented by no row.

### `20260726021000_phase_2_catalog_import_functions.sql`

Creates private trusted functions:

- `catalog_register_source_file`
- `catalog_purge_import_staging`
- `catalog_begin_import`
- `catalog_heartbeat_import`
- `catalog_fail_import`
- `catalog_fail_queued_import`
- `catalog_complete_queued_noop`
- `catalog_validate_import`
- `catalog_promote_import`
- `catalog_worker_status`

Promotion validates import ownership and state, serializes with an advisory
lock, replaces active rows and prices, advances the catalog pointer, records
success metadata, and purges staging in one transaction. A raised promotion
error rolls the transaction back.

### `20260726022000_phase_2_catalog_browse_functions.sql`

Creates private bounded search/cursor/rendering helpers, including
`catalog_query_matching_printings` and `catalog_search_keys`. Query matching
unions index-backed card, printing, face, and set candidates before applying the
remaining exact filters.

Creates admitted-user RPCs:

- `catalog_search`
- `catalog_printing_detail`
- `catalog_card_detail`
- `catalog_set_detail`
- `catalog_status`

Creates service-role-only, actor-verifying administration RPCs:

- `admin_catalog_status`
- `admin_queue_catalog_sync`

The search RPC bounds the request, validates filter combinations, scopes
versioned cursors to the active result set, and supports deterministic
name/newest/price ordering.

### `20260726023000_phase_2_catalog_rls_and_grants.sql`

- Enables RLS on all ten exposed Phase 2 tables.
- Revokes all table access from `public`, `anon`, and `authenticated` before
  adding the minimum read surface.
- Grants `authenticated` direct `SELECT` only on active catalog identity tables
  and gates every row with active Talence admission.
- Grants no authenticated table access to current prices, source files, import
  runs, or catalog state. Prices and operational state cross bounded RPCs.
- Adds no ordinary-user insert, update, or delete policy.
- Keeps worker staging in `app_private`, outside the exposed Data API schemas.

## Test coverage

The five Phase 2 pgTAP files define 152 new assertions:

- object/table/function/grant/RLS surface checks;
- single-face, multi-face, foreign-language, and non-oracle token promotion;
- null, zero, and multiple finish-specific price behavior;
- active-source no-op, forced replay, historical-source replay, and set
  dependency identity;
- invalid price mapping, failed validation, and preservation of prior state;
- absolute-floor rejection of a truncated live candidate;
- terminal staging retention cleanup;
- stale worker lease recovery and heartbeat;
- queued preflight failure persistence and replay safety;
- queued no-download completion, replay, forced-run, and changed-identity
  behavior;
- heartbeat/promotion kill-switch rechecks and active-state preservation;
- a forced real database exception proving promotion rollback;
- search/filter/sort/cursor behavior, price finish/provenance selection, detail
  payloads, catalog status, and platform-admin queue authorization;
- active admitted-user identity reads plus inactive, suspended, anonymous,
  operational-table, price-table, and all-write denial;
- a deterministic 50,000-printing performance fixture, full-text GIN plan,
  exact-result assertion, and five-second representative search ceiling.

Worker tests cover configuration, provider selection and headers, redirect host
validation, streaming download behavior, normalization, source identity,
fixture isolation, import orchestration, database adapters, leases, failure
boundaries, no-download queue reconciliation, in-flight sync closure,
printing-level non-oracle color identity, CLI output, and timestamps.

Web tests cover query normalization and serialization, RPC mapping and parsing,
admin queue behavior, price and detail states, responsive catalog UI, and
static-preview phone flows.

## Verification snapshot

Stable passing evidence recorded during Phase 2:

- `npm.cmd run ci` - the complete root chain passed at the Phase 2 integration
  point.
- Web Vitest - 17 files and 86 tests passed.
- Contracts/domain/UI/admin tests - 7, 2, 11, and 18 tests passed,
  respectively.
- Web strict TypeScript, ESLint, targeted Prettier, and the Next.js production
  build passed.
- Playwright with system Edge - 5 catalog/public flows passed and 1
  desktop-only preview case was intentionally skipped by its viewport guard.
- Final worker checks - Ruff, Ruff format, strict mypy, and database-enabled
  pytest 50/50 passed after queue reconciliation, in-flight switch,
  non-oracle identity, lease, truncation, retention, provider-boundary, and
  failure-recording hardening.
- Direct worker CLI/database probe - forced fixture promotion succeeded with 3
  sets, 2 cards, 4 printings, 5 faces, 6 legalities, 14 external IDs, 7 prices,
  and 0 rejected records. Immediate replay returned `status=unchanged`,
  `promoted=false`, and the same catalog version/source hashes.
- `npx.cmd supabase db reset` - all migrations applied from a blank local
  database.
- `npm.cmd run db:lint` - zero issues.
- Targeted Phase 2 pgTAP - 5 files and 152/152 passed: schema/surface 40,
  import/hardening 58, browse/admin 36, RLS 14, and representative performance 4.
- Representative cold 50,000-printing search improved from 5,558.6 ms to
  109.370 ms after the candidate-union query correction; the final full-suite
  run measured 120.402 ms.
- Full pgTAP - 10 files and 277/277 assertions passed.
- `npm.cmd run db:types` and `npm.cmd run db:types:check` - the checked-in
  Supabase TypeScript contract was regenerated from the final local schema and
  passes drift checking.
- Focused post-review catalog query tests - 11/11 passed after matching the SQL
  set/language filter shapes and enforcing implicit English plus the explicit
  `lang=all` broadening sentinel; web TypeScript, focused ESLint, and Prettier
  also passed.
- `git diff --check` - pass.

Phase 1's completed database baseline was five files and 125 pgTAP assertions;
Phase 2 adds five files and 152 assertions, for 10 files and 277 assertions
overall.

## Route descriptions

- `/app/catalog` - admitted-user search/browse with URL state, filters, sort,
  bounded cursor pagination, English-by-default or explicit all-language
  browsing, active-filter removal, and table/grid views.
- `/app/catalog/cards/[cardId]` - oracle card, faces, legalities, and bounded
  printing variants.
- `/app/catalog/printings/[printingId]` - exact printing, direct provider image,
  faces, finish metadata, and price provenance/freshness.
- `/app/catalog/sets/[setCode]` - set facts and bounded printing sample.
- `/app/admin/catalog` - platform-admin status, failures, queue, and manual
  queue request; it never performs an import inline.

## Manual production setup

The implementation is complete locally, but these human-owned actions remain:

- apply and verify all migrations in hosted development before production;
- keep `catalog_state.sync_enabled=false` until a controlled import window;
- provision a protected direct PostgreSQL worker URL and real contact-bearing
  worker user agent;
- run offline validation and a fixture promotion against non-production;
- perform and review the first live manual `all_cards` import;
- verify catalog counts, provenance, observed/ingested/stale times, direct
  images, search, detail, RLS, and rollback monitoring;
- enable `FEATURE_CATALOG_SYNC_ENABLED` only when a worker can claim queued
  requests;
- wire protected workflow secrets, remove the explicit live-job guard, and add
  a reviewed schedule only after the first live import and cost controls;
- keep bulk files, credentials, temporary files, and generated snapshots out of
  source control.

Exact commands and gate ordering are in
`docs/operations/production-setup.md`.

## Deviations, blockers, and risks

- No locked-stack or canonical behavior deviation was made.
- Live Scryfall behavior is implemented but not claimed as production-proven;
  network-dependent tests use fixtures/mocks and no live import was run.
- The admin route is intentionally queue-only. Until a protected worker
  dispatcher or schedule is enabled, an operator must claim queued work with
  `talence-catalog live-import --queued-import-id <uuid> --trigger-type manual`.
- Browser E2E uses the explicit non-production static preview and therefore
  validates responsive interaction and rendering, not a live Supabase RPC/RLS
  session. Database authorization and lifecycle invariants are covered
  separately by pgTAP.
- Direct provider images remain subject to provider availability; Talence does
  not proxy or transform them.
- Artifact storage and immutable robot SQLite catalog publication remain Phase
  5 work.
- Inventory, decks, device API/credentials, and robot snapshots remain owned by
  Phases 3-5. No remote robot motion or cloud robot execution state was added.

## Next phase

Phase 3 is the auditable collection inventory slice: collections, immutable
inventory transactions and lines, balances, transfers/reversals, import staging,
idempotency/body-hash enforcement, valuation/freshness, workspace RLS, strict
CSV preview/commit, responsive inventory UI, and mandatory concurrency tests.
