# Talence Platform

Talence is an invite-only, mobile-first Magic: The Gathering collection and
deck-management platform. The cloud maintains a searchable catalog, auditable
inventory, decks, device grants, and immutable robot catalog snapshots. Robot
motion and execution state remain in the separate robot system.

This repository is a greenfield implementation governed by
[`docs/canonical/Talence_Greenfield_Canon_v1.0.0`](docs/canonical/Talence_Greenfield_Canon_v1.0.0).

## Stack

- Next.js 16 App Router, React, and strict TypeScript
- npm workspaces without an additional monorepo orchestrator
- Supabase PostgreSQL, Auth, Storage, and Row Level Security
- CSS Modules plus Talence-owned global tokens
- Python 3.13 catalog worker
- Vitest, React Testing Library, Playwright, pytest, Ruff, mypy, and pgTAP
- Vercel deployment target and GitHub Actions

## Repository map

```text
apps/web                  Next.js web application and /api/v1 route handlers
packages/domain           Shared value types, schemas, and deterministic rules
packages/ui               Talence semantic UI primitives and CSS tokens
packages/contracts        Canonical machine contracts and generated validators
services/catalog-worker   Offline-testable Scryfall import and snapshot worker
supabase                  Migrations, seed, local configuration, and SQL tests
docs/canonical            Locked product and architecture authority
docs/dev-logs             Phase-by-phase implementation records
scripts                   Trusted CLI and repository checks
```

## Prerequisites

- Node.js 24 LTS or newer and npm 11 or newer
- Python 3.13
- Docker Desktop
- Git

The Supabase CLI is installed as a repository development dependency and is
invoked with `npx`; a global install is not required.

## Windows setup

From PowerShell:

```powershell
git checkout greenfield/platform-v1
npm install
Copy-Item apps\web\.env.example apps\web\.env.local
.\scripts\setup-python.ps1
npx supabase start
npx supabase db reset
npm run dev
```

Open `http://localhost:3000`. Phase fixture data is local only. Never put a
production key in `.env.local`.

## macOS/Linux setup

```bash
git checkout greenfield/platform-v1
npm install
cp apps/web/.env.example apps/web/.env.local
bash ./scripts/setup-python.sh
npx supabase start
npx supabase db reset
npm run dev
```

## Verification

JavaScript and TypeScript:

```powershell
npm run guard:architecture
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:contracts
npm run build
```

Python, using the local virtual environment on Windows:

```powershell
.\.venv\Scripts\python.exe -m ruff check services\catalog-worker
.\.venv\Scripts\python.exe -m ruff format --check services\catalog-worker
.\.venv\Scripts\python.exe -m mypy services\catalog-worker\src
.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests
```

The equivalent Bash commands replace `.\.venv\Scripts\python.exe` with
`.venv/bin/python`.

Database and browser:

```powershell
npx supabase db reset
npx supabase test db
npx playwright install chromium
npm run test:e2e
```

`npm run ci` runs the local checks that do not require Docker or a browser
download. GitHub Actions also starts a clean local Supabase stack.

## Environment contract

Copy `apps/web/.env.example` to `apps/web/.env.local` for the Next.js
workspace. The root `.env.example` is the deployment-wide matrix, and
`services/catalog-worker/.env.example` documents worker-only settings.
Browser-exposed variables are limited to:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_ORIGIN`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

The Supabase secret key, database URL, CAPTCHA secret, device credential pepper,
and catalog-worker configuration are server/worker-only. They must never use a
`NEXT_PUBLIC_` prefix.

All incident-sensitive features default off when configuration is absent:
invitations, catalog sync, device inventory writes, and snapshot downloads.
`TALENCE_ENABLE_STATIC_APP_PREVIEW=true` may render the authenticated shell
without Supabase only for deliberate non-production visual inspection. It is
ignored in production and must never be treated as an authorization bypass.

## Private-beta identity

There is intentionally no registration route and application code must never
call public `signUp`. A platform administrator first writes an invitation to
`app_private.invited_users`, then calls Supabase Admin invitation. The Before
User Created hook rejects all other account creation.

Local SQL installs the hook function, but hosted activation, production CAPTCHA,
SMTP, Auth rate limits, and redirect URLs are human setup steps documented in
`docs/operations/production-setup.md`.

## Catalog worker safety

Tests use committed fixtures and do not call Scryfall. Live catalog work runs
only from the Python CLI or the disabled-by-default manual GitHub workflow.
Bulk files, generated SQLite snapshots, and local credentials are ignored.

## Device boundary

Devices use independent high-entropy credentials through `/api/v1/device`.
Credentials are scoped, revocable, and stored only as digests. No cloud route
starts physical motion or stores robot execution checkpoints.

## Canon and behavior changes

Numbered canon and machine-readable contracts are authoritative. Any behavior
change must update the relevant canonical text, contract, implementation, and
tests together. See root `AGENTS.md` before making changes.
