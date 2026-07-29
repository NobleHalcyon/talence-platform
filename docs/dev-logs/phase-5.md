# Phase 5 - Device API and robot catalog snapshot

Date: 2026-07-27

Branch: `greenfield/platform-v1`

Starting checkpoint: `905deaf phase 4: collection-aware deck builder`

Foundation checkpoint:

```text
6557191 phase 5 checkpoint: device API and snapshot foundations
```

Final Phase 5 checkpoint subject:

```text
phase 5: device API and robot catalog snapshot
```

Checkpoint SHA: resolve the final checkpoint from `git log` after commit

## Current status

Phase 5 is fully implemented and validated. Database/device authorization,
Next.js administration and all six stable machine routes, deterministic
snapshot generation, real private Storage, the robot reference client,
multi-session concurrency, and live Auth/RLS/RPC/HTTP contract composition are
complete.

The commit containing this log is the prescribed final Phase 5 checkpoint.
Resolve its SHA after commit. Phase 6 has not started. No remote repository
action, hosted migration, hosted Storage mutation, deployment, or paid-service
call occurred.

## Files changed

Database and generated surface:

- `supabase/migrations/20260727050000_phase_5_device_snapshot_schema.sql`;
- `supabase/migrations/20260727051000_phase_5_snapshot_and_device_admin_functions.sql`;
- `supabase/migrations/20260727052000_phase_5_device_api_inventory_and_runs.sql`;
- `supabase/migrations/20260727053000_phase_5_device_rls_grants.sql`;
- `supabase/migrations/20260727054000_phase_5_semver_compatibility.sql`;
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
- `apps/web/playwright.phase5.config.ts` and
  `apps/web/e2e/phase5-live-device.spec.ts` for guarded non-preview Auth,
  administration, all-route, Storage, and contract composition.
- Canonical and copied `device-api.openapi.yaml`, generated `device-api.ts`,
  and `MANIFEST.json` for the corrected sealed inventory-page metadata schema.

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
- `services/catalog-worker/tests/test_snapshot_storage_integration.py` for real
  local private Storage publication/sign/download/install retention;
- `supabase/tests/integration/phase5-device-concurrency.mjs` and
  `supabase/tests/database/540_phase_5_semver_compatibility.test.sql`;
- `scripts/lib/local-supabase.mjs`,
  `scripts/run-phase5-storage-integration.mjs`, and the root Phase 5 validation
  commands;
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
- `app_private.catalog_publish_snapshot`;
- `app_private.device_semver_gte`.

Inventory batches normalize and hash bounded lines, require an explicit write
grant, serialize first use of a device/idempotency identity, and call the Phase
3 ledger core. Run summaries serialize both idempotency and external-run
identities. Identical requests replay; conflicting reuse fails.

Snapshot publication holds the catalog-promotion lock, verifies the exact
active import and artifact metadata, rejects stale promotion, preserves the
previous compatible snapshot, and treats same-version changed bytes as a
conflict.

SemVer compatibility follows SemVer 2.0 precedence, ignores build metadata,
compares arbitrary-size numeric identifiers numerically, orders numeric
prerelease identifiers below non-numeric identifiers, and rejects invalid
leading zeroes.

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

Manifest signing accepts only the exact configured Supabase origin, private
bucket, and immutable version path, with a required Storage token and no URL
credentials or fragments. HTTPS is mandatory except for guarded loopback
development.

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

The real local Storage integration publishes two generations to the private
bucket, verifies immutable replay and changed-byte rejection, signs both
objects through Storage, installs them with the reference client, compares
sampled cloud printing IDs, proves anonymous public access is denied, and
retains the prior installed version. HTTP is permitted only for loopback test
services; hosted project and download URLs remain HTTPS-only.

## Validation record

Green checkpoint commands:

```powershell
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run db:types
npm run db:types:check
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests\test_database_integration.py services\catalog-worker\tests\test_snapshot_database_integration.py -q
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
npm run test:phase5:local
npm run test:e2e --workspace @talence/web -- devices-preview.spec.ts
npm run ci
git diff --check
```

Results:

- blank migration reset: pass through all five Phase 5 migrations;
- database lint: zero warnings;
- pgTAP: 28 files, 754 assertions, all pass;
- the SemVer compatibility migration adds eight focused assertions;
- generated database types: current;
- guarded worker/PostgreSQL integration: 2/2 pass;
- Phase 3 Storage/inventory concurrency regression: pass;
- Phase 4 deck concurrency regression: pass;
- Phase 5 multi-session concurrency: pass across inventory and run identities,
  lifecycle/credential/grant ordering, quota serialization, and snapshot
  create/replay/stale promotion/previous-pointer behavior;
- real private Storage integration: 1/1 pass in 63.05 seconds;
- live non-preview Auth/admin/API/OpenAPI/JSON Schema integration: 1/1 pass;
- canonical manifest, copied contracts, OpenAPI 3.1, three JSON Schemas,
  generated types, and SQLite schema validation: pass;
- root CI: pass;
- web Vitest: 38 files, 223 tests;
- contracts/domain/UI/admin: 7/2/11/18 tests pass;
- Python ordinary suite: 83 pass, three expected environment-gated integration
  skips; the three guarded local integration paths pass separately;
- production Next.js build: pass with all six device API routes;
- device preview Playwright: 4/4 across desktop and mobile Chromium;
- `git diff --check`: pass.

The foundation audit fixed a snapshot-rebuild defect where mutable download and
price-ingestion timestamps could alter bytes for one catalog version. The final
live audit also fixed an OpenAPI composition defect where sealed base metadata
made `next_cursor` impossible. Both have direct regressions.

## Manual setup

Hosted setup remains human-controlled:

- credential pepper and server-only worker database/Storage credentials;
- reviewed hosted migrations and private `catalog-snapshots` bucket;
- feature-policy values, snapshot size/URL lifetime, and route/WAF controls;
- first operator-reviewed catalog import and snapshot publication;
- prior-phase Auth/SMTP/CAPTCHA/bootstrap setup.

Nothing in this checkpoint performs hosted setup.

## Deviations and open blockers

- The canonical granted inventory read endpoint was optional after the
  mandatory endpoints; it is implemented and live-validated.
- Local Supabase uses HTTP by design. The worker, reference client, and signed
  URL validator permit it only for loopback; hosted URLs remain HTTPS-only.
- Pre-auth source throttling/WAF rules, broad security headers, dependency and
  secret scanning, complete cross-feature Playwright, operations readiness,
  and deployment acceptance are Phase 6 work, not deferred Phase 5 scope.
- Phase 5 has no open implementation blocker.

See `IMPLEMENTATION_PROGRESS.md` and `RESTART_HANDOFF.md` for the Phase 6 resume
point.
