# Phase 0 — Greenfield platform scaffold

Date: 2026-07-26

Branch: `greenfield/platform-v1`

Checkpoint subject: `phase 0: greenfield platform scaffold`

## Outcome

Phase 0 is implemented as a clean-sheet platform foundation. The repository is
an npm workspace with a strict Next.js application, shared domain and UI
packages, generated/validated canonical contracts, an offline-testable Python
3.13 catalog worker, a local Supabase scaffold, and CI workflows. No Phase 1
identity schema or application behavior has been started.

The root `AGENTS.md` and every file under `docs/canonical/` were read before
implementation. The canonical manifest validates all 32 declared files.

## Master-prompt completion

- Created the required `apps/web`, `packages/domain`, `packages/ui`,
  `packages/contracts`, `services/catalog-worker`, `supabase`, `scripts`,
  `docs/dev-logs`, and `.github/workflows` structure.
- Added the root npm workspace, exact dependency versions, lockfile, strict
  shared TypeScript configuration, editor/format settings, and Windows/Bash
  setup scripts.
- Added a current stable Next.js 16 App Router application with React 19,
  TypeScript, CSS Modules, shared CSS tokens, and no Tailwind.
- Added responsive public landing and authentication shells plus fail-closed
  authenticated route placeholders for every canonical human route.
- Added Supabase SSR browser/server clients, session-refresh Proxy, verified
  claims boundary, and an explicitly non-production-only static preview switch.
- Added semantic shared UI primitives, including forms, price provenance,
  card-face rendering, responsive data layout, drawers/dialogs, notifications,
  pagination, states, and accessible keyboard/focus behavior.
- Added shared domain constants/types, navigation definitions, and deterministic
  price freshness/missing-price rules.
- Copied the five canonical machine contracts into `packages/contracts`, added
  byte-for-byte drift detection, structural validation, TypeScript generation,
  AJV validators, and contract fixtures/tests.
- Added the Python 3.13 worker foundation with mockable Scryfall metadata access,
  bounded retry, streamed atomic downloads, SHA-256/size accounting, streaming
  normalization, deterministic version helpers, canonical SQLite shell
  validation, immutable local artifact storage behavior, fixtures, and tests.
- Added a local Supabase configuration with public/anonymous signup disabled,
  email auth reserved for invitation/login/recovery flows, Realtime disabled,
  a repeatable empty seed, and a Phase 0 pgTAP smoke test.
- Added secret-free root, web, and worker environment examples. Browser-safe and
  trusted-server variables are separated and feature kill switches default off.
- Added ESLint, Prettier, strict TypeScript, Vitest/Testing Library, Playwright,
  Ruff, mypy, pytest, pgTAP wiring, Dependabot, CI, preview-build, and a
  deliberately disabled Phase 0 catalog-worker readiness workflow.
- Added canonical and architecture guards for manifest drift, public signup
  calls/routes, Tailwind, public privileged secrets, browser-side Scryfall
  access, and remote-motion naming.
- Added Windows-first repository setup and preliminary production setup
  documentation.

## Files changed

### Repository and automation

- `.editorconfig`, `.gitattributes`, `.gitignore`, `.npmrc`,
  `.prettierignore`, `prettier.config.mjs`, `tsconfig.base.json`
- `.env.example`, `package.json`, `package-lock.json`, `README.md`
- `scripts/check-architecture.mjs`
- `scripts/check-canonical-manifest.mjs`
- `scripts/python.mjs`
- `scripts/setup-python.ps1`, `scripts/setup-python.sh`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/preview.yml`
- `.github/workflows/catalog-sync.yml`
- `docs/operations/production-setup.md`

### Web application

- `apps/web/package.json`, `tsconfig.json`, `next.config.ts`,
  `next-env.d.ts`, `eslint.config.mjs`, `vitest.config.ts`,
  `playwright.config.ts`, `.env.example`
- `apps/web/app/**` for public, authentication callback, authenticated shell,
  catalog, collections, decks, devices, settings, and admin route skeletons
- `apps/web/components/**` for public, authentication, brand, and application
  shell components
- `apps/web/lib/supabase/**`, `apps/web/proxy.ts`
- `apps/web/styles/globals.css`
- `apps/web/tests/**`, `apps/web/e2e/public-shell.spec.ts`

### Shared packages

- `packages/domain/**`
- `packages/ui/**`
- `packages/contracts/**`, including the five canonical contract copies and five
  generated TypeScript artifacts

### Catalog worker

- `services/catalog-worker/pyproject.toml`, `.env.example`, `README.md`
- `services/catalog-worker/fixtures/scryfall/**`
- `services/catalog-worker/src/talence_catalog/**`
- `services/catalog-worker/tests/**`

### Supabase

- `supabase/config.toml`
- `supabase/seed.sql`
- `supabase/README.md`
- `supabase/migrations/README.md`
- `supabase/tests/README.md`
- `supabase/tests/database/000_phase_0_smoke.test.sql`

## Migrations, functions, and policies

No application migrations, database functions, or RLS policies were added in
Phase 0. This is intentional: Phase 1 owns the private admission, profile,
workspace, membership, invitation, preference, game/default-collection
prerequisites, helpers, hooks, finalization, and initial RLS model.

The Phase 0 database contribution is the locked-down local configuration,
repeatable seed entry point, migration/test conventions, and a Supabase/Auth
availability smoke test.

## Route descriptions

- `/` — responsive public landing page explaining Talence, auditable inventory,
  catalog precision, device boundaries, and administrator-issued access.
- `/login`, `/forgot-password`, `/reset-password`, `/invite/complete` —
  accessible Phase 0 auth shells with labeled fields and no registration link.
  Live actions intentionally arrive with Phase 1.
- `/app` — responsive authenticated shell with primary navigation and explicit
  preview labeling when the development-only static preview is enabled.
- `/app/catalog`, `/app/catalog/cards/[cardId]`,
  `/app/catalog/printings/[printingId]`, `/app/catalog/sets/[setCode]` —
  catalog route skeletons.
- `/app/collections`, `/app/collections/[collectionId]`, history and import
  descendants — collection route skeletons.
- `/app/decks`, `/app/decks/[deckId]` — deck route skeletons.
- `/app/devices`, `/app/devices/[deviceId]` — device route skeletons.
- `/app/settings`, `/app/admin/catalog`, `/app/admin/invites`,
  `/app/admin/operations` — settings and administrative route skeletons.

The production build emitted every route above. Desktop and Pixel 7 viewport
smoke tests covered the public landing and login shell; no screenshots were
persisted because route descriptions satisfy the phase reporting requirement.

## Verification

Passed on Windows:

- `npm.cmd ci --no-audit` — 507 packages installed from the lockfile.
- `npm.cmd run canon:validate` — 32 canonical files valid.
- `npm.cmd run guard:architecture` — pass.
- `npm.cmd run format:check` — pass.
- `npm.cmd run lint` — pass for all workspaces.
- `npm.cmd run typecheck` — pass for all workspaces.
- `npm.cmd run test:unit` — 28/28 pass:
  web 8, contracts 7, domain 2, UI 11.
- `npm.cmd run test:contracts` — five canonical copies match; three JSON
  Schemas, OpenAPI 1.0.0, and SQLite schema version 1 validate; five generated
  files are current; contract tests 7/7 pass.
- `npm.cmd run lint:python` — pass across 24 Python files.
- `npm.cmd run format:python` — 24 files already formatted.
- `npm.cmd run typecheck:python` — no issues in 16 source files.
- `npm.cmd run test:python` — 18/18 pass.
- `npm.cmd run build` — pass; Next.js 16.2.12 production build completed.
- `npm.cmd run ci` — complete root chain pass outside the managed process
  sandbox.
- `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e --workspace @talence/web`
  — 4/4 desktop/mobile tests pass using installed Microsoft Edge.
- `git diff --check` — pass before checkpoint.

Windows-managed execution initially prevented Vitest child-process config
loading and pytest's global temp discovery. The checked-in test commands now use
Vitest's native config loader/thread pool and a runner-owned, ignored pytest
temp root with reliable cleanup. The exact root test commands pass without
manual environment workarounds.

## Manual setup and blocker

Local Supabase reset and pgTAP execution were not run in this session. Docker
Desktop was present but its daemon was unavailable, and the current restricted
process could not create the Supabase CLI user configuration directory. The SQL
smoke test and CI database job are committed, but this result must not be
reported as locally passing.

After restarting with the intended permissions:

```powershell
docker version
npx supabase start
npx supabase db reset
npm run test:supabase
```

Production Supabase/Vercel projects, environment secrets, SMTP, redirect URLs,
CAPTCHA, Auth hook activation, rate limits, Storage buckets, WAF, and production
deployment remain human-controlled and are not Phase 0 blockers.

## Deviations and open items

- No locked-stack deviation was made.
- No push, merge, preview deployment, or production deployment was performed.
- No secret or local environment file was committed.
- The catalog sync workflow is intentionally disabled and runs only the honest
  Phase 0 capability report. Phase 2 must replace it with fixture/live import,
  validation, staging, and promotion.
- Auth forms and authenticated pages are shells, not functioning Phase 1
  features.
- Phases 1 through 6 remain unstarted.
