# Phase 5 - Device API and robot catalog snapshot

Date: 2026-07-27

Branch: `greenfield/platform-v1`

Starting checkpoint: `905deaf phase 4: collection-aware deck builder`

Partial work-unit checkpoint subject:

```text
phase 5 checkpoint: device API and snapshot foundations
```

Required final Phase 5 checkpoint subject:

```text
phase 5: device API and robot catalog snapshot
```

Checkpoint SHA: resolve the partial checkpoint from `git log` after commit

## Current status

The database/device authorization, Next.js administration and stable API, and
Python catalog-snapshot/reference-client foundations form one coherent,
validated checkpoint. Phase 5 is not complete because live boundary composition
and true multi-session Phase 5 race coverage remain.

The prescribed final Phase 5 checkpoint has not been created. Phase 6 has not
started. No remote repository action, hosted migration, Storage mutation,
deployment, or paid-service call occurred.

## Files changed

Database and generated surface:

- `supabase/migrations/20260727050000_phase_5_device_snapshot_schema.sql`;
- `supabase/migrations/20260727051000_phase_5_snapshot_and_device_admin_functions.sql`;
- `supabase/migrations/20260727052000_phase_5_device_api_inventory_and_runs.sql`;
- `supabase/migrations/20260727053000_phase_5_device_rls_grants.sql`;
- `supabase/config.toml`;
- `apps/web/lib/supabase/database.types.ts`;
- `apps/web/lib/database/contracts.ts`.

Web application:

- device list/detail/loading/error routes under
  `apps/web/app/(authenticated)/app/devices`;
- all six route handlers under `apps/web/app/api/v1/device`;
- shared device UI under `apps/web/components/devices`;
- device actions, authentication, parsing, request/response, RPC, validation,
  credential, query, signed-URL, preview, and type modules under
  `apps/web/features/devices`;
- `apps/web/.env.example`, `apps/web/package.json`, and `package-lock.json`.
- `apps/web/playwright.config.ts` to compile the dynamic device-detail preview
  before parallel browser workers begin.

Catalog worker:

- snapshot source, schema, publisher, Storage, and reference-client modules
  under `services/catalog-worker/src/talence_catalog/snapshot`;
- worker CLI, configuration, database adapter, importer, store contracts, and
  integration safety guard;
- `services/catalog-worker/.env.example` and
  `services/catalog-worker/README.md`.

Tests and handoff:

- four `supabase/tests/database/5*_phase_5_*.test.sql` pgTAP suites;
- eight device-focused web unit suites and
  `apps/web/e2e/devices-preview.spec.ts`;
- worker snapshot, Storage, reference-client, integration-safety, and guarded
  PostgreSQL integration suites;
- `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_STATUS.md`,
  `RESTART_HANDOFF.md`, and this log.

## Migrations, functions, and policies added

### Schema

Exposed RLS tables:

- `catalog_snapshots`;
- `devices`;
- `device_collection_grants`;
- `device_sync_batches`;
- `device_run_summaries`.

Private tables:

- `device_credentials`;
- `device_mutation_requests`;
- `device_feature_policies`;
- `device_usage_windows`.

The migration also links the current robot snapshot into `catalog_state` and
device-authenticated inventory transactions into the existing immutable
inventory ledger.

### Human administration

The bounded administration surface includes:

- `device_list`;
- `device_detail`;
- `device_register`;
- `device_update`;
- `device_set_status`;
- `device_rotate_credential`;
- `device_credential_revoke`;
- `device_revoke`;
- `device_delete`;
- `device_grants_replace`;
- `admin_device_feature_policies`;
- `admin_device_feature_policy_update`.

Owner/admin functions re-derive or verify the human actor, lock the managed
device and workspace role, enforce lifecycle and workspace identity, and never
return a stored raw credential.

### Device and worker service functions

The service-only surface includes:

- `device_credential_candidate`;
- `device_auth_touch`;
- `device_api_me`;
- `device_api_heartbeat`;
- `device_api_catalog_manifest`;
- `device_api_inventory_page`;
- `apply_device_inventory_batch`;
- `device_api_create_run_summary`;
- `app_private.catalog_publish_snapshot`.

Inventory batches normalize and hash bounded lines, require an explicit write
grant, serialize first use of a device/idempotency identity, and call the Phase
3 ledger core. Run summaries serialize both idempotency and external-run
identities. Identical requests replay; conflicting reuse fails.

Snapshot publication holds the catalog-promotion lock, verifies the exact
active import and artifact metadata, rejects stale promotion, preserves the
previous compatible snapshot, and treats same-version changed bytes as a
conflict.

### Authorization

RLS policies are:

- `catalog_snapshots_select_platform_admin`;
- `devices_select_workspace`;
- `device_collection_grants_select_workspace`;
- `device_sync_batches_select_workspace`;
- `device_run_summaries_select_workspace`.

Anonymous access and ordinary direct writes are revoked. Authenticated human
reads are column-bounded and RLS-scoped. Service role receives only the
necessary function execution and has no direct Phase 5 table CRUD. Private
credential, idempotency, policy, and quota tables remain unexposed.

## Web implementation

Device administration supports:

- register/name/type/manufacturer/model/serial;
- show the 256-bit raw credential once;
- rotate or revoke credentials;
- activate, suspend, revoke, and terminally delete a device;
- replace explicit per-collection read/write/run-summary grants;
- show last seen, last request, client/API version, and installed catalog.

Credential authentication uses a strict Bearer token with a 12-character
non-secret lowercase-hex prefix and 43-character base64url secret. The server
computes an HMAC-SHA-256 digest with a server-only pepper and performs a
constant-time comparison, including a dummy comparison for a syntactically
valid unknown prefix.

Request handling bounds media type, UTF-8 JSON bytes, body shape,
idempotency-key shape, collection IDs, pagination, metadata, and supported
snapshot versions. Responses use the canonical envelope and
`X-Talence-Request-Id`. Error details are allowlisted; credentials, digests,
signed URLs, and complete bodies are not logged.

Machine routes:

- `GET /api/v1/device/me`;
- `POST /api/v1/device/heartbeat`;
- `GET /api/v1/device/catalog/manifest`;
- `GET /api/v1/device/collections/[collectionId]/inventory`;
- `POST /api/v1/device/collections/[collectionId]/inventory-batches`;
- `POST /api/v1/device/runs`.

Human routes:

- `/app/devices`;
- `/app/devices/[deviceId]`.

No route starts physical motion, and prohibited execution/checkpoint metadata
is rejected.

## Snapshot worker and reference client

The worker exports one active catalog under repeatable read while holding the
shared catalog-promotion advisory lock. Rows are streamed in deterministic
primary-key order into the canonical SQLite schema with:

- normalized canonical arrays;
- exact decimal price text;
- contentless FTS populated in deterministic row order;
- schema/API/client versions and bounded counts;
- SQLite `quick_check`, foreign-key check, `user_version`, SHA-256, and byte
  size verification.

Snapshot `generated_at` and edge price `ingested_at` use the provider
observation encoded in catalog-version identity. Provider timestamps are
normalized to catalog-version second precision. Mutable worker download and
promotion wall clocks therefore cannot change the artifact bytes for the same
version.

Local Storage uses immutable create/link behavior. The Supabase adapter uses a
private create-only upload, rejects an existing object with different bytes,
downloads and re-hashes the stored object, and only then permits database
publication.

The reference installer validates the manifest, version compatibility,
checksum, size, SQLite integrity, cloud identity, and current/previous pointer.
It keeps the previous local snapshot until the replacement verifies and uses
bounded retry behavior for interrupted downloads.

## Validation record

Green checkpoint commands:

```powershell
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run db:types
npm run db:types:check
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests -m integration
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
npm run ci
npm run test:e2e --workspace @talence/web -- devices-preview.spec.ts
git diff --check
```

Results:

- blank migration reset: pass through all four Phase 5 migrations;
- database lint: zero warnings;
- pgTAP: 27 files, 746 assertions, all pass;
- Phase 5 pgTAP: 128 assertions (43 + 26 + 36 + 23);
- generated database types: current;
- guarded worker integration: 2/2 pass twice consecutively on one local
  database, with forced import clocks one hour apart;
- Phase 3 Storage/inventory concurrency regression: pass;
- Phase 4 deck concurrency regression: pass;
- root CI: pass;
- web Vitest: 38 files, 223 tests;
- Python ordinary suite: 81 pass, two expected integration skips;
- production Next.js build: pass with all six device API routes;
- device preview Playwright: 4/4 across desktop and mobile Chromium on two
  consecutive fully parallel runs after the readiness fix.

The checkpoint audit found and fixed a real snapshot-rebuild defect: mutable
download and price-ingestion timestamps previously changed SQLite bytes for an
unchanged catalog version. The regression now proves deterministic replay
across deliberately different clocks and repeated runs.

## Manual setup

Hosted setup remains human-controlled:

- credential pepper and server-only worker database/Storage credentials;
- reviewed hosted migrations and private `catalog-snapshots` bucket;
- feature-policy values, snapshot size/URL lifetime, and route/WAF controls;
- first operator-reviewed catalog import and snapshot publication;
- prior-phase Auth/SMTP/CAPTCHA/bootstrap setup.

Nothing in this checkpoint performs hosted setup.

## Deviations and open blockers

- This is a partial Phase 5 checkpoint, not the prescribed full-phase commit.
- The canonical granted inventory read endpoint was optional in the master
  prompt after mandatory endpoints; it is implemented.
- Current HTTP route/action tests mock Auth, RPC, and Storage boundaries.
- Current Supabase Storage adapter tests use mocked HTTP; the database snapshot
  integration uses the local filesystem adapter.
- No true multi-session Phase 5 race harness or root npm command exists yet.
- General prerelease SemVer ordering is lexical and must be hardened or
  explicitly rejected before claiming prerelease compatibility.
- Signed manifest URLs reject credentials and unsafe schemes, but origin/bucket
  binding still needs an explicit contract and live test.
- Pre-auth source throttling/WAF enforcement is Phase 6, not a Phase 5
  checkpoint blocker.

## Precisely what remains in Phase 5

1. Multi-session inventory, run-summary, lifecycle/grant/credential, quota, and
   snapshot-promotion race harness.
2. Guarded live-local issuance-to-device HTTP/RLS/RPC flow across all six
   routes, including replay/conflict, unknown printing, revoke, and suspend.
3. Real local Supabase private Storage upload, signed manifest, download,
   reference install, and prior-snapshot preservation.
4. Live OpenAPI/JSON Schema response conformance and non-preview device
   administration Playwright coverage.
5. Prerelease SemVer and signed-URL origin/bucket decisions and tests.
6. One final clean validation/hygiene pass and the prescribed Phase 5 commit.

See `IMPLEMENTATION_PROGRESS.md` and `RESTART_HANDOFF.md`. Do not begin Phase 6
until this list is complete and Phase 5 is committed with its prescribed final
subject.
