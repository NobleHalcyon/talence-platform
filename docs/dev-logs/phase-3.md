# Phase 3 - Auditable collection inventory

Date: 2026-07-26

Branch: `greenfield/platform-v1`

Required checkpoint subject:
`phase 3: auditable collection inventory`

Checkpoint identity: the local commit containing this log with the required
subject above. Resolve its SHA after creation with `git log -1 --oneline`; the
SHA is intentionally not embedded in the commit that defines it.

Remote actions: none; nothing was pushed, merged, or deployed

## Current state

The Phase 3 database ledger, collection read models, import pipeline, private
Storage policies, authenticated web routes, and focused regression suites are
implemented in the worktree. The final analytics-filter conformance and
explicit permission-state patches are integrated. A clean blank reset, all 16
canonical pgTAP files at 440/440, the six Phase 3 files at 163/163, the real
Storage/three-race concurrency harness, generated database types/drift check,
the complete root CI chain, 136 web tests, production build, and final Edge
preview matrix are green.

The final hygiene audit passes: no secrets, generated artifacts, unignored
runtime data, conflicts, or unrelated scope were found, and
`git diff --check` is clean. Only the prescribed local checkpoint commit
remains. This log is the handoff that checkpoint will contain.

## Outcome

Phase 3 establishes one auditable authority for physical inventory:

- PostgreSQL owns workspace-scoped collections, exact balances, immutable
  transaction headers and lines, canonical idempotency requests, transfers,
  reversals, import staging, valuation, analytics, history, and export.
- Every inventory change crosses an atomic database function. Ordinary users
  cannot directly write balances or committed history, and a mutation cannot
  produce a negative exact balance.
- Authenticated members can read collections according to active membership;
  mutations and lifecycle actions are gated by server-derived role
  permissions.
- CSV imports use a private Storage object and a bounded, replay-safe staging
  protocol. Stable provider identity or exact set/collector/language may match
  automatically; name-only candidates require an explicit decision.
- Finish-specific price estimates preserve provider, currency, observation and
  ingestion times, stale state, and unpriced quantity. Missing price is never
  encoded as zero.
- The web provides collection list/lifecycle, exact inventory editing,
  structured/gallery/analytical views, transfers, immutable history, reversal,
  bounded imports, and safe streamed exports on wide and compact layouts.

No remote repository action, hosted migration, production Storage change,
preview deployment, or production deployment was performed.

## Architecture and invariants

### Collection and inventory schema

Phase 3 extends the Phase 1 `collections` prerequisite with cover printing,
archive/deletion state, timestamps, and integrity rules. It adds:

- enums:
  - `card_condition`;
  - `inventory_source`;
  - `inventory_transfer_direction`;
  - `inventory_import_row_status`;
- exposed, RLS-enabled tables:
  - `inventory_import_jobs`;
  - `inventory_transactions`;
  - `inventory_transaction_lines`;
  - `inventory_balances`;
  - `inventory_import_rows`;
- private tables:
  - `app_private.inventory_value_tiers`;
  - `app_private.inventory_operation_requests`.

Balances are keyed by exact collection, printing, finish, and condition.
Transaction lines are immutable. Transaction-local trusted-write guards permit
balance materialization only while an accepted ledger mutation is running.
Deferred constraints validate transfer pairs and reversal relationships before
commit.

The default collection cannot be archived or deleted while selected. A
non-default collection may only be soft-deleted when no positive balance
remains. Soft deletion is terminal; hard deletion is rejected.

### Atomic mutation and idempotency

The mutation core:

- authenticates the current actor and active workspace role;
- normalizes operation content before hashing;
- binds each idempotency key to its collection/workspace and canonical body;
- returns the stored result for an identical replay;
- rejects conflicting reuse deterministically;
- serializes the exact balance keys;
- checks optional `expected_quantity_before` values;
- rejects negative results;
- writes one immutable header and its lines;
- updates materialized balances in the same transaction.

Transfers create two headers with inverse deltas under one transfer group.
Their deferred invariant verifies the complete pair. Reversal appends a
compensating transaction and does not edit old history. A reversal cannot
reverse another reversal, and paired transfers are reversed as a complete
pair.

An inactive historical printing may be reduced, transferred, or compensated,
but an arbitrary human/CSV mutation cannot create new positive ownership for
it. Human and CSV paths require supported exact finish and condition; the
physical `unknown` states are reserved for later trusted device and reversal
paths.

### Read models, valuation, and export

Collection reads are bounded, deterministic, and cursor-scoped:

- collection filtering happens before pagination;
- cursors bind the relevant workspace, collection, filters, sort, and currency;
- list/detail results carry server-derived capabilities;
- structured inventory pages return exact balances with bounded printing
  summaries rather than unbounded catalog trees;
- history headers include exact line count and at most five line previews;
- a separate function pages every exact transaction line;
- safe actor identity, source, transfer/reversal relationships, timestamps,
  deltas, and a hashed idempotency reference are exposed without raw request
  metadata;
- inventory and error-report exports page rows and stream CSV from the web.

Valuation uses only an exact finish-specific current price. Each priced result
includes provider, currency, observed time, ingested time, and stale state.
Summary reports total quantity, unique printings, unique cards, estimated
value, explicit unpriced quantity, latest inventory change, and latest price
observation.

Analytics groups by set, color, color identity, rarity, finish, condition, and
configured value tier. Whole color/color-identity arrays are grouped as one
classification so multicolor inventory is not counted once per color. The
final filter-conformance adjustment is covered by the clean 163-assertion Phase
3 database run.

The database returns canonical text values for exports. The streaming web CSV
serializer escapes fields and prefixes formula-leading cells so spreadsheet
software cannot execute imported content.

### Bounded CSV import and private Storage

The import boundary accepts UTF-8 CSV with:

- a 2 MiB source-file ceiling;
- at most 5,000 data rows;
- at most 32 columns;
- at most 4,096 characters per cell;
- at most 16,384 characters per source row;
- at most 500 staged rows per database call;
- at most 512 KiB of serialized UTF-8 JSON per web staging request, including
  brackets, commas, and multibyte characters.

The source object is immutable at:
`inventory-imports/<workspace-id>/<job-id>/source.csv`.

Before staging completion and again before commit, PostgreSQL verifies the
object owner, size, MIME type, SHA-256 metadata, import job ID, and parser
version. A replayed identical source row is a no-op; changed content for the
same row number is rejected.

Resolution order is:

1. a valid stable provider printing identity;
2. exact set code, collector number, and language;
3. bounded deterministic name candidates for manual review.

An explicitly invalid provider identity never silently falls back to a name.
Rows remain matched, ambiguous, rejected, or excluded. Sparse preview and error
pagination use exact row-number cursors without overlap.

Commit revalidates the exact Storage object and every included row, then
applies all included quantities as one additive, idempotent inventory
transaction. Any invalid included row rolls back the entire commit.

Authenticated editors may insert the exact owned source object once and read
their authorized object. There is no ordinary update or delete Storage policy,
so duplicate insert, overwrite/upsert, and deletion fail. Service-only
retention first removes the Storage object and then marks the database job
purged.

### Authorization

All five exposed Phase 3 tables have RLS. The policies are:

- `inventory_balances_select_workspace`;
- `inventory_transactions_select_workspace`;
- `inventory_transaction_lines_select_workspace`;
- `inventory_import_jobs_select_workspace_editor`;
- `inventory_import_rows_select_workspace_editor`;
- Storage:
  - `inventory_import_objects_select_exact_job`;
  - `inventory_import_objects_insert_exact_job`.

Ordinary direct table-write grants remain revoked. The read policies protect
future direct reads, while the application uses bounded public RPCs. Anonymous
users have no application-data grant. Private helper functions and tables are
not exposed through the Data API.

Collection/inventory mutation and read functions are executable only by
`authenticated`. Retention coordination is executable only by `service_role`.
Every public function re-derives the actor and membership; callers cannot
supply a trusted user or workspace role.

The final web patch makes denied capabilities explicit in rendered states and
keeps unavailable mutation controls absent or disabled. Root CI and the
post-patch browser rerun remain the final validation gates for this surface.

## Migrations and public function surface

### Ordered migrations

- `supabase/migrations/20260726030000_phase_3_inventory_schema.sql`
  - enums, collection lifecycle fields, ledger/import/private tables,
    constraints, indexes, trusted-write and immutable-history guards, deferred
    transfer/reversal validation, and RLS enablement.
- `supabase/migrations/20260726031000_phase_3_inventory_core_and_collection_mutations.sql`
  - canonical request hashing, collection lifecycle, and atomic inventory
    application.
- `supabase/migrations/20260726031100_phase_3_inventory_transfer_and_reversal.sql`
  - paired transfer and compensating reversal.
- `supabase/migrations/20260726032000_phase_3_collection_inventory_reads.sql`
  - encoded cursor helpers, valued rows, collection list/detail, inventory page,
    and summary.
- `supabase/migrations/20260726032100_phase_3_collection_analytics_history_export.sql`
  - analytics, bounded history headers, exact line paging, and inventory
    export.
- `supabase/migrations/20260726033000_phase_3_inventory_import_staging.sql`
  - source-object verification, deterministic row resolution, create/stage,
    explicit resolution, preview, and error report.
- `supabase/migrations/20260726033100_phase_3_inventory_import_commit_retention.sql`
  - normalized import lines, atomic commit/cancel, stale-job expiry, retention
    candidates, and purge marking.
- `supabase/migrations/20260726034000_phase_3_inventory_rls_storage_and_grants.sql`
  - table RLS, exact private Storage policies, RPC revokes, and
    least-privilege grants.

### Authenticated collection and inventory functions

- `collection_create`
- `collection_update`
- `collection_archive`
- `collection_restore`
- `collection_delete`
- `collection_list`
- `collection_detail`
- `collection_inventory_page`
- `calculate_collection_summary`
- `collection_analytics`
- `collection_transaction_history`
- `collection_transaction_lines`
- `collection_inventory_export`
- `apply_inventory_transaction`
- `transfer_inventory`
- `reverse_inventory_transaction`

### Authenticated import functions

- `inventory_import_create`
- `inventory_import_stage_rows`
- `inventory_import_resolve_row`
- `inventory_import_preview`
- `inventory_import_error_report`
- `inventory_import_commit`
- `inventory_import_cancel`

### Service-only import operations

- `inventory_import_expire_stale`
- `inventory_import_retention_candidates`
- `inventory_import_mark_purged`

## Authenticated web surface

### Routes

- `/app/collections`
  - lists active or archived collections;
  - filters before cursor pagination;
  - creates collections when allowed;
  - shows lifecycle actions from explicit server-derived permissions;
  - omits terminal soft-deleted rows.
- `/app/collections/[collectionId]`
  - summary and provenance;
  - URL-addressable structured, gallery, and analytical modes;
  - bounded search, finish, condition, set, sort, and cursor controls;
  - exact quantity edits, bulk adjustments, transfer, and lifecycle management;
  - responsive card presentation on compact screens.
- `/app/collections/[collectionId]/history`
  - immutable transaction headers;
  - exact line counts and bounded previews;
  - actor/source/reference and transfer/reversal relationships;
  - authorized reversal confirmation.
- `/app/collections/[collectionId]/history/[transactionId]`
  - bounded paging through every exact line.
- `/app/collections/[collectionId]/import`
  - UTF-8 parse, exact private upload, bounded staging, resume, sparse preview,
    manual resolution, atomic commit, and cancel.
- `/app/collections/[collectionId]/import/[importJobId]/errors`
  - streamed, no-store, formula-safe CSV error report.
- `/app/collections/[collectionId]/export`
  - streamed, no-store, formula-safe canonical inventory CSV.
- `/app/catalog` and exact printing detail
  - add-to-collection controls with exact printing, finish, condition,
    quantity, and optional note.

### Shared implementation

- `apps/web/components/collections/**`
  - shared list, lifecycle, summary, analytics, controls, inventory browser,
    add-to-collection, history, reversal, and import components plus one CSS
    Module.
- `apps/web/features/collections/**`
  - URL query parsing, RPC response validation, typed reads, server actions,
    idempotency, CSV parsing/serialization, byte-aware staging chunks, streamed
    exports/reports, deterministic previews, and view models.
- explicit loading, error, empty, malformed, conflict, success, archived,
  unavailable, and permission states;
- `next.config.ts` raises only the bounded server-action body allowance needed
  for the 2 MiB CSV contract;
- workspace context and catalog components reuse the shared collection
  controls rather than page-local primitives.

## Files changed

### Database and integration tests

- the eight `2026072603*_phase_3_*.sql` migrations listed above;
- `supabase/tests/database/300_phase_3_inventory_schema_and_surface.test.sql`;
- `supabase/tests/database/310_phase_3_inventory_ledger_idempotency.test.sql`;
- `supabase/tests/database/315_phase_3_inventory_max_import_performance.test.sql`;
- `supabase/tests/database/320_phase_3_transfer_reversal_and_lifecycle.test.sql`;
- `supabase/tests/database/330_phase_3_import_summary_export_retention.test.sql`;
- `supabase/tests/database/340_phase_3_inventory_rls_two_workspaces.test.sql`;
- `supabase/tests/integration/phase3-storage-concurrency.mjs`;
- `supabase/tests/run-pgtap.mjs`;
- `supabase/tests/database/120_phase_1_workspace_rls_and_owner_invariants.test.sql`
  updated for the Phase 3 database-owned default-collection archive guard.

### Web

- `apps/web/app/(authenticated)/app/collections/**`;
- `apps/web/components/collections/**`;
- `apps/web/features/collections/**`;
- `apps/web/tests/collections-actions.test.ts`;
- `apps/web/tests/collections-csv.test.ts`;
- `apps/web/tests/collections-data.test.ts`;
- `apps/web/tests/collections-import-actions.test.ts`;
- `apps/web/tests/collections-ui.test.tsx`;
- `apps/web/tests/collections-view-model.test.ts`;
- `apps/web/e2e/collections-preview.spec.ts`;
- `apps/web/components/catalog/catalog-detail.tsx`;
- `apps/web/components/catalog/catalog-results.tsx`;
- `apps/web/components/workspace/workspace-context.tsx`;
- `apps/web/lib/database/contracts.ts`;
- `apps/web/next.config.ts`.

- `apps/web/lib/supabase/database.types.ts`, regenerated from the final local
  Phase 3 schema with a passing drift check.

### Repository and documentation

- `package.json`;
- `README.md`;
- `IMPLEMENTATION_STATUS.md`;
- `docs/dev-logs/phase-3.md`;
- `docs/operations/production-setup.md`;
- `supabase/README.md`;
- `supabase/migrations/README.md`;
- `supabase/tests/README.md`.

## Test coverage

### pgTAP

The final Phase 3 database matrix passes 163/163:

| File                                                    | Assertions | Coverage                                                                                       |
| ------------------------------------------------------- | ---------: | ---------------------------------------------------------------------------------------------- |
| `300_phase_3_inventory_schema_and_surface.test.sql`     |         32 | schema, indexes, RLS, function signatures, grants, Storage surface                             |
| `310_phase_3_inventory_ledger_idempotency.test.sql`     |         25 | immutable ledger, exact balances, replay/conflict, optimistic and negative guards              |
| `315_phase_3_inventory_max_import_performance.test.sql` |          5 | full 5,000-row import, deferred invariants, lines/balances, five-second ceiling                |
| `320_phase_3_transfer_reversal_and_lifecycle.test.sql`  |         25 | paired transfer, reversal, archive/restore/delete, inactive catalog identity                   |
| `330_phase_3_import_summary_export_retention.test.sql`  |         50 | source binding, resolution/replay, commit/cancel, reads, valuation, history, export, retention |
| `340_phase_3_inventory_rls_two_workspaces.test.sql`     |         26 | viewer/editor separation, cross-workspace denial, direct mutation denial                       |

The final 5,000-row maximum import commit measured approximately 850 ms, below
the five-second guard. The preceding implementation optimization improved this
path by about 33 times. Fixture construction is outside the timed section; the
measured operation includes the actual import commit and forced deferred
invariants.

The schema suite also catalogs the expected public signatures and grants, so a
new accidental RPC overload or privilege drift fails the test rather than
silently expanding the API.

### Real Storage and concurrency integration

`npm run test:supabase:phase3-integration` passes against the local API and
PostgreSQL with admitted editor/viewer identities. It proves:

- exact editor object upload and download;
- viewer download denial;
- wrong-job-path upload denial;
- duplicate insert and upsert denial;
- ordinary delete denial without object loss;
- service-role cleanup;
- identical same-key race: one commit and one replay with one transaction;
- conflicting same-key race: one winner and one `23505`
  `talence_inventory_idempotency_conflict`;
- distinct keys against the same absent balance: both commits survive and the
  final `+4/+5` balance is `9`.

This is a true two-session harness, not sequential pgTAP simulation.
`phase3-storage-concurrency.mjs` also refuses any non-loopback database or API
target unless `TALENCE_ALLOW_HOSTED_PHASE3_INTEGRATION=1` is explicitly set.
The guarded local integration rerun passes, and a fake hosted-target invocation
passes by refusing to run with
`phase3_integration_refuses_hosted_target_without_explicit_opt_in`.

### Root CI, web, worker, and browser

- complete root `npm.cmd run ci`: pass;
- canonical manifest, architecture guard, formatting, lint, strict TypeScript,
  and contract validation: pass;
- JavaScript/TypeScript tests: 174 passing:
  - web Vitest: 23 files and 136 tests;
  - contracts: 7;
  - domain: 2;
  - UI: 11;
  - trusted administration: 18;
- Python Ruff and strict mypy: pass;
- Python pytest: 49 passed and 1 expected environment-gated skip;
- Next.js production build: pass;
- final Edge Playwright desktop/mobile matrix: 10 passed, 2 intentional skips.

Web tests cover payload/query validation, RPC response parsing, mutation
normalization, deterministic idempotency keys, stale-quantity conflicts, CSV
byte/row/cell bounds, multibyte-aware staging chunks, import state/error
mapping, streamed export/report boundaries, view models, and semantic UI
states.

The browser matrix covers:

- active/archived list filters;
- structured, gallery, and analytical collection modes;
- compact quantity editing and success status;
- no horizontal overflow on desktop and Pixel 7 viewports;
- immutable history and reversal confirmation;
- paged exact-line detail;
- staged matched/ambiguous/rejected import review;
- disabled commit while ambiguity remains;
- safe export headers/body and fail-closed unpersisted error-report access.

One collection HTTP test intentionally runs only in the desktop project because
the HTTP contract is viewport-independent. The existing catalog phone smoke
intentionally runs only in the mobile project. Those produce the two expected
skips.

## Verification record

### Green evidence on the current integration tree

```text
npx supabase db reset --local --no-seed
  PASS - blank database applied every ordered migration

npm run db:lint
  PASS - zero warnings

npm run test:supabase
  PASS - 16 canonical files / 440 assertions
  PASS - Phase 3 163/163 (32 + 25 + 5 + 25 + 50 + 26)

npm run test:supabase:phase3-integration
  PASS - exact Storage authorization + three concurrency race modes

npm run db:types
npm run db:types:check
  PASS - generated surface refreshed and drift-free

npm.cmd run ci
  PASS - complete root chain
  PASS - web 136 + contracts 7 + domain 2 + UI 11 + admin 18
  PASS - contract validation
  PASS - Python Ruff/mypy; pytest 49 passed / 1 expected env-gated skip
  PASS - Next.js production build

$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
  PASS - 10 passed / 2 intentional skips
```

These results are all final-post-patch evidence.

### Required final checkpoint evidence

| Check                                                           | Current checkpoint status            |
| --------------------------------------------------------------- | ------------------------------------ |
| Final analytics-filter patch                                    | Complete; Phase 3 163/163            |
| Explicit permission-state web patch                             | Complete; root CI and Edge validated |
| Blank `supabase db reset --local --no-seed` after final patches | Pass                                 |
| Database lint after final patches                               | Pass; zero warnings                  |
| Complete pgTAP after final patches                              | Pass; 16 files/440, Phase 3 163/163  |
| Storage/concurrency harness after final patches                 | Pass                                 |
| Regenerate database types                                       | Pass                                 |
| Generated type drift check                                      | Pass                                 |
| Complete root `npm.cmd run ci`                                  | Pass                                 |
| Final Edge Playwright matrix                                    | Pass; 10 passed/2 intentional skips  |
| `git diff --check` and secret/artifact review                   | Pass                                 |
| Phase 3 checkpoint commit                                       | Pending final root step              |

The checkpoint commit is the only remaining entry.

### Reproduction and final root commands

From the repository root in PowerShell:

```powershell
npx supabase start
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run test:supabase:phase3-integration
npm run db:types
npm run db:types:check
npm.cmd run ci
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
git diff --check
git status --short
```

The complete diff and repository hygiene audit is clean. If the tree is
unchanged, create the commit containing this log and
`IMPLEMENTATION_STATUS.md`:

```text
phase 3: auditable collection inventory
```

Resolve the SHA afterward with `git log -1 --oneline`; no pre-commit SHA edit
is required.

## Manual production setup

The slice is local-only until the private-beta production checklist is
completed:

- apply the ordered migrations to hosted development before production;
- regenerate and review types against the hosted development schema;
- verify the private `inventory-imports` bucket, exact policies, object owner
  and metadata behavior, and service retention ordering against hosted
  Supabase;
- configure and monitor the operator that deletes retained source objects
  before calling `inventory_import_mark_purged`;
- exercise viewer/editor/manager/owner behavior, stale quantity conflicts,
  imports, transfers, reversals, valuation provenance, and exports using
  non-production data;
- verify provider price freshness and missing-price behavior with a reviewed
  hosted catalog;
- keep uploaded source CSVs, error reports, database dumps, local snapshots,
  and credentials out of source control;
- complete Phase 6 backup/restore, WAF, quota, monitoring, alerting, incident,
  security, and deployment controls before production activation.

Phase 1 Auth/email/CAPTCHA and Phase 2 worker/schedule setup remain documented
but intentionally unactivated. See `docs/operations/production-setup.md`.

## Deviations, blockers, and risks

- No locked-stack or numbered-canon behavior deviation is known.
- There is no external blocker. Implementation and validation are complete;
  only the local checkpoint commit remains.
- Current static-preview browser tests validate responsive behavior without
  hosted credentials. Database authorization and transaction invariants are
  tested separately against local Supabase; hosted acceptance remains manual.
- Current-price estimates are not acquisition cost basis and apply no
  condition multiplier, as required for this private-beta phase.
- Import retention is deliberately service-coordinated in two steps because a
  PostgreSQL transaction cannot atomically delete a Storage object.
- Catalog identities may later become inactive. The ledger preserves safe
  reduction/transfer/reversal of already-owned inventory while rejecting a new
  arbitrary positive inactive balance.
- Browser exports neutralize spreadsheet formulas. Consumers that bypass the
  route and call the raw RPC are responsible for treating canonical text as
  data.
- The private Storage metadata and owner fields must be revalidated against the
  hosted Supabase version before activation.
- Device-originated inventory, device grants, quotas, `/api/v1/device`, and
  snapshot publication remain Phase 5. Phase 3 introduces no raw device secret,
  remote robot motion, or cloud execution state.

## Phase 4 handoff

Begin Phase 4 only after the exact Phase 3 checkpoint is committed.

The next vertical slice is the collection-aware deck builder:

1. Add append-only, versioned format rules for Standard, Pioneer, Modern,
   Legacy, Vintage, Pauper, and Commander.
2. Add workspace-scoped decks, immutable revisions, zones, exact entries, and
   source/import provenance.
3. Allocate owned copies without double-counting across consuming zones;
   maybeboard remains non-consuming.
4. Distinguish total ownership shortfall from preferred-printing shortfall.
5. Value exact selected finish/printing combinations and preserve missing-price
   provenance.
6. Run deterministic validation against explicit rule and catalog versions.
   Keep legality, companion, partner/background, and incomplete catalog data
   advisory where canon requires.
7. Add bounded text import (256 KiB and 2,000 lines), responsive editing,
   revisions, filters, and complete RLS/transactional/browser tests.
8. Update the Phase 4 log and checkpoint exactly:
   `phase 4: collection-aware deck builder`.

Deck allocation must read the Phase 3 physical ledger and must never mutate or
replace inventory balances.
