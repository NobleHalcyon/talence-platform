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
npx supabase status -o env
npm run dev
```

Copy the local API URL, publishable key, and service-role/secret key reported by
the local stack into `apps/web/.env.local`; also set
`NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000`. Local credentials and fixture
data are development-only. Never put a production key in `.env.local`.

If `supabase/config.toml` changes while the stack is running, use
`npx supabase stop` followed by `npx supabase start`; a database reset alone
does not recreate the Auth container configuration.

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
npm run db:lint
npm run db:types:check
npm run test:supabase
npx playwright install chromium
npm run test:e2e
```

`npm run ci` runs the local checks that do not require Docker or a browser
download. GitHub Actions starts a clean local Supabase stack, checks generated
database types, lints all committed schemas, and runs pgTAP.

## Environment contract

Copy `apps/web/.env.example` to `apps/web/.env.local` for the Next.js
workspace. The root `.env.example` is the deployment-wide matrix, and
`services/catalog-worker/.env.example` documents worker-only settings.
Browser-exposed variables are limited to:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_ORIGIN`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

The Supabase secret key, direct worker database URL, device credential pepper,
and catalog-worker configuration are server/worker-only. They must never use a
`NEXT_PUBLIC_` prefix. The Turnstile secret is configured in Supabase Auth, not
in the web application; only its site key is browser-visible.

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

Phase 1 includes:

- the private invitation ledger and Before User Created hook;
- atomic, idempotent admission finalization;
- profile, personal workspace, owner membership, preferences, and default MTG
  collection provisioning;
- default-deny workspace RLS and final-owner protection;
- login, logout, recovery, invitation completion, settings, workspace context,
  and platform-admin invitation management;
- trusted bootstrap, invite, revoke, and status commands under `scripts/admin`.

For local trusted CLI usage and the first-admin sequence, see
[`scripts/admin/README.md`](scripts/admin/README.md). Hosted hook activation,
server-readable email templates, production CAPTCHA, SMTP, Auth/WAF rate
limits, exact redirect URLs, and environment values are documented in
[`docs/operations/production-setup.md`](docs/operations/production-setup.md).

## Catalog and current pricing

Phase 2 adds a system-written global catalog with normalized sets, oracle cards,
printings, faces, legalities, external IDs, and finish-specific current price
observations. Active admitted users can browse the active catalog; anonymous
users and ordinary catalog writes are denied. Price and operational state are
returned through bounded RPCs so provider and freshness stay attached.

Authenticated routes include:

- `/app/catalog` for URL-addressable search, filters, deterministic sort,
  cursor pagination, English-by-default browsing, explicit `lang=all`
  broadening, and table/grid views;
- `/app/catalog/cards/[cardId]`, `/app/catalog/printings/[printingId]`, and
  `/app/catalog/sets/[setCode]` for detail;
- `/app/admin/catalog` for platform-admin status and queueing.

Search stays in PostgreSQL full-text/trigram indexes. Images use direct provider
URLs without application transformations or proxies. Missing price observations
render `Price unavailable`; an explicit provider zero remains a valid
observation. Representative-volume tests seed 50,000 printings and assert the
full-text GIN plan, exact result, and bounded execution time.

## Collections and auditable inventory

Phase 3 adds private workspace collections, exact physical balances, immutable
inventory transactions and lines, paired transfers, compensating reversals,
finish-specific valuation, analytical groupings, bounded CSV import, and safe
CSV export.

Authenticated routes include:

- `/app/collections` for collection creation, active/archived management, and
  constrained owner-only soft deletion;
- `/app/collections/[collectionId]` for structured, gallery, and analytical
  inventory views plus exact quantity editing and transfers;
- `/app/collections/[collectionId]/history` and
  `/app/collections/[collectionId]/history/[transactionId]` for immutable
  headers and complete paged lines;
- `/app/collections/[collectionId]/import` for private
  upload/stage/review/resolve/commit;
- private error-report and canonical export download routes.

Every quantity change crosses a PostgreSQL transaction function. Identical
idempotent replays return the committed result, conflicting replays fail, stale
client quantities are explicit conflicts, and no balance can become negative.
Ordinary sessions have no direct balance or committed-history write grant.

Imports are limited to UTF-8 CSV files no larger than 2 MiB and 5,000 data
rows. The web stages no more than 500 rows or 512 KiB of serialized UTF-8 JSON
per call. Provider printing identity or exact set/collector/language may match
automatically; name-only candidates always require review. The private source
object is insert-once/read-only to the admitted editor and is purged later by a
service-coordinated retention process.

Valuation uses only the exact finish observation and always carries provider,
currency, observation/ingestion times, and stale state. Missing observations
remain explicitly unpriced. See the
[`Phase 3 dev log`](docs/dev-logs/phase-3.md).

## Catalog worker safety and local commands

Tests use committed fixtures and do not call Scryfall. Live catalog work runs
only from the Python CLI or the disabled-by-default manual GitHub workflow.
Bulk files, generated SQLite snapshots, and local credentials are ignored.

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m talence_catalog validate
.\.venv\Scripts\python.exe -m talence_catalog fixture-import --dry-run
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
.\.venv\Scripts\python.exe -m talence_catalog fixture-import
.\.venv\Scripts\python.exe -m talence_catalog status
```

Live mode additionally requires a real contact-bearing
`TALENCE_CATALOG_USER_AGENT`. It selects exactly Scryfall `all_cards`, restricts
bulk bytes to the official download host, streams through SHA/size guards,
normalizes in bounded batches, and promotes only after database validation.
Unchanged active sources are no-ops and failure preserves the previous active
catalog.

An unforced queued run may complete without downloading bulk bytes only after
the database confirms its discovered provider/set identity still matches the
active source; forced or changed work proceeds normally. Printing-level
provider color identity is preserved even for non-oracle objects.

The database `catalog_state.sync_enabled` switch governs import and queue
functions. The server-only `FEATURE_CATALOG_SYNC_ENABLED` switch independently
governs web queueing. Keep the web switch off until a protected worker can claim
queued runs. Heartbeats and promotion recheck the database switch, so closing it
in flight fails the run and preserves the active catalog. See
[`services/catalog-worker/README.md`](services/catalog-worker/README.md) and the
[`Phase 2 dev log`](docs/dev-logs/phase-2.md).

## Device boundary

Devices use independent high-entropy credentials through `/api/v1/device`.
Credentials are scoped, revocable, and stored only as digests. No cloud route
starts physical motion or stores robot execution checkpoints.

## Canon and behavior changes

Numbered canon and machine-readable contracts are authoritative. Any behavior
change must update the relevant canonical text, contract, implementation, and
tests together. See root `AGENTS.md` before making changes.
