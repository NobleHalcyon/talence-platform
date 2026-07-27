# Talence implementation status and restart handoff

Last updated: 2026-07-26

Branch: `greenfield/platform-v1`

Current implementation milestone: Phase 3 validated; checkpoint preparation

Checkpoint state: Phases 0-2 are committed. Phase 3 implementation and its full
local validation matrix are green: database reset/lint/tests, Storage and
concurrency integration, generated types, root CI, production build, and the
final Edge desktop/mobile run all pass. The final root hygiene audit also
passes: no secrets, generated artifacts, unignored runtime data, conflicts, or
unrelated scope were found, and `git diff --check` is clean. Only the prescribed
local checkpoint commit remains.

Remote actions: none; nothing was pushed, merged, or deployed

## Checkpoint position

Committed lineage:

- base: `35be284` - `Initialize Talence greenfield platform`
- Phase 0: `211e438` - `phase 0: greenfield platform scaffold`
- Phase 1: `56cece3` - `phase 1: invite-only identity and workspace foundation`
- Phase 2: `2cc652c` - `phase 2: canonical catalog pricing and browse`

The required Phase 3 checkpoint is the commit containing this handoff and
`docs/dev-logs/phase-3.md` with the exact subject:

```text
phase 3: auditable collection inventory
```

Its SHA is intentionally resolved after the commit with
`git log -1 --oneline`; it is not embedded in the commit that defines it.

Do not begin Phase 4 changes until that checkpoint is clean. Detailed Phase 3
architecture, file groups, routes, functions, policies, test evidence, and the
remaining validation checklist are in `docs/dev-logs/phase-3.md`.

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

The validated and audited Phase 3 tree remains uncommitted only until the
prescribed checkpoint is created. Phases 4-6 are not implemented by this
checkpoint.

## Phase 3 architecture state

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
- Device credentials, `/api/v1/device`, robot snapshots, decks, and robot
  execution remain later-phase work. Phase 3 adds no remote motion control and
  no cloud robot execution state.

## Current verification evidence

The following evidence is green for the current Phase 3 tree:

- a blank `supabase db reset --local --no-seed` completed through all ordered
  migrations;
- database lint completed with zero warnings;
- the complete canonical pgTAP baseline passed: 16 files and 440/440
  assertions;
- Phase 3 pgTAP: 6 files and 163/163 assertions:
  - schema/API/grant surface: 32;
  - ledger/idempotency: 25;
  - maximum-import performance: 5;
  - transfer/reversal/lifecycle: 25;
  - import/read/summary/export/retention: 50;
  - two-workspace RLS: 26.
- The final 5,000-row maximum import measurement was approximately 850 ms
  against a five-second ceiling. The preceding query/ledger optimization
  improved this path by about 33 times.
- The schema/function-signature/grant catalog assertions match the intended
  Phase 3 surface.
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
- The complete root `npm.cmd run ci` chain passes, including canonical-manifest
  and architecture guards, formatting, lint, strict TypeScript, contracts,
  Python quality/type/tests, and the production build.
- JavaScript/TypeScript tests total 174 passing:
  - web Vitest: 23 files and 136 tests;
  - contracts: 7;
  - domain: 2;
  - UI: 11;
  - trusted administration: 18.
- Contract validation passes.
- Python Ruff and strict mypy pass; pytest reports 49 passed and 1 expected
  environment-gated skip.
- The final Next.js production build passes.
- The final Playwright matrix on Edge is 10 passed and 2 intentional
  project-specific skips. The HTTP CSV contract runs once because it is
  viewport-independent; the existing catalog phone smoke runs only in the
  mobile project.
- `npm run db:types` regenerated the database surface and
  `npm run db:types:check` passes.
- Final hygiene audit: `git diff --check` is clean, and no secrets, generated
  artifacts, unignored runtime data, merge conflicts, or unrelated changes were
  found.
- The Phase 1 `120_phase_1_workspace_rls_and_owner_invariants` regression was
  updated to assert the Phase 3 database-owned default-collection archive
  guard.

Historical Phase 2 evidence remains in `docs/dev-logs/phase-2.md`: 152/152
targeted Phase 2 pgTAP assertions, 277/277 full baseline assertions, 86 web
tests, 50 worker tests, and the responsive browser matrix. Phase 1 history
remains in `docs/dev-logs/phase-1.md`.

## Final root step before the Phase 3 checkpoint

Implementation validation and repository hygiene are green. If the tree is
unchanged, create the prescribed local checkpoint commit containing both
handoff documents.

The current document intentionally does not claim that the checkpoint commit
has been created.

## Restart procedure

From a fresh PowerShell terminal:

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -4 --oneline
docker version
npx supabase start
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run test:supabase:phase3-integration
npm run db:types
npm run db:types:check
npm run ci
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
git diff --check
```

Expected branch: `greenfield/platform-v1`. The latest committed checkpoint is
Phase 2 at `2cc652c`; a dirty Phase 3 worktree is expected until the checkpoint
is created.

Docker Desktop is installed per-user. If a VS Code process does not inherit its
PATH, reopen the integrated terminal or temporarily run:

```powershell
$env:Path = "C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
```

When `supabase/config.toml` changes, use `npx supabase stop` followed by
`npx supabase start`; a database reset alone does not recreate Auth container
environment variables.

If the tree is unchanged, the validation commands and final hygiene audit above
are already green. Create the commit containing these handoff documents
exactly:

```text
phase 3: auditable collection inventory
```

Resolve its SHA afterward with `git log -1 --oneline`; no pre-commit SHA edit is
required.

Do not push, merge, deploy, or start Phase 4 before the local checkpoint exists.

## Route handoff

The Phase 3 browser surface is:

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

## Phase 4 handoff

After the Phase 3 checkpoint, implement the collection-aware deck builder:

1. Add versioned format/rule configuration for Standard, Pioneer, Modern,
   Legacy, Vintage, Pauper, and Commander.
2. Add workspace-scoped decks, immutable revisions, zones, exact entries, and
   source/import provenance.
3. Enforce allocation without double-counting owned copies across deck zones;
   maybeboard does not consume allocated inventory.
4. Add deterministic validation bound to a catalog/rule version, with advisory
   warnings where legality, companion, or pairing data is incomplete.
5. Report ownership shortfall separately from preferred-printing shortfall and
   value only the exact selected finishes.
6. Add bounded text import, responsive editor, revisions, filters, and
   workspace/RLS/transactional tests.
7. Validate and checkpoint exactly:
   `phase 4: collection-aware deck builder`.

Preserve Phase 3 ledger APIs as the single inventory authority; deck allocation
must not mutate physical balances.

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
  artifact in source control;
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
