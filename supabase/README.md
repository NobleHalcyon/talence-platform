# Local Supabase

This directory is the version-controlled local Supabase project for Talence.
Phase 1 contains the invite-only admission, profile, workspace, membership,
preference, game, and default-collection foundation. Phase 2 adds the global
catalog/current-price schema, private import lifecycle, bounded browse/admin
RPCs, and read-only admitted-user RLS. Phase 3 adds collections, the immutable
inventory ledger, balances, valuation, history, private CSV staging, and
least-privilege Storage policies. Phase 4 adds version-pinned deck formats,
workspace-scoped decks, immutable revisions, finite collection ownership,
valuation, validation, bounded import/export, and default-deny deck RLS.
Device objects arrive through ordered migrations in Phase 5.

The local stack is development-only. It uses local credentials and captures
email in the local SMTP viewer; do not expose it to a network or treat its settings as
production configuration.

## Windows setup

Prerequisites:

- Docker Desktop is installed and running.
- Root dependencies are installed with `npm install`.

From the repository root in PowerShell:

```powershell
npx supabase start
npx supabase db reset
npm run db:lint
npm run db:types:check
npm run test:supabase
```

For a per-user Docker Desktop installation, a newly restarted VS Code process
may not inherit the Docker CLI directory. If `supabase test db` reports that it
cannot run Docker, prepend the local install for that PowerShell process:

```powershell
$talenceDockerBin = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin"
$env:PATH = "$talenceDockerBin;$env:PATH"
npm run test:supabase
```

Useful local endpoints are printed by `supabase start`. With the committed
configuration, the API is at `http://127.0.0.1:54321`, Studio is at
`http://127.0.0.1:54323`, and captured email is at
`http://127.0.0.1:54324`.

Stop the local services without deleting their data:

```powershell
npx supabase stop
```

When `config.toml` changes, stop and start the stack so the Auth container is
recreated with the new hook or redirect configuration. `db reset` recreates
PostgreSQL data but does not rebuild Auth container environment variables.

`npx supabase db reset` is destructive to the local database: it recreates the
database, applies every migration in order, and then runs `seed.sql`. Never add
`--linked` unless a separately documented dev/staging operation explicitly
requires it, and never reset production.

## Private-beta authentication baseline

Local Auth is enabled for email invitations, existing-user sign-in, and password
recovery. Global public signup, anonymous sign-in, manual identity linking, and
SMS signup are disabled. The local SMTP viewer receives email without production
credentials.

The database-backed invitation ledger, Before User Created hook, admission
finalizer, and RLS policies are active locally. `config.toml` points the local
Auth service to:

```text
pg-functions://postgres/app_private/before_user_created_hook
```

`app_private` and `app_api` are intentionally absent from `api.schemas`.
Invitation administration crosses the Data API only through service-role-only
`public.admin_*` functions, and each function independently checks its actor.
The authenticated finalizer derives the user and email from Supabase Auth and
accepts no identity arguments.

The typed database client file is generated from the running local schema:

```powershell
npm run db:types
npm run db:types:check
```

Commit the generated file whenever a migration changes the exposed schema or
RPC signatures.

For a hosted project, apply migrations first and then activate the **Before User
Created** hook in Supabase Auth using the same Postgres function URI. Confirm
that only `supabase_auth_admin` has execute permission. CAPTCHA, SMTP, redirect
URLs, hook activation, Auth rate limits, and the first trusted invitation/admin
bootstrap remain human-managed production setup. The exact callback allowlist,
invite/recovery email templates, and bootstrap commands are in
`docs/operations/production-setup.md`; no production secret belongs in
`config.toml`.

## Phase 2 catalog database

The public Phase 2 tables contain catalog identity, current price observations,
source/import metadata, and the singleton active-catalog pointer. Normalized
candidate rows remain under `app_private` until trusted validation and atomic
promotion succeeds. Printing rows retain their own `color_identity` so
non-oracle tokens and emblems do not derive identity from visible face colors.

Active admitted users receive read-only access to active set/card/printing/face/
legality/external-ID rows. Current prices, source files, import runs, and
catalog state have no direct authenticated table grant; bounded RPCs return
prices with provider/freshness and operational state to the appropriate actor.
Anonymous users, inactive/suspended users, and all ordinary catalog writes are
denied.

The worker uses a protected direct PostgreSQL connection:

```powershell
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
.\.venv\Scripts\python.exe -m talence_catalog fixture-import
.\.venv\Scripts\python.exe -m talence_catalog status
```

`public.catalog_state.sync_enabled` gates trusted import and queue functions.
It is transaction-locked and rechecked at import begin, heartbeat, queued no-op
completion, and immediately before promotion. Turning it off therefore blocks
an in-flight worker before catalog data or the active pointer can change; the
worker may still record the run as failed. It defaults on for deterministic
local fixture testing; explicitly close it in a newly migrated hosted project
until the controlled import window. The web server's independent
`FEATURE_CATALOG_SYNC_ENABLED` gate should remain off until a protected worker
can claim queued rows.

`app_private.catalog_complete_queued_noop(...)` lets the service-role worker
complete an unchanged, unclaimed, non-forced admin queue without downloading
the bulk file. The function locks the active pointer, compares the complete
provider/source identity and dependency checksum, records the active source and
catalog version, and returns the stored result on an identical replay. A force
request or identity race leaves the row queued so the worker can continue with
the full download.

Catalog query text is first resolved to an index-backed union of matching
card, printing, face, and set IDs before the browse query projects faces and
prices. The `240_*` pgTAP suite generates 50,000 deterministic printings and
faces, asserts the full-text GIN plan, and requires a unique search through the
actual catalog query function to finish within five seconds.

Production gate ordering, the first manual live import, queue claiming, and the
disabled workflow/schedule are documented in
`docs/operations/production-setup.md`.

## Phase 3 collection and inventory database

The Phase 3 migrations add:

- exact balances keyed by collection, printing, finish, and condition;
- immutable transaction headers and lines plus private canonical request
  hashes;
- atomic human mutations, paired transfers, and compensating reversals;
- collection list/detail/inventory/summary/analytics/history/export RPCs;
- bounded import jobs and staged rows with explicit
  matched/ambiguous/rejected/excluded state;
- atomic import commit/cancel, stale-job expiration, and service-coordinated
  retention;
- default-deny inventory RLS and exact private `inventory-imports` Storage
  policies.

Ordinary authenticated sessions receive bounded function access but no direct
write privilege on balances or committed history. The trusted transaction
functions lock exact balance keys, enforce expected prior quantities, reject a
negative result, and store one result for each normalized idempotency request.
Existing inventory can still be reduced, moved, or compensated after a catalog
identity becomes inactive, while arbitrary positive additions to inactive
identity remain denied.

Structured, gallery, and analytical collection views share the same positive
balance relation and normalized query, set, finish, and condition filters.
Analytical totals and every grouping are computed only from that filtered
relation.

The import bucket is private. An admitted editor may insert the exact
workspace/job `source.csv` object once and read that authorized object. Ordinary
update/upsert/delete is denied. Before staging completion and commit, database
functions recheck object owner, byte count, MIME type, SHA-256, job identity,
and parser version. A service process first expires abandoned jobs, later
deletes eligible Storage objects, and only then marks their database staging
purged.

Run the complete database, Storage, and two-session concurrency validation from
the repository root:

```powershell
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run test:supabase:phase3-integration
```

The integration harness proves exact editor-only object access, denied
overwrite/upsert/delete paths, service cleanup after cancellation, same-key
replay/conflict races, and distinct-key updates against the same previously
absent balance without a lost update.

## Phase 4 deck database

The Phase 4 migrations add seven append-only format baselines, workspace-scoped
decks and oracle-level entries, ordered collection inventory sources, immutable
revision snapshots, and version-keyed validation evidence. The exposed deck
tables use default-deny RLS. Ordinary authenticated roles receive the intended
workspace/admission-scoped reads and bounded RPC execution, but no direct
mutation grant.

Every deck mutation derives the human actor, checks the workspace role, locks
the deck and active catalog generation, compares an exact expected revision,
and records one immutable revision in the same transaction. Entry identities,
preferred printings, and collection sources are revalidated after waits.
Collection lifecycle and deck-source changes use canonical advisory-lock
ordering, preventing a deleted collection from becoming a source and avoiding
opposite-order deadlocks.

Ownership allocation consumes each physical copy at most once across
commander, companion, mainboard, and sideboard; maybeboard reports availability
without reserving inventory. Preferred-printing shortfall and exact-finish
valuation remain separate. Missing observations are nullable, never zero, and
priced amounts retain provider and freshness evidence.

Validation is deterministic evidence pinned to the exact deck content hash,
format version, and catalog version. Bounded issue detail includes an explicit
truncation marker while complete severity and unknown-legality totals remain
available. Import resolution and all list/search/history surfaces publish
bounded work and cursor contracts.

Run the complete database and multi-session validation from a disposable local
stack:

```powershell
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
npm run db:types
npm run db:types:check
```

The Phase 4 harness always refuses a non-loopback PostgreSQL target. It mutates
its disposable database with unique fixtures, so reset before rerunning the
transactional pgTAP suite.
