# Talence implementation status and restart handoff

Last updated: 2026-07-26

Branch: `greenfield/platform-v1`

Current completed checkpoint: Phase 1

Remote actions: none; nothing was pushed, merged, or deployed

## Checkpoint state

The clean-sheet Phase 0 scaffold and the complete Phase 1 invite-only identity
and workspace foundation are implemented. The Phase 1 checkpoint has the
required subject:

```text
phase 1: invite-only identity and workspace foundation
```

Commit lineage:

- base: `35be284` - `Initialize Talence greenfield platform`
- Phase 0: `211e438` - `phase 0: greenfield platform scaffold`
- Phase 1: the commit containing this file; resolve it with
  `git log -1 --oneline`

Detailed Phase 1 evidence, file groups, migrations, policies, route
descriptions, commands, manual setup, and risks are in
`docs/dev-logs/phase-1.md`.

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

Phases 2-6 are not part of the Phase 1 checkpoint.

## Architecture state

- `apps/web` owns human routes and uses `@supabase/ssr`; authenticated routes
  require verified claims plus `current_user_context()` admission.
- Supabase Auth owns human passwords and sessions. Talence has no public
  registration route, public `signUp`, password store, or custom session.
- `app_private` and `app_api` are not exposed Data API schemas. The hook is
  executable only by `supabase_auth_admin`; public admin wrappers are
  service-role-only and verify an active platform-admin actor.
- All eight exposed Phase 1 tables have RLS. Anonymous users have no
  application-data grants; mutable workspace resources remain database-owned.
- Admission acceptance provisions an active profile, personal workspace, owner
  membership, preferences, and default MTG collection in one database
  transaction.
- Web and CLI invitation flows create the ledger row before Auth Admin and use
  compensating cleanup/reconciliation for the unavoidable cross-system
  boundary.
- `packages/contracts` remains the machine-contract authority; generated
  database types now add compile-time table/RPC checking in the web app.
- Catalog, inventory, decks, device credentials/API, and robot snapshots remain
  future checkpoint work. No remote robot control or cloud execution state was
  introduced.

## Verification snapshot

Passing:

- canonical manifest: 32 files;
- architecture guard, Prettier, ESLint, and strict TypeScript;
- unit tests: 94/94 (web 56, contracts 7, domain 2, UI 11, trusted
  administration 18);
- contract copies/schemas/OpenAPI/SQLite/generated-file checks;
- Python Ruff, formatting, mypy, and 18 fixture-only pytest tests;
- Next.js production build;
- complete `npm.cmd run ci` root chain;
- Playwright system-Edge desktop/mobile public and login smoke flows: 4/4;
- clean local Supabase reset from an empty database;
- database lint with zero warnings;
- generated database types drift check;
- pgTAP: five files, 125 assertions;
- live local hook rejection for an uninvited Auth creation;
- live trusted CLI invite, inspect, revoke, and inspect sequence.

The final exact JavaScript and browser counts are recorded in the Phase 1 dev
log after validation. `git diff --check` passes before checkpoint.

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

Expected branch: `greenfield/platform-v1`. The Phase 1 checkpoint working tree
is clean. Continue the attached master build prompt with Phase 2, first reread
root `AGENTS.md`, all files under `docs/canonical/`, this file, and
`docs/dev-logs/phase-1.md`.

## Phase 2 handoff

Implement the catalog/pricing vertical slice next:

1. Add catalog sets/cards/printings/faces/legalities/external IDs, current
   prices, source/import/catalog-state, staging/promotion schema, indexes, RLS,
   and admin status functions.
2. Complete the Python worker with Scryfall bulk metadata discovery,
   `all_cards` streamed download, hash/size guards, normalized batches, staging,
   validation, atomic promotion, unchanged-source no-op, preserved prior
   catalog, fixtures, status, and live/manual workflow.
3. Build authenticated URL-addressable catalog search/filter/sort/cursor
   pagination, table/grid modes, printing/card/set detail, multi-face rendering,
   price provenance/freshness, missing-price behavior, mobile filters, and
   admin catalog status/dispatch.
4. Keep direct provider images untransformed and perform no browser-side paid
   service calls.
5. Add database/worker/web tests for object variants, prices, replay/failure,
   search/filter, RLS write denial, UI states, and phone viewport.
6. Update `docs/dev-logs/phase-2.md`, refresh this file, run all validation, and
   commit exactly:
   `phase 2: canonical catalog pricing and browse`.

## Manual production setup still remaining

Phase 1 hosted setup is implemented and documented but not executed:

- hosted migration application and hook activation;
- exact Site URL and typed callback allowlist;
- server-readable invite/recovery email templates;
- production SMTP and deliverability records;
- Auth rate limits and Turnstile/CAPTCHA;
- WAF rules and Vercel/Supabase environment values;
- deliberate invitation feature enablement and first-admin bootstrap.

Later phases still own Storage buckets, catalog-worker secrets/schedule, device
credentials/quotas, catalog snapshots, backups, incident controls, cost
controls, and deployment. See `docs/operations/production-setup.md`.

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
