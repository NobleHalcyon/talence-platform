# Talence implementation progress

Last updated: 2026-07-27

Branch: `greenfield/platform-v1`

## Checkpoint position

Phases 0 through 4 are complete and committed. The latest completed phase is:

```text
905deaf phase 4: collection-aware deck builder
```

The commit containing this document is a safe, partial Phase 5 work-unit
checkpoint with subject:

```text
phase 5 checkpoint: device API and snapshot foundations
```

This is intentionally not the prescribed final Phase 5 commit. Phase 5 is not
complete, and Phase 6 has not started. No work was pushed, deployed, or applied
to a hosted Supabase or Storage project.

## Completed in the Phase 5 checkpoint

### Database and authorization

- Added workspace-scoped devices, private digest-only credentials, collection
  grants, immutable sync batches, thin run summaries, catalog snapshots,
  mutation-idempotency records, feature policies, and usage windows.
- Added owner/admin device registration, update, lifecycle, credential
  rotation/revocation, grant replacement, feature-policy, and bounded read
  functions.
- Added service-only credential candidate/auth touch, stable device API RPCs,
  atomic inventory batches through the Phase 3 immutable ledger, idempotent run
  summaries, quota consumption, and snapshot publication.
- Added default-deny RLS, safe human column reads, least-privilege function
  execution, and no service-role direct table CRUD.
- Added advisory first-use serialization for inventory idempotency and run
  summary idempotency/external-run identities.
- Added deterministic snapshot publication replay, stale-generation rejection,
  current/previous compatible pointers, bounded metadata, and immutable
  artifact records.

### Web administration and stable API

- Replaced the device placeholders with responsive device list/detail,
  registration, one-time credential acknowledgement, lifecycle, credential,
  and collection-grant controls.
- Implemented all six canonical `/api/v1/device` routes:
  - `GET /api/v1/device/me`;
  - `POST /api/v1/device/heartbeat`;
  - `GET /api/v1/device/catalog/manifest`;
  - `GET /api/v1/device/collections/[collectionId]/inventory`;
  - `POST /api/v1/device/collections/[collectionId]/inventory-batches`;
  - `POST /api/v1/device/runs`.
- Implemented a 256-bit secret in the
  `tlc_dev_<12 lowercase hex>_<43 base64url>` credential format, HMAC-SHA-256
  digesting with a server-only pepper, constant-time comparison, a dummy
  unknown-prefix comparison, strict Bearer parsing, and one-time raw display.
- Added bounded body/query/idempotency parsing, canonical envelopes,
  correlation/request IDs, safe error mapping, prohibited robot-state
  rejection, manifest compatibility handling, and signed-URL safety checks.
- Regenerated the Supabase database types and added device API/admin unit and
  responsive preview coverage.

### Catalog snapshot worker and reference client

- Added repeatable-read extraction under the shared catalog-promotion lock.
- Populated the canonical SQLite schema deterministically in primary-key order,
  including FTS, canonical arrays, exact decimal text, metadata, counts,
  versions, integrity checks, foreign-key checks, checksum, and size limits.
- Added immutable local-file and Supabase Storage adapters. Upload completes
  and verifies before the database pointer is published.
- Added a reference installer with retry, manifest, checksum, size, integrity,
  cloud-identity, current, and previous snapshot checks.
- Made rebuilds of one catalog version byte-identical. Snapshot generation and
  edge price-ingestion timestamps use the provider observation encoded in the
  version rather than mutable worker wall-clock timestamps.
- Added fixture, local Storage, mocked Supabase Storage, reference-client, and
  guarded live-local PostgreSQL integration tests.

## Green validation evidence

- Blank `npx supabase db reset --local --no-seed` applies all migrations,
  including the four Phase 5 migrations.
- `npm run db:lint` reports no warnings.
- `npm run test:supabase` passes 27 files and 746 assertions. Phase 5 contributes
  128 assertions:
  - snapshot/schema/publication: 43;
  - device administration/credentials/grants: 26;
  - device API/inventory/runs/snapshots: 36;
  - two-workspace RLS: 23.
- `npm run db:types` and `npm run db:types:check` pass.
- The complete root `npm run ci` chain passes, including format, lint, strict
  TypeScript, contract validation, Python Ruff/mypy/pytest, and production
  build.
- Web Vitest passes 38 files and 223 tests; the other TypeScript suites pass 38
  additional tests.
- Python pytest passes 81 tests with two intentionally environment-gated
  integration skips in the ordinary CI path.
- With the guarded loopback database configured, both worker integration tests
  pass twice consecutively on the same database. They cover catalog
  promotion/replay/failure preservation, deterministic snapshot replay and
  forced repromotion, SQLite integrity, and sampled cloud/edge printing parity.
- Phase 3 Storage/inventory concurrency and Phase 4 deck concurrency regression
  harnesses pass.
- Device preview Playwright passes 4/4 in desktop and mobile Chromium on two
  consecutive fully parallel runs after dynamic-route readiness was pinned.

## Precisely what remains in Phase 5

1. Add a true multi-session Phase 5 concurrency harness and a root package
   command. It must cover:
   - identical and conflicting inventory idempotency keys;
   - run-summary idempotency and duplicate external-run races;
   - grant, suspension, revocation, or credential rotation racing an in-flight
     device request;
   - quota-window first use and exhaustion races;
   - snapshot publication/replay/stale-promotion races.
2. Add a guarded live-local device integration flow against Supabase Auth,
   PostgreSQL, RLS, RPCs, and the Next.js HTTP routes:
   - admit a human and workspace;
   - issue a raw credential once;
   - authenticate the device;
   - grant a collection;
   - exercise all six routes, inventory replay/conflict, and actionable unknown
     printing errors;
   - prove revoke/suspend/grant denial without mocked boundaries.
3. Exercise the real local private `catalog-snapshots` Storage bucket end to
   end: worker create-only upload and verification, manifest signed URL,
   reference-client download/install, and prior-snapshot preservation. Current
   database integration uses local filesystem Storage, while the Supabase
   adapter uses mocked HTTP.
4. Add HTTP/OpenAPI/JSON Schema conformance assertions for live route responses
   and a live device administration Playwright flow. Current route/action tests
   intentionally mock Auth, RPC, and Storage; preview Playwright validates the
   responsive UI only.
5. Close two compatibility/defense-in-depth edges before calling Phase 5
   complete:
   - implement numeric SemVer prerelease ordering or explicitly reject
     prerelease minimum versions;
   - bind accepted manifest signed URLs to the configured Supabase Storage
     origin/bucket, or document and test the deliberate any-HTTPS-origin
     contract.
6. Rerun the complete clean matrix and repository-hygiene audit, then create
   the prescribed final Phase 5 commit:

```text
phase 5: device API and robot catalog snapshot
```

Pre-auth source throttling/WAF rules, broad security headers, deployment
readiness, and the complete cross-feature Playwright matrix remain Phase 6
work. They must not be pulled into the Phase 5 completion list.

## Manual production setup still required

- Configure the hosted credential pepper and server-only Supabase worker
  credentials.
- Apply the reviewed migrations and private `catalog-snapshots` bucket
  configuration to hosted development before production.
- Configure feature-policy limits, signed-URL lifetime, and the first
  operator-reviewed snapshot publication.
- Complete the existing hosted Auth/SMTP/CAPTCHA/bootstrap and catalog import
  setup from earlier phases.
- Do not push, deploy, mutate hosted state, or publish the first snapshot
  without fresh explicit authorization.

See `RESTART_HANDOFF.md`, `IMPLEMENTATION_STATUS.md`, and
`docs/dev-logs/phase-5.md` for restart details and the full implementation
record.
