# Talence implementation status and restart handoff

Last updated: 2026-07-26

Branch: `greenfield/platform-v1`

Current completed checkpoint: Phase 0

Remote actions: none; nothing was pushed, merged, or deployed

## Natural stopping point

The clean-sheet Phase 0 scaffold is complete and locally verified except for
the Docker-dependent Supabase smoke run described below. No Phase 1 schema,
server action, or functional auth work has begun.

The Phase 0 checkpoint commit has the required subject:

```text
phase 0: greenfield platform scaffold
```

Use `git log -1 --oneline` after restart to obtain its SHA. The repository was
created from base commit `35be284` (`Initialize Talence greenfield platform`).

The detailed completion evidence, file groups, commands, route descriptions,
manual setup, and deviations are in
`docs/dev-logs/phase-0.md`.

## Completed from the master build prompt

Phase 0 is complete:

- npm workspace and exact lockfile;
- Next.js App Router web scaffold;
- shared domain and production-grade UI primitive packages;
- canonical contract copies, validators, generated TypeScript, and drift checks;
- Python 3.13 fixture-first catalog-worker foundation;
- local Supabase scaffold and pgTAP smoke test;
- secret-free environment matrices;
- lint, format, type, unit, contract, browser, Python, build, and CI wiring;
- responsive landing/auth/application shells and every canonical human route;
- repository, Windows setup, and preliminary production setup documentation.

Phases 1–6 are intentionally not started.

## Architecture state

- `apps/web` is the only web application. Protected pages are beneath
  `app/(authenticated)/app`; the layout fails closed without verified Supabase
  claims. `TALENCE_ENABLE_STATIC_APP_PREVIEW=true` is honored only outside
  production for visual inspection.
- `packages/ui` owns semantic components and Talence tokens. CSS Modules and
  global tokens are used; Tailwind is absent.
- `packages/domain` owns shared domain values, routes, and deterministic price
  state. A missing price renders as unavailable, never zero.
- `packages/contracts` mirrors the five canonical contracts byte-for-byte,
  validates them, generates TypeScript, and exposes AJV parsers.
- `services/catalog-worker` is fixture-first and network-mocked in tests. Its
  current CLI exposes `fixture-import`, `validate`, and `status`; it performs no
  PostgreSQL write or live import.
- `supabase` has a locked-down local config and test harness but no application
  schema migration yet.
- CI has web/contracts, Python, clean Supabase, and browser jobs. The catalog
  workflow is deliberately disabled until Phase 2 implements live import.

## Verification snapshot

Passing:

- canonical manifest: 32 files;
- architecture guard;
- Prettier, ESLint, and strict TypeScript;
- unit tests: 28/28;
- contract tests: 7/7 plus schema/OpenAPI/SQLite/drift/generation validation;
- Python: Ruff and mypy pass, pytest 18/18;
- Next production build;
- Playwright system-Edge smoke: 4/4 across desktop and mobile.
- Complete `npm.cmd run ci` root chain, including production build.

Not run:

- `npx supabase db reset`
- `npm run test:supabase`

Reason: Docker Desktop's daemon was not running, and this Codex process lacked
permission to create `C:\Users\judge\.supabase`. The committed GitHub database
job still starts a clean stack and runs reset/pgTAP.

## Restart procedure

Open the repository in the restarted VS Code, then run:

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -1 --oneline
docker version
npx supabase start
npx supabase db reset
npm run test:supabase
```

Expected branch: `greenfield/platform-v1`. The working tree should be clean
after the Phase 0 checkpoint. If Docker is still unavailable, start/update
Docker Desktop and repeat only the last four commands; do not alter migrations
to work around a missing daemon.

For a full non-database regression:

```powershell
npm ci
.\scripts\setup-python.ps1
npm run ci
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Then prompt Codex to continue the attached master build prompt from Phase 1 and
direct it to read this file plus `docs/dev-logs/phase-0.md`. Root `AGENTS.md`
still requires a fresh complete read of `docs/canonical/` before implementation.

## Phase 1 handoff

Implement only after the Supabase Phase 0 smoke run has been attempted:

1. Add migrations for private schemas, `app_private.invited_users`, profiles,
   platform roles, workspaces/memberships/invitation foundation, preferences,
   games, and the default-collection prerequisite.
2. Add constraints/indexes/updated-at helpers, default-deny RLS, admitted-user
   and workspace-role helpers, final-owner protection, the Before User Created
   hook, and atomic/idempotent `finalize_admitted_user()`.
3. Ensure the default MTG collection prerequisite exists before finalization;
   the canonical finalization sequence provisions it atomically.
4. Add pgTAP coverage for uninvited/expired/revoked/valid admission,
   metadata/email mismatch, replay safety, inactive profiles, final owners, and
   two-user/two-workspace denial.
5. Turn the auth shells into login/logout/recovery/invite-completion behavior,
   add CAPTCHA integration points, active-profile/workspace guards, settings,
   admin invite sequencing, and trusted bootstrap/invite/revoke/status CLI
   scripts.
6. The invitation row must be committed before invoking Supabase Admin invite.
   Never add a public registration route or call `signUp`.
7. Create `docs/dev-logs/phase-1.md`, run all verification, and commit exactly:
   `phase 1: invite-only identity and workspace foundation`.

## Constraints to preserve

- Do not push, merge, or deploy without fresh explicit authorization.
- Do not introduce public registration, human custom sessions/password
  handling, anonymous application data, Tailwind, browser-paid-service calls,
  remote robot motion, or cloud robot execution state.
- Keep every mutable resource workspace-scoped and every exposed table under
  default-deny RLS.
- Inventory mutations must eventually pass only through immutable transaction
  functions.
- Device secrets must remain separate, scoped, revocable, digest-only, and
  idempotent for inventory writes.
- Keep generated build output, local databases/snapshots, downloaded bulk data,
  caches, `.env` files, and credentials out of commits.

## Human production setup still remaining

Nothing cloud-facing was configured in Phase 0. Supabase/Vercel projects,
production secrets, SMTP, redirect URLs, Before User Created hook activation,
CAPTCHA, Auth/WAF rate limits, Storage buckets, cost controls, backup/restore,
and deployment remain future implementation or explicit human setup. See
`docs/operations/production-setup.md`.
