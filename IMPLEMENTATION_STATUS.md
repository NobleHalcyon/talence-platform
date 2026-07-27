# Talence implementation status and restart handoff

Last updated: 2026-07-26

Branch: `greenfield/platform-v1`

Current implementation milestone: Phase 2

Checkpoint state: Phase 2 implementation and validation are complete; the
Phase 2 checkpoint is the commit containing this file

Remote actions: none; nothing was pushed, merged, or deployed

## Checkpoint state

The clean-sheet Phase 0 scaffold, Phase 1 invite-only identity/workspace
foundation, and Phase 2 canonical catalog/pricing/browse slice are implemented.
The Phase 2 checkpoint must use the required subject:

```text
phase 2: canonical catalog pricing and browse
```

Commit lineage:

- base: `35be284` - `Initialize Talence greenfield platform`
- Phase 0: `211e438` - `phase 0: greenfield platform scaffold`
- Phase 1: `56cece3` - `phase 1: invite-only identity and workspace foundation`
- Phase 2: resolve after the final validation run and commit with
  `git log -1 --oneline`

Detailed evidence, file groups, migrations, policies, route descriptions,
commands, manual setup, and risks are preserved in
`docs/dev-logs/phase-1.md` and `docs/dev-logs/phase-2.md`.

## Completed from the master build prompt

### Phase 0

- npm workspaces, strict TypeScript, exact lockfile, and CI;
- Next.js App Router shell with CSS Modules and shared Talence tokens;
- shared domain, UI, and generated/validated contract packages;
- Python 3.13 fixture-first catalog-worker foundation;
- local Supabase and pgTAP harness;
- responsive public/auth/application route shells;
- Windows-first setup and preliminary production documentation.

### Phase 1

- private invitation/admission schemas and `app_private.invited_users`;
- profiles, platform roles, workspaces, memberships, workspace-invitation
  foundation, preferences, games, and minimal default collections;
- Before User Created hook with least-privilege grants;
- atomic/idempotent admission finalization and safe first-acceptance
  reactivation;
- immediate and deferred final-owner protection;
- default-deny RLS and active membership/role helpers;
- service-role-only, actor-verifying invitation administration RPCs;
- generated Supabase database types and CI drift checking;
- login, logout, recovery, reset, invitation callback/completion, and
  production CAPTCHA integration points;
- active admission/profile/workspace application guard and workspace context;
- profile/settings and workspace selection basics;
- platform-admin invitation issue/resend/revoke/status UI;
- trusted first-admin, invite, revoke, and status CLI;
- safe normalized provider/database exception boundaries;
- pgTAP admission, replay, RLS, owner, defaults, grants, and admin-transition
  regression coverage;
- exact hosted hook, email template, SMTP, CAPTCHA, rate-limit, environment, and
  first-admin setup instructions.

### Phase 2

- normalized sets, oracle cards, printings, ordered faces, legalities, external
  IDs, current prices, source files, import runs, catalog state, and private
  staging;
- PostgreSQL full-text/trigram search with bounded filters, deterministic sort,
  version-scoped cursor pagination, index-backed candidate unions, and
  detail/status RPCs;
- admitted-user, active-row, read-only catalog RLS and default-deny operational
  and price table access;
- service-role-only, platform-admin-verifying catalog status/queue RPCs;
- worker source registration, unchanged-active-source no-op, heartbeats,
  expired-lease recovery, validation, live truncation floor, terminal staging
  retention, in-flight sync-switch enforcement, failure recording, and
  advisory-locked atomic promotion;
- replay-safe queued active-source reconciliation that avoids a bulk download
  only for an unforced confirmed match;
- Python 3.13 Scryfall `all_cards` discovery, official-host streaming download,
  byte/SHA guards, incremental parsing, set dependency identity, bounded batch
  writes, printing-level non-oracle color identity, and fixture-only mode;
- worker `validate`, `fixture-import`, `live-import`, and `status` commands;
- manual fixture-validation workflow with the live job, secrets, and schedule
  deliberately disabled;
- authenticated `/app/catalog` URL search/filter/sort/cursor browsing in table
  and grid modes with English default browsing, explicit `lang=all`
  broadening, and a responsive filter drawer;
- card, printing, and set detail routes with multi-face support, direct provider
  imagery, bounded variants, and missing-price behavior;
- provider/currency/finish plus observed, ingested, and stale price display;
- platform-admin catalog health, failure, and queue UI that never imports in the
  web request;
- database, worker, web, and phone-preview regression coverage.

Phases 3-6 are not part of the Phase 2 checkpoint.

## Architecture state

- `apps/web` owns human routes and uses `@supabase/ssr`; authenticated routes
  require verified claims plus `current_user_context()` admission.
- Supabase Auth owns human passwords and sessions. Talence has no public
  registration route, public `signUp`, password store, or custom session.
- `app_private` and `app_api` are not exposed Data API schemas. The hook is
  executable only by `supabase_auth_admin`; public admin wrappers are
  service-role-only and verify an active platform-admin actor.
- All exposed Phase 1 and Phase 2 tables have RLS. Anonymous users have no
  application-data grants; mutable workspace resources remain database-owned.
- Admission acceptance provisions an active profile, personal workspace, owner
  membership, preferences, and default MTG collection in one database
  transaction.
- Web and CLI invitation flows create the ledger row before Auth Admin and use
  compensating cleanup/reconciliation for the unavoidable cross-system
  boundary.
- The active global catalog is system-written. Admitted users may read active
  identity rows, while prices and operational state cross bounded RPCs with
  provenance/freshness; ordinary users receive no catalog write path.
- Worker staging lives in `app_private`. Source identity covers both literal
  `all_cards` bytes and consumed set metadata; validated promotion is atomic and
  preserves the prior active catalog on failure.
- Catalog sync has two deliberate controls: the database
  `catalog_state.sync_enabled` switch governs import/queue functions, and the
  server-only `FEATURE_CATALOG_SYNC_ENABLED` switch governs web queueing.
- The worker rechecks the database switch on heartbeat and promotion. An
  in-flight closure fails the run with stable `sync_disabled` state and cannot
  replace the active catalog.
- `packages/contracts` remains the machine-contract authority; generated
  database types provide compile-time table/RPC checking in the web app.
- Inventory, decks, device credentials/API, and robot snapshots remain future
  checkpoint work. No remote robot control or cloud execution state was
  introduced.

## Verification snapshot

Stable Phase 2 evidence:

- the complete root `npm.cmd run ci` chain passed at the Phase 2 integration
  point;
- web Vitest: 17 files and 86 tests;
- contracts 7, domain 2, UI 11, and trusted administration 18 tests;
- web ESLint, strict TypeScript, targeted Prettier, and production build;
- Playwright system Edge: 5 passed and 1 expected desktop-only preview skip;
- final worker Ruff, format, strict mypy, and database-enabled pytest: 50/50
  passed;
- direct worker CLI/database forced fixture promotion and unchanged-source
  replay passed with 0 rejected records;
- blank local database reset passed;
- database lint passed with zero issues;
- targeted Phase 2 pgTAP: 5 files and 152/152 passed across schema/surface 40,
  import/hardening 58, browse/admin 36, RLS 14, and performance 4 assertions;
- representative cold 50,000-printing search improved from 5,558.6 ms to
  109.370 ms with the index-backed candidate-union query, and the final full
  run measured 120.402 ms;
- full pgTAP: 10 files and 277/277 assertions;
- final generated Supabase database types and drift check passed;
- focused post-review catalog URL tests: 11/11, plus web typecheck, focused
  ESLint, Prettier, and `git diff --check`.

Phase 1's final baseline remains preserved in `docs/dev-logs/phase-1.md`: five
pgTAP files and 125 assertions, 94 JavaScript unit tests, and 4 browser smoke
flows.

## Local Supabase and Docker note

Docker Desktop 4.83.0 / Engine 29.6.2 is installed per-user and the local
Supabase stack is healthy. A VS Code process opened before reinstall may not
inherit Docker's new PATH. Reopen the integrated terminal or temporarily run:

```powershell
$env:Path = "C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
```

When `supabase/config.toml` changes, use `npx supabase stop` then
`npx supabase start`; `db reset` alone does not recreate Auth container
environment variables.

## Restart procedure

From a fresh PowerShell terminal:

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -2 --oneline
docker version
npx supabase start
npx supabase db reset
npm run db:lint
npm run db:types:check
npm run test:supabase
npm run ci
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
```

Expected branch: `greenfield/platform-v1`. The Phase 1 checkpoint is
`56cece3`. If the Phase 2 checkpoint commit has not yet been
created, finish the open validation commands in `docs/dev-logs/phase-2.md`,
update the final counts, run `git diff --check`, and commit exactly:

```text
phase 2: canonical catalog pricing and browse
```

After the commit, record its SHA in this file and the Phase 2 dev log. Then
continue the attached master build prompt with Phase 3, first rereading root
`AGENTS.md`, all files under `docs/canonical/`, this file, and
`docs/dev-logs/phase-2.md`.

## Phase 3 handoff

Implement the auditable collection-inventory vertical slice next:

1. Add collections, inventory balances, immutable transactions/lines, import
   jobs, and staged import rows.
2. Add atomic inventory transaction, transfer, and reversal functions with
   mandatory idempotency keys and body-hash conflict detection.
3. Enforce workspace role behavior through RLS and deny ordinary direct
   balance/history mutation.
4. Build collection list/create/archive/restore/delete, structured/gallery/
   analytical views, exact printing/finish/condition quantity flows, bulk
   actions where canonical P1, transaction history, and reversal.
5. Add valuation, finish/condition/value breakdowns, unpriced counts, and price
   freshness using the Phase 2 catalog price surface.
6. Add strictly bounded CSV upload, stage/preview matched/ambiguous/rejected
   rows, no silent name-only matching, one-transaction commit, error report, and
   safe CSV export.
7. Add mandatory concurrency/idempotency tests plus responsive compact/mobile
   editing coverage.
8. Update `docs/dev-logs/phase-3.md`, refresh this handoff, run all validation,
   and commit exactly:
   `phase 3: auditable collection inventory`.

## Manual production setup still remaining

Phase 1 hosted setup is implemented and documented but not executed:

- hosted migration application and hook activation;
- exact Site URL and typed callback allowlist;
- server-readable invite/recovery email templates;
- production SMTP and deliverability records;
- Auth rate limits and Turnstile/CAPTCHA;
- WAF rules and Vercel/Supabase environment values;
- deliberate invitation feature enablement and first-admin bootstrap.

Phase 2 production work is also implemented but not activated:

- hosted catalog migrations and generated-type verification;
- protected worker database secret and real contact-bearing User-Agent;
- deliberate database sync-switch control;
- non-production fixture promotion and first operator-reviewed live import;
- catalog count/provenance/search/detail/RLS acceptance;
- server queue feature enablement only when a worker can claim queued runs;
- protected workflow secrets and a reviewed schedule after the first live
  import and cost controls.

Later phases still own catalog artifact/snapshot Storage, inventory/deck/device
capabilities, device quotas, backups, incident controls, cost controls, and
deployment. See `docs/operations/production-setup.md`.

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
- Keep build output, local databases/snapshots, downloaded bulk data, caches,
  `.env` files, and credentials out of commits.
