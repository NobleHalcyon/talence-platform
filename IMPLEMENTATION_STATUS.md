# Talence implementation status and restart handoff

Last updated: 2026-07-27

Branch: `greenfield/platform-v1`

Current implementation milestone: Phase 5 complete

Checkpoint state: Phases 0-4 and the Phase 5 foundation are committed. Phase 5
is fully implemented and validated. The commit containing this document uses
the prescribed subject `phase 5: device API and robot catalog snapshot`;
resolve its SHA after commit. Phase 6 has not started.

Remote actions: none; nothing was pushed, merged, or deployed

## Checkpoint position

Committed lineage:

- base: `35be284` - `Initialize Talence greenfield platform`
- Phase 0: `211e438` - `phase 0: greenfield platform scaffold`
- Phase 1: `56cece3` - `phase 1: invite-only identity and workspace foundation`
- Phase 2: `2cc652c` - `phase 2: canonical catalog pricing and browse`
- Phase 3: `d819a17` - `phase 3: auditable collection inventory`
- Phase 4: `905deaf` - `phase 4: collection-aware deck builder`
- Phase 5 foundation: `6557191` -
  `phase 5 checkpoint: device API and snapshot foundations`
- Phase 5: this commit - `phase 5: device API and robot catalog snapshot`

Detailed architecture, file groups, routes, functions, policies, and test
evidence are in the corresponding `docs/dev-logs/phase-*.md` files. The Phase 6
resume state is in `IMPLEMENTATION_PROGRESS.md` and `RESTART_HANDOFF.md`.

## Completed from the master build prompt

### Phase 0

- npm workspaces, strict TypeScript, an exact lockfile, and CI;
- Next.js App Router shell with CSS Modules and shared Talence tokens;
- shared domain, UI, and generated/validated contract packages;
- Python 3.13 fixture-first catalog-worker foundation;
- local Supabase and pgTAP harness;
- responsive public, authentication, and application route shells;
- Windows-first setup and preliminary production documentation.

### Phase 1

- private invitation/admission schemas and `app_private.invited_users`;
- profiles, platform roles, workspaces, memberships, preferences, games, and a
  minimal default collection;
- Before User Created hook with least-privilege grants;
- atomic/idempotent admission finalization and safe reactivation;
- immediate and deferred final-owner protection;
- default-deny RLS and active membership/role helpers;
- service-role-only, actor-verifying invitation administration RPCs;
- generated Supabase types and drift checking;
- login, logout, recovery, reset, invitation callback/completion, and CAPTCHA
  integration points;
- platform-admin invitation UI and trusted bootstrap/invitation CLI;
- pgTAP, unit, and browser regression coverage;
- hosted Auth, SMTP, CAPTCHA, environment, and first-admin setup instructions.

### Phase 2

- normalized sets, oracle cards, printings, ordered faces, legalities, external
  IDs, current prices, source files, import runs, catalog state, and private
  staging;
- bounded PostgreSQL full-text/trigram browse, deterministic cursor
  pagination, exact detail/status RPCs, and catalog RLS;
- worker lease, replay, validation, failure, retention, sync-switch, and atomic
  promotion behavior;
- Python 3.13 Scryfall discovery/download/import with fixture-only validation;
- authenticated catalog browse/detail routes and platform-admin health/queue
  UI;
- explicit missing-price and provider/freshness presentation;
- database, worker, web, and responsive browser regression coverage.

### Phase 3 implemented surface

- workspace-scoped collection lifecycle with cover printing, archive, restore,
  constrained soft deletion, default-collection protection, and
  server-derived permissions;
- exact physical balances keyed by collection, printing, finish, and condition;
- immutable inventory transaction headers and lines with guarded materialized
  balances;
- canonical request hashing, mandatory idempotency keys, replay results,
  body-hash conflict detection, optimistic quantity guards, and negative-balance
  rejection;
- paired atomic transfers and compensating full reversals without rewriting
  prior history;
- bounded collection list, detail, inventory, summary, analytics, history,
  exact-line, and canonical export RPCs;
- finish-specific valuation with currency, provider, observed/ingested times,
  stale state, and explicit unpriced quantity;
- private, bounded, replay-safe CSV staging with deterministic exact matching,
  explicit ambiguity resolution, atomic commit, cancellation, error report,
  and service-only retention coordination;
- exact private Storage path and metadata binding with editor insert/read,
  denied ordinary overwrite/delete, and service cleanup;
- `/app/collections` list/create/lifecycle UI;
- structured, gallery, and analytical collection views with compact quantity
  editing, bulk actions, transfer controls, valuation, and filters;
- catalog-to-collection exact-printing controls;
- immutable history, paged exact transaction lines, and authorized reversal;
- resumable import review plus safe streamed error and inventory CSV routes;
- deterministic desktop/mobile preview coverage and explicit loading, empty,
  malformed, conflict, permission, and unavailable states;
- pgTAP, true multi-session concurrency, local Auth/Storage integration,
  Vitest, build, lint, typecheck, and Playwright coverage.

### Phase 4 implemented surface

- seven append-only, versioned MTG format baselines for Standard, Pioneer,
  Modern, Legacy, Vintage, Pauper, and Commander;
- workspace-scoped decks, all five zones, oracle-card entries, optional exact
  preferred printing/finish, ordered collection sources, immutable revisions,
  and immutable validation evidence;
- revision-guarded create, edit, duplicate, archive, restore, terminal delete,
  source, entry, and bounded bulk-replacement functions;
- deck/catalog generation locking, post-wait admission/lifecycle/entry checks,
  sorted collection advisory locks, and inactive-identity preservation that
  cannot be forged by an ordinary caller;
- finite collection allocation without double-counting, separate exact
  preferred-printing shortfall, exact-finish valuation, explicit unpriced
  state, and provider/freshness evidence;
- deterministic advisory validation pinned to the exact content hash, format
  version, and catalog version, with full summary totals and bounded detailed
  issues;
- bounded catalog/printing browse, revision and validation history, text-import
  resolution, and stable text/JSON export;
- default-deny RLS for all seven exposed deck tables and function-mediated
  writes;
- `/app/decks`, responsive three-surface/compact-tab deck editor, all lifecycle
  and click/tap controls, preferred-printing chooser, collection-source
  selection, reviewed text import, and private no-store export;
- clean pgTAP, multi-session race, Vitest, root CI, production-build, and Edge
  desktop/mobile coverage.

### Phase 5 implemented surface

- workspace-scoped devices, digest-only credentials, explicit collection
  grants, immutable sync batches and run summaries, catalog snapshots,
  idempotency records, feature policies, and usage windows;
- owner/admin device administration, credential lifecycle, grant replacement,
  bounded reads, default-deny RLS, and least-privilege function grants;
- atomic device inventory batches through the Phase 3 immutable ledger,
  idempotent run summaries, quota consumption, and deterministic snapshot
  publication with current/previous compatibility;
- all six canonical `/api/v1/device` routes with strict Bearer authentication,
  bounded canonical requests/responses, safe request IDs/errors, and prohibited
  robot-state rejection;
- responsive device registration/list/detail/grant/lifecycle UI with one-time
  credential display;
- deterministic populated SQLite generation, FTS, integrity/checksum/size
  verification, immutable local/Supabase Storage abstractions, publication, and
  reference installation;
- full SemVer prerelease precedence and exact configured
  origin/bucket/object-path signed-URL binding;
- guarded multi-session inventory/run/lifecycle/credential/grant/quota/snapshot
  concurrency;
- real private Supabase Storage create-only upload, signed download, reference
  install, anonymous denial, and previous-snapshot retention;
- real invitation/Auth/profile/RLS/RPC browser administration and all-route
  HTTP composition;
- live canonical OpenAPI and JSON Schema conformance, including replay,
  conflict, unknown-printing, credential-revocation, and suspension outcomes;
- database, web, worker, production-build, clean local integration, and
  desktop/mobile preview validation.

Phase 5 has no remaining implementation item. Phase 6 has not started.

## Current architecture state

- Human authentication remains Supabase Auth through `@supabase/ssr`; there is
  still no public registration route, public `signUp`, Talence password store,
  or custom human session.
- `app_private` and `app_api` remain outside the exposed Data API schemas.
- Phase 3 adds `inventory_import_jobs`, `inventory_transactions`,
  `inventory_transaction_lines`, `inventory_balances`, and
  `inventory_import_rows` as exposed RLS tables, plus private value-tier and
  canonical-operation state.
- Ordinary roles have no direct ledger/balance write grants. Inventory changes
  cross security-definer RPCs that derive the authenticated actor and active
  workspace role, lock exact balance keys, write an immutable header/line set,
  and update materialized balances in the same database transaction.
- Idempotency identity is collection/workspace scoped and bound to normalized
  operation content. Identical requests replay the stored result; conflicting
  reuse fails deterministically.
- Transfers create paired headers under one transfer group. Reversal appends a
  compensating transaction and cannot target another reversal or partially
  reverse a transfer pair.
- Collection reads are bounded and cursor-scoped. Inventory, analytics,
  history, line details, and exports do not return unbounded nested printing
  payloads.
- Price estimates use only an exact finish-specific current observation.
  Missing observations stay missing, never zero, and every priced amount
  carries source and freshness.
- Import files are capped at 2 MiB and 5,000 data rows. The web stages at most
  500 rows and 512 KiB of serialized UTF-8 JSON per call. Database staging
  rechecks the exact private Storage object before completion and again before
  commit.
- Imported names produce candidates only; automatic acceptance requires stable
  provider printing identity or exact set/collector/language identity. The
  complete included import commits as one additive inventory transaction.
- Storage permits an authorized editor to insert the exact owned
  `workspace/job/source.csv` object and read it. Ordinary update, upsert, and
  delete have no policy. A service process deletes expired objects before
  marking their database jobs purged.
- The web uses semantic shared collection components, URL-backed views and
  filters, streamed CSV responses, and CSS Modules. No paid provider call runs
  in browser code.
- Deck entries are requirements, not inventory mutations. Ownership is a
  deterministic finite projection over the Phase 3 ledger and never reserves
  or changes physical balances.
- Deck mutations lock the deck and catalog pointer, compare an exact revision
  before and after waits, and append one coherent immutable revision.
- Existing inactive catalog identities may be preserved only inside the exact
  private transaction/backend context created by trusted mutations; new or
  changed identities must be active.
- Collection deletion and source selection serialize on the same canonical
  advisory scope. Opposite source orders acquire UUID-sorted locks.
- Validation is an advisory, versioned baseline. It never claims exhaustive
  Comprehensive Rules, tournament-policy, partner/background, companion, or
  card-specific exception coverage.
- Deck list, detail, catalog browse, chooser, histories, import resolution, and
  export are bounded. Opaque cursors bind the relevant deck revision, catalog
  generation, and query fields.
- The responsive editor uses shared semantic components and CSS Modules; every
  action has a click/tap control.
- Device credentials remain independent from human Auth: only a server-peppered
  HMAC digest is stored and the raw credential is shown once. The six
  `/api/v1/device` routes and deterministic robot snapshot foundation are
  implemented and live-validated in the complete Phase 5 checkpoint.
- Snapshot generation is reproducible for one catalog version. Provider
  observation is normalized to version second precision; mutable worker
  download/promotion times do not alter immutable artifact bytes.
- There is still no remote motion control or cloud robot execution state.

## Current verification evidence

The complete Phase 5 checkpoint has the following green evidence:

- blank local database reset through all five Phase 5 migrations;
- database lint with zero warnings;
- 28 pgTAP files and 754 assertions;
- current generated database and contract types;
- complete root CI, with 38 web files/223 tests, contracts/domain/UI/admin
  suites at 7/2/11/18, 83 ordinary worker tests, Python quality/type checks,
  canonical/architecture guards, and the production build;
- two guarded worker PostgreSQL integrations passing;
- Phase 3 Storage/inventory and Phase 4 deck concurrency regressions passing;
- the Phase 5 multi-session device/snapshot concurrency harness passing;
- real private Storage publication/sign/download/reference-install retention
  passing;
- real non-preview invitation/Auth/admin/RLS/RPC and all-six-route OpenAPI/JSON
  Schema conformance passing;
- device preview Playwright 4/4 in desktop and mobile Chromium;
- final repository whitespace, generated-artifact, and secret hygiene checks.

The worker integration exposed and fixed a real reproducibility defect:
mutable download and price-ingestion timestamps could previously change the
SQLite bytes for an unchanged catalog version. Snapshot generation now uses
the immutable provider observation encoded in the version and covers
fractional-source normalization.

Historical Phase 4 evidence remains green:

- a blank `supabase db reset --local --no-seed` completed through all ordered
  migrations, including all five Phase 4 migrations;
- database lint completed with zero warnings;
- the complete canonical pgTAP baseline passed: 23 files and 622/622
  assertions;
- Phase 4 pgTAP passed 182/182 assertions:
  - schema, formats, and surface: 36;
  - lifecycle, revisions, and mutations: 30;
  - preservation and browse contracts: 17;
  - ownership, valuation, and sources: 31;
  - validation versioning: 17;
  - maximum bounds and resolver: 25;
  - two-workspace RLS: 26.
- The maximum-entry/revision, maximum-note snapshot, 2,000-failure validation,
  2,000-line resolver, and 50-deck list cases all remained inside their
  published local budgets and storage bounds.
- The schema/function-signature/grant catalog assertions match the intended
  Phase 4 surface.
- `npm run test:supabase:phase3-integration` passes:
  - exact editor Storage upload/download;
  - viewer read and wrong-path write denial;
  - duplicate insert, upsert, and ordinary delete denial;
  - service cleanup;
  - identical same-key concurrency with one commit and one replay;
  - conflicting same-key concurrency with one winner and one deterministic
    conflict;
  - distinct-key concurrency against the same absent balance with no lost
    update.
- The integration harness refuses non-loopback database or API targets unless
  `TALENCE_ALLOW_HOSTED_PHASE3_INTEGRATION=1` is set. The guarded local rerun
  passes, and a fake hosted-target refusal check passes.
- `npm run test:supabase:phase4-concurrency` passes:
  - one winner and one stale rejection for same-revision writers;
  - vanished entry update/remove and remove/remove reject after waiting;
  - an archived deck rejects the waiting active-only mutation;
  - collection delete/source selection has one coherent winner;
  - opposite source orders both commit without deadlock or priority loss;
  - concurrent validation returns one persisted cache row;
  - catalog promotion finishes before identity validation, preventing a
    mixed-generation revision.
- The Phase 4 harness is unconditionally restricted to a disposable loopback
  PostgreSQL database. A fake non-loopback target correctly fails with
  `phase4_integration_requires_disposable_loopback_database`.
- The complete root `npm run ci` chain passes, including canonical-manifest
  and architecture guards, formatting, lint, strict TypeScript, contracts,
  Python quality/type/tests, and the production build.
- JavaScript/TypeScript tests total 217 passing:
  - web Vitest: 30 files and 179 tests;
  - contracts: 7;
  - domain: 2;
  - UI: 11;
  - trusted administration: 18.
- The focused Phase 4 web contract/UI slice passes 42/42 tests across seven
  files.
- Contract validation passes.
- Python Ruff and strict mypy pass; pytest reports 49 passed and 1 expected
  environment-gated skip.
- The final Next.js production build passes and includes all deck list, editor,
  import, and export routes.
- The final Playwright matrix on Edge is 15 passed and 3 intentional
  project-specific skips across desktop and Pixel 7 projects. The deck slice is
  5 passed and 1 intentional mobile HTTP-export skip. The catalog hydration
  regression also passes five serial mobile repetitions.
- `npm run db:types` regenerated the database surface and
  `npm run db:types:check` passes.
- Final hygiene audit: `git diff --check` is clean, and no secrets, generated
  artifacts, unignored runtime data, merge conflicts, or unrelated changes were
  found.

Historical Phase 1-3 evidence remains in the corresponding phase logs,
including the Phase 3 163/163 targeted pgTAP assertions and guarded
Storage/concurrency harness.

## Phase 5 checkpoint result

The complete device/database/API/private-Storage/snapshot/reference-client
surface and its clean validation passed. This document is included in
`phase 5: device API and robot catalog snapshot`; resolve its SHA from
`git log`.

Phase 6 private-beta hardening and delivery is the next implementation phase.

## Restart procedure

From a fresh PowerShell terminal:

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -5 --oneline
docker version
npx supabase start
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
npm run test:phase5:local
npm run db:types
npm run db:types:check
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests\test_database_integration.py services\catalog-worker\tests\test_snapshot_database_integration.py -q
npm run ci
npm run test:e2e --workspace @talence/web -- devices-preview.spec.ts
git diff --check
```

Expected branch: `greenfield/platform-v1`. The latest commit is the complete
Phase 5 checkpoint with subject
`phase 5: device API and robot catalog snapshot`; resolve its SHA from
`git log -1 --oneline`.

Docker Desktop is installed per-user. If a VS Code process does not inherit its
PATH, reopen the integrated terminal or temporarily run:

```powershell
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
```

When `supabase/config.toml` changes, use `npx supabase stop` followed by
`npx supabase start`; a database reset alone does not recreate Auth container
environment variables.

The integration and concurrency harnesses mutate the disposable local
database; reset before a later transactional pgTAP rerun. Do not push, merge,
or deploy without fresh explicit authorization.

## Route handoff

The Phase 3 collection surface remains:

- `/app/collections` - active/archived list, pagination, create form, and
  lifecycle permissions;
- `/app/collections/[collectionId]` - summary plus structured, gallery, and
  analytical inventory views;
- `/app/collections/[collectionId]/history` - bounded immutable transaction
  headers and reversal controls;
- `/app/collections/[collectionId]/history/[transactionId]` - bounded exact
  transaction-line paging;
- `/app/collections/[collectionId]/import` - bounded upload, staging, review,
  resolution, resume, commit, and cancel;
- `/app/collections/[collectionId]/import/[importJobId]/errors` - streamed safe
  CSV error report;
- `/app/collections/[collectionId]/export` - streamed canonical inventory CSV;
- catalog browse and exact printing detail - add-to-collection controls.

Deterministic preview mode exercises collection list status filtering, compact
quantity editing, structured/gallery/analytical switches, history/reversal
dialog, exact-line detail, staged matched/ambiguous/rejected CSV rows, safe
export, and no-horizontal-overflow checks on desktop and Pixel 7 viewports.

The Phase 4 deck surface is:

- `/app/decks` - bounded active/archived/all list, create, duplicate, archive,
  restore, and terminal delete;
- `/app/decks/[deckId]` - responsive catalog, five-zone editor, source/settings,
  ownership, valuation, validation, lifecycle, history evidence, and
  preferred-printing picker;
- `/app/decks/[deckId]/import` - bounded parse, resolve, explicit review, and
  atomic replacement;
- `/app/decks/[deckId]/export` - private no-store plain-text attachment;
- `/app/decks/[deckId]/export?format=json` - private no-store stable JSON
  attachment.

Deterministic preview mode covers deck list filters and lifecycle, all three
editor surfaces, all five zones, finite and preferred ownership, missing and
unpriced state, validation summaries and truncation, import review, exports,
and no-horizontal-overflow checks on desktop and Pixel 7 viewports.

## Phase 5 handoff

The database, administration, stable API, snapshot/reference client, real
private Storage, concurrency, SemVer, signed-URL binding, and live contract
composition are complete and checkpointed. There is no remaining Phase 5
implementation item.

Continue with the full Phase 6 private-beta hardening and delivery acceptance
criteria in `IMPLEMENTATION_PROGRESS.md` and `RESTART_HANDOFF.md`. Preserve the
Phase 3 ledger as the only balance authority and keep all robot
motion/execution state off cloud.

## Manual production setup still remaining

Phase 1 hosted Auth setup is implemented and documented but not executed:

- hosted migrations and Before User Created hook activation;
- exact Site URL and typed callback allowlist;
- invite/recovery email templates, SMTP, deliverability records, Auth limits,
  and Turnstile/CAPTCHA;
- WAF rules, Vercel/Supabase environment values, invitation enablement, and
  first-admin bootstrap.

Phase 2 catalog production work is implemented but not activated:

- protected worker database secret and contact-bearing User-Agent;
- operator-reviewed fixture and first live import;
- catalog count/provenance/search/detail/RLS acceptance;
- deliberate sync and queue enablement plus protected workflow scheduling.

Phase 3 production activation remains human-controlled:

- apply migrations and regenerated types to hosted development first;
- verify private bucket policies, object metadata, retention cleanup, and
  service coordination;
- exercise viewer/editor/manager/owner behavior, conflict handling, import,
  transfer, reversal, valuation provenance, and export with non-production
  data;
- retain no source CSV, report, credential, snapshot, or local database
  artifact in source control.

Phase 4 production activation remains human-controlled:

- apply the five migrations and regenerated types to hosted development through
  the reviewed deployment workflow;
- verify the seven seeded format baselines, RLS roles, lifecycle permissions,
  revision conflicts, collection-source guards, and catalog-promotion locking
  with non-production workspaces;
- import an active catalog with legality and current-price evidence before
  evaluating ownership, value, and advisory validation acceptance;
- verify desktop and compact deck editing, reviewed text import, private
  exports, missing/unpriced presentation, and safe error/request-ID behavior;
- keep format changes append-only and require explicit review before repinning
  existing decks.

Phase 5 production activation remains human-controlled:

- configure the server-only credential pepper and worker database/Storage
  credentials;
- apply the reviewed migrations and private `catalog-snapshots` bucket to
  hosted development;
- choose feature-policy limits and signed-URL lifetime;
- run the first reviewed snapshot upload/publication and hosted device fixture
  flow.

Before private-beta production activation:

- complete Phase 6 backup/restore, monitoring, quota, incident, security, and
  deployment controls before private-beta production activation.

See `docs/operations/production-setup.md`.

## Constraints to preserve

- Do not push, merge, or deploy without fresh explicit authorization.
- Do not introduce public registration, custom human password/session storage,
  anonymous application data, Tailwind, browser-paid-service calls, remote
  robot motion, or cloud robot execution state.
- Keep every mutable resource workspace-scoped and every exposed table under
  default-deny RLS.
- Inventory changes must pass only through immutable transaction functions.
- Device secrets must be independent, scoped, revocable, digest-only, and
  idempotent for inventory writes.
- Missing prices are never zero; every displayed price retains source and
  freshness.
- Keep build output, local databases/snapshots, downloaded bulk data, caches,
  `.env` files, uploaded CSVs, and credentials out of commits.
