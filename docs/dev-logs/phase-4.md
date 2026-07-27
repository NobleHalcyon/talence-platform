# Phase 4 - Collection-aware deck builder

Date: 2026-07-26

Branch: `greenfield/platform-v1`

Starting checkpoint: `d819a17 phase 3: auditable collection inventory`

Required checkpoint subject:

```text
phase 4: collection-aware deck builder
```

Checkpoint SHA: resolve this checkpoint from `git log` after commit

## Current status

Phase 4 implementation and its complete local validation matrix are finished.
This log is included in the prescribed checkpoint
`phase 4: collection-aware deck builder`. Phase 5 must start from that
checkpoint.

No remote repository action, hosted migration, production Storage change,
deployment, or external paid-service call is authorized by this phase.

## Required delivery

- versioned, system-written MTG format configuration;
- workspace-scoped decks, oracle-level entries, and collection inventory
  sources;
- default-deny RLS and function-mediated mutations;
- deck list, lifecycle, duplication, source selection, and responsive editor;
- catalog search/add plus click/tap controls for every quantity and zone action;
- optional preferred printings, ownership allocation, valuation, and explicit
  unpriced state;
- deterministic advisory validation with exact rule and catalog versions;
- safe plain-text import/export where the acceptance criteria remain intact;
- database, unit, browser, build, and repository-hygiene validation.

## Files changed

Database and generated surface:

- `supabase/migrations/20260726040000_phase_4_deck_schema_and_formats.sql`;
- `supabase/migrations/20260726041000_phase_4_deck_mutations_and_revisions.sql`;
- `supabase/migrations/20260726042000_phase_4_deck_ownership_and_reads.sql`;
- `supabase/migrations/20260726042100_phase_4_deck_validation_detail_and_export.sql`;
- `supabase/migrations/20260726043000_phase_4_deck_rls_grants_and_collection_guards.sql`;
- `apps/web/lib/supabase/database.types.ts`;
- `apps/web/lib/database/contracts.ts`;
- `supabase/README.md`, `supabase/migrations/README.md`, and
  `supabase/tests/README.md`;
- root `package.json` for the Phase 4 concurrency command.

Web application:

- deck list, editor, import, export, loading, and error routes under
  `apps/web/app/(authenticated)/app/decks`;
- all shared deck primitives under `apps/web/components/decks`;
- all deck loaders, actions, parsers, preview fixtures, query helpers, and
  types under `apps/web/features/decks`;
- `apps/web/features/collections/data.ts` for bounded complete source-selector
  pagination;
- `apps/web/components/catalog/catalog-controls.tsx` for a hydration-safe mobile
  filter trigger exposed by the expanded parallel browser matrix.

Tests and handoff:

- seven `supabase/tests/database/4*_phase_4_*.test.sql` pgTAP suites;
- `supabase/tests/integration/phase4-deck-concurrency.mjs`;
- seven `apps/web/tests/decks-*.test.*` suites;
- the Phase 4 assertions in `apps/web/tests/catalog-ui.test.tsx`;
- `apps/web/e2e/decks-preview.spec.ts`;
- this phase log and `IMPLEMENTATION_STATUS.md`.

## Implementation record

### Schema, versions, and immutable evidence

Phase 4 adds the `deck_zone` enum and seven exposed, RLS-enabled tables:

- `deck_formats`;
- `deck_format_versions`;
- `decks`;
- `deck_entries`;
- `deck_inventory_sources`;
- `deck_revisions`;
- `deck_validation_runs`.

Format identities are stable and rule versions are append-only. Every deck
pins one exact format-version UUID, so a later rules release cannot silently
change an existing deck. The initial MTG configuration contains version 1 for
Standard, Pioneer, Modern, Legacy, Vintage, Pauper, and Commander. Each record
states that the implementation is an advisory baseline rather than an
exhaustive Comprehensive Rules or tournament-policy engine, records its
official format URL, and records the `2026-07-26` verification date.

Every successful mutation records one immutable revision containing the exact
logical content hash, rules version, catalog version, actor, reason, and an
audit snapshot. Logical content has a 32 MiB aggregate ceiling and the
de-duplicated audit snapshot has a 40 MiB ceiling. Incremental mutations can
record the schema-supported 2,000 entries with 2,000 Unicode characters of
notes per entry inside those aggregate bounds; a mutation that would exceed
them returns the explicit `22001 talence_deck_content_too_large` error before
the table constraint. Bulk replacement has a separate 2,000-entry and 1 MiB
PostgreSQL JSONB-payload boundary and rejects a larger request with `22023`.

Validation runs are immutable and keyed by deck, content hash, exact rules
version, and catalog version. Re-evaluating the same tuple reuses the stored
result. A changed deck or catalog generation creates new evidence without
rewriting history.

### Mutation, concurrency, and lifecycle model

The authenticated mutation surface is:

- `deck_create`;
- `deck_update`;
- `deck_duplicate`;
- `deck_archive`;
- `deck_restore`;
- `deck_delete`;
- `deck_sources_replace`;
- `deck_entry_add`;
- `deck_entry_update`;
- `deck_entry_remove`;
- `deck_entries_replace`.

Every mutable object is workspace-scoped. The functions derive the current
actor, require an admitted user and the necessary workspace role, lock the deck
and the active catalog-generation pointer, and compare the caller's expected
revision both before and after any wait. A stale writer receives
`40001 talence_deck_stale`; no partial mutation or lost overwrite is accepted.
Catalog promotion takes the conflicting state lock, so a deck mutation cannot
mix identity checks from one generation with revision evidence from another.
Delete is terminal soft deletion and physical deletion is rejected.

Entries are oracle-card requirements keyed by deck, card, and zone. The five
zones are mainboard, sideboard, commander, companion, and maybeboard. Quantity,
zone, note, and optional exact preferred printing/finish are mutated together.
New entries and preferences require active catalog identities. An inactive
identity already saved on a deck may survive an exact update, bulk
replacement, or duplication through a private transaction- and
backend-bound preservation context; it cannot be forged by an ordinary
session or expanded into a different zone.

Deck inventory sources accept at most 20 distinct collections in the same
workspace and game. Collection/source lifecycle changes share transaction
advisory locks. Multi-source mutations acquire distinct locks in UUID order,
which prevents inverse-order deadlocks. A collection referenced by a
non-deleted deck cannot be deleted; the public collection wrappers authenticate
before checking references so another workspace's relationship is not leaked.

### Ownership, value, validation, and bounded reads

The read surface is:

- `deck_formats_list`;
- `deck_list`;
- `deck_detail`;
- `deck_catalog_search`;
- `deck_card_printings`;
- `deck_import_resolve`;
- `calculate_deck_ownership`;
- `validate_deck`;
- `deck_revision_history`;
- `deck_validation_history`;
- `deck_export`.

Ownership is finite allocation, not an independent per-entry sum. Physical
copies from the selected collections are pooled at oracle-card level and
allocated once in the deterministic order commander, companion, mainboard,
then sideboard. Maybeboard entries show availability but reserve no copies.
Each line reports required, available, allocated, and missing quantities.
When a preferred printing and finish is selected, a separate exact-printing
available/allocated/missing calculation is returned.

Valuation uses only exact finish/currency price observations. Preferred-printing
value and missing-acquisition value remain nullable, and the response reports
unpriced entries, unpriced missing quantity, provider set, observation and
ingestion ranges, and stale-price count. A missing price is never represented
as zero.

Validation deterministically evaluates the pinned baseline configuration:
deck and zone size, sideboard/companion capacity, ordinary and restricted copy
limits, ingested legality, Commander count and color identity, and explicitly
advisory cases such as incomplete legality, bounded oracle copy exceptions,
and commander eligibility/pairing. At most 1,000 detailed issues are persisted
and returned, followed by an explicit truncation marker; complete
error/warning/information totals are retained.

Catalog browse and preferred-printing pages lock the deck and active catalog
pointer. Their opaque cursors bind the deck, current revision, catalog version,
and query-specific fields. The importer accepts at most 2,000 parsed names and
512 KiB of normalized PostgreSQL JSONB payload. Exact-name resolution is
set-based. Ambiguous candidate detail and fuzzy suggestions have published
work/output budgets, so all lines are classified without unbounded similarity
work.

### Authorization

RLS policies are:

- `deck_formats_select_admitted`;
- `deck_format_versions_select_admitted`;
- `decks_select_workspace`;
- `deck_entries_select_workspace`;
- `deck_inventory_sources_select_workspace`;
- `deck_revisions_select_workspace`;
- `deck_validation_runs_select_workspace`.

Anonymous access and ordinary direct writes are revoked. Authenticated users
receive the intended RLS-constrained table reads plus bounded function grants,
and every public function re-derives admission and membership. Private
preservation tables and helpers are revoked from `public`, `anon`,
`authenticated`, and `service_role`.

### Web implementation

The App Router surface uses server-side RPC loaders and strict unknown-response
parsers. Database IDs, timestamps, cursors, revisions, permissions, catalog
versions, rule versions, price evidence, and pagination coherence fail closed
when malformed. Safe request IDs are shown for support without exposing
database errors.

The deck list provides active/archived/all filtering, bounded pagination,
creation, duplication, archive, restore, and terminal delete controls. The
editor is a wide three-region catalog/deck/analysis layout and compact
catalog/deck/analysis tab layout. Every action has a click/tap path with a
minimum touch target; drag-and-drop is not required.

The editor includes:

- oracle-level catalog browse/search and add-to-zone controls;
- all five zone sections;
- quantity stepper and direct quantity, zone, note, remove controls;
- exact preferred-printing and finish selection;
- collection-source selection with unavailable/archived-source safeguards;
- persistent required/allocated/missing summary;
- preferred-printing value, acquisition estimate, unpriced, provider, and
  freshness evidence;
- deterministic validation issues and pinned rule/catalog evidence;
- settings, lifecycle, duplication, plain-text export, and stable JSON export.

Text import is request-local and does not persist the raw decklist. The parser
accepts section headers, comments, `N Card`, `Nx Card`, prefix zones, and suffix
zones; normalizes exact duplicate card/zone lines; and enforces 256 KiB and
2,000 physical-line limits before RPC work. Exact, ambiguous, and unresolved
rows receive an explicit review. Truncated ambiguity or unresolved rows block
commit. Confirmation performs one revision-guarded atomic replacement and
warns that entry notes and preferred-printing choices are replaced.

## Validation record

Database:

- `npx supabase db reset --local --no-seed` recreated a blank local database and
  applied every ordered migration through all five Phase 4 migrations;
- `npm run db:lint` passed with zero warnings;
- targeted Phase 4 pgTAP passed 182/182 assertions:
  - schema, formats, and surface: 36;
  - lifecycle, revisions, and mutations: 30;
  - preservation and browse contracts: 17;
  - ownership, valuation, and sources: 31;
  - validation versioning: 17;
  - maximum bounds and resolver: 25;
  - two-workspace RLS: 26;
- canonical `npm run test:supabase` passed 23 files and 622/622 assertions;
- maximum 2,000-entry revision, note snapshot, validation/truncation, resolver,
  and 50-deck list cases stayed within their published local limits;
- `npm run test:supabase:phase3-integration` passed the existing Storage and
  inventory concurrency regression;
- `npm run test:supabase:phase4-concurrency` passed same-revision writers,
  vanished-entry update/remove and remove/remove, post-wait archival,
  collection delete/source selection, opposite source orders, validation-cache
  creation, and catalog-promotion races;
- the Phase 4 harness correctly refused a fake non-loopback target with
  `phase4_integration_requires_disposable_loopback_database`;
- `npm run db:types` regenerated the public schema and
  `npm run db:types:check` passed.

Application and contracts:

- the focused deck web slice passed 7 files and 42/42 tests;
- full web Vitest passed 30 files and 179/179 tests;
- contract, domain, UI, and trusted-administration tests passed 7, 2, 11, and
  18 tests respectively, for 217 JavaScript/TypeScript tests total;
- canonical contract drift, schema/OpenAPI/SQLite validation, and generated
  contract type checks passed;
- web and root lint, strict TypeScript, formatting, canonical-manifest, and
  architecture checks passed;
- Python Ruff, format, and strict mypy passed; pytest reported 49 passed and 1
  expected environment-gated skip;
- the final Next.js production build compiled every list, editor, import, and
  export route;
- the full Edge desktop/Pixel 7 Playwright matrix passed 15 tests with 3
  intentional project-specific skips. The deck slice contributed 5 passes and
  1 intentional mobile HTTP-export skip;
- the expanded parallel matrix exposed a real pre-hydration catalog-filter
  interaction. The mobile trigger now stays natively disabled until React is
  attached; its server/client unit assertions pass, the original browser
  scenario passes, and five serial mobile repetitions pass;
- complete `npm run ci` passed against the final tree.

Repository hygiene:

- `git diff --check` passed;
- no merge markers, secrets, credentials, uploaded inputs, local databases,
  generated snapshots, build output, or unrelated files are included;
- no remote push, merge, hosted migration, deployment, or paid-provider call
  was performed.

## Routes

- `/app/decks` - bounded active/archived/all list, create, duplicate, archive,
  restore, and delete;
- `/app/decks/[deckId]` - responsive catalog, zone editor, source/settings,
  ownership, valuation, validation, lifecycle, and preferred-printing picker;
- `/app/decks/[deckId]/import` - bounded parse, resolve, review, and atomic
  replacement;
- `/app/decks/[deckId]/export` - private no-store plain-text attachment;
- `/app/decks/[deckId]/export?format=json` - private no-store stable JSON
  attachment.

Deterministic preview data covers active and archived lists, all three editor
surfaces, finite ownership across zones, exact preferred-printing ownership,
missing and unpriced state, incomplete legality, lifecycle confirmation,
import blocking/confirmation, exports, and wide/Pixel 7 overflow checks.

## Manual setup

No new hosted service, secret, provider credential, Storage bucket, Auth hook,
or paid API is required for Phase 4. Production still requires the Phase 1-3
human-managed setup and an imported active catalog with legalities and current
prices. Apply the migrations and generated database types through the normal
reviewed deployment workflow; no hosted migration or deployment was performed
in this phase.

## Deviations and blockers

- Validation is deliberately a versioned advisory baseline. It does not claim
  exhaustive Magic Comprehensive Rules, tournament policy, Commander
  eligibility, partner/background pairing, or every card-specific deckbuilding
  exception.
- The first seven format configurations are append-only application records,
  not a live rules feed. A future rules change requires a reviewed new version;
  existing decks remain pinned until explicitly changed.
- Plain-text import resolves exact oracle names automatically. Bounded fuzzy
  suggestions are informational only and never authorize an automatic card
  choice.
- Drag-and-drop, recommendation engines, EDHREC/marketplace integrations, AI,
  acquisition, and social features were not added.
- No remote push, merge, hosted migration, preview deployment, production
  deployment, or external paid-service call was performed.
- Final blockers: none. Production activation remains the manual work described
  below.

## Restart handoff

Start Phase 5 from the commit whose exact subject is
`phase 4: collection-aware deck builder`. Reconfirm branch and status, start
the local Supabase stack, and run the restart matrix in
`IMPLEMENTATION_STATUS.md`.

Phase 5 must reuse the Phase 3 inventory core for device mutations, use
digest-only device credentials independent from human Auth, implement the
versioned `/api/v1/device` contract, and extend the Python worker into a
deterministic private SQLite snapshot publisher. Do not create a second
inventory ledger, expose `app_private`, store raw credentials, or add robot
motion/execution state to the cloud.
