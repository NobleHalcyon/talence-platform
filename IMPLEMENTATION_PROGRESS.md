# Talence implementation progress

Last updated: 2026-07-27

Branch: `greenfield/platform-v1`

## Checkpoint position

Phases 0 through 4 are complete at:

```text
905deaf phase 4: collection-aware deck builder
```

The initial Phase 5 foundation is committed at:

```text
6557191 phase 5 checkpoint: device API and snapshot foundations
```

Phase 5 is now fully implemented and validated. The commit containing this
document must use the prescribed subject:

```text
phase 5: device API and robot catalog snapshot
```

Resolve its SHA with `git log -1 --oneline` after the checkpoint is created.
Phase 6 has not yet started. Nothing was pushed, deployed, or applied to a
hosted Supabase, Storage, or Vercel project.

## Phase 5 completed

### Database, authorization, and concurrency

- Added workspace-scoped devices, private digest-only credentials, explicit
  collection grants, immutable sync batches and run summaries, catalog
  snapshots, idempotency records, feature policies, and quota windows.
- Added bounded owner/admin device administration and service-only device API
  functions with default-deny RLS and least-privilege execution grants.
- Routed device inventory writes through the Phase 3 immutable ledger with
  device-wide idempotency, replay, conflict detection, and catalog identity
  checks.
- Added deterministic snapshot publication with exact active-generation
  validation, create/replay conflict safety, stale publisher rejection, and
  current/previous snapshot retention.
- Implemented full SemVer precedence for snapshot minimum-client matching:
  release versus prerelease, numeric identifiers, numeric versus non-numeric
  identifiers, build metadata, invalid leading zeroes, and unbounded numeric
  identifiers.
- Added a loopback-only multi-session harness covering:
  - identical and conflicting inventory keys;
  - run-summary idempotency and external-run identity;
  - in-flight suspension, credential revocation, and grant revocation;
  - concurrent quota first use and exhaustion;
  - concurrent snapshot create/replay, stale promotion, and prior pointer
    retention.

### Web administration and stable machine API

- Implemented responsive non-preview and preview device list/detail,
  registration, one-time credential acknowledgement, rotation/revocation,
  lifecycle, and explicit collection-grant controls.
- Implemented all six canonical `/api/v1/device` routes:
  - `GET /api/v1/device/me`;
  - `POST /api/v1/device/heartbeat`;
  - `GET /api/v1/device/catalog/manifest`;
  - `GET /api/v1/device/collections/[collectionId]/inventory`;
  - `POST /api/v1/device/collections/[collectionId]/inventory-batches`;
  - `POST /api/v1/device/runs`.
- Kept raw device secrets one-time only. The database receives only a bounded
  non-secret prefix and a server-peppered HMAC-SHA-256 digest.
- Added strict Bearer parsing, constant-time verification, bounded JSON/query
  parsing, idempotency-key requirements, canonical envelopes, correlation IDs,
  safe error details, quotas, feature switches, and prohibited robot-state
  rejection.
- Bound accepted manifest URLs to the exact configured Supabase origin,
  `catalog-snapshots` bucket, immutable object path, and signed token. Hosted
  URLs require HTTPS; local loopback development may use HTTP.
- Corrected the canonical OpenAPI `InventoryPageResponse.meta` schema so the
  required `request_id` and `next_cursor` coexist under a sealed object, then
  regenerated contract types and updated the canonical manifest.

### Snapshot worker, private Storage, and robot reference client

- Added repeatable-read extraction under the shared catalog-promotion lock and
  deterministic populated SQLite generation in primary-key order.
- Added canonical metadata/counts, exact decimal prices, FTS, foreign-key and
  integrity checks, byte-size limits, and SHA-256 verification.
- Kept rebuilds byte-identical by deriving generated/ingested timestamps from
  provider observation rather than mutable worker clocks.
- Added immutable local-file and real Supabase private Storage adapters.
  Upload and verification complete before database publication.
- Added a reference installer with bounded retry, manifest/client/schema
  compatibility, checksum, size, SQLite integrity, cloud printing identity,
  and current/previous installation checks.
- Permitted HTTP only for loopback Storage/reference-client integration;
  non-local download and project URLs remain HTTPS-only.
- Added a guarded real-local Storage test covering two snapshot publications,
  create-only replay, changed-byte rejection, signed downloads, reference
  installation, sampled cloud printing parity, anonymous denial, and previous
  snapshot preservation.

### Live composition and contract conformance

- Added a dedicated non-preview Playwright configuration that discovers and
  refuses anything except disposable local Supabase endpoints.
- The live flow:
  - creates an Auth user only after inserting a valid invitation;
  - signs in through the real login UI and uses actual Auth cookies;
  - finalizes the admitted profile/workspace through RLS/RPC;
  - registers the device through the browser and captures the credential once;
  - saves all three explicit collection grants;
  - calls all six HTTP routes against real Auth/Postgres/RLS/RPC/Storage;
  - validates requests with the canonical JSON Schemas and every live response
    with the dereferenced OpenAPI 3.1 schema;
  - downloads and hashes the signed private SQLite artifact;
  - proves inventory and run replay/conflict behavior plus actionable unknown
    printing diagnostics;
  - revokes the first credential and suspends a rotated credential, proving
    both fail closed with canonical 401 responses.

## Final Phase 5 validation evidence

- Blank `npx supabase db reset --local --no-seed`: pass through all Phase 5
  migrations.
- `npm run db:lint`: zero warnings.
- `npm run test:supabase`: 28 files and 754 assertions pass.
- `npm run db:types` and `npm run db:types:check`: pass with no drift.
- Guarded worker/PostgreSQL integration: 2/2 pass.
- Phase 3 Storage/inventory concurrency regression: pass.
- Phase 4 deck concurrency regression: pass.
- Phase 5 device/snapshot concurrency: pass.
- Real private Storage publication/reference install: 1/1 pass.
- Real non-preview Auth/admin/all-route contract flow: 1/1 pass.
- Device preview Playwright: 4/4 across desktop and mobile Chromium.
- Canonical manifest, copied contracts, OpenAPI, JSON Schemas, generated
  contract types, and SQLite schema validation: pass.
- Root `npm run ci`: pass, including:
  - web Vitest: 38 files / 223 tests;
  - contracts: 7 tests;
  - domain: 2 tests;
  - UI: 11 tests;
  - trusted administration: 18 tests;
  - Python: 83 passed / 3 environment-gated skips;
  - Ruff, strict mypy, formatting, lint, typecheck, architecture guard, and
    production Next.js build.
- `git diff --check`: pass.

## Phase 6 is next

No Phase 6 implementation is included in the Phase 5 checkpoint. The next work
unit must complete the master-prompt Phase 6 acceptance criteria:

- full two-user/two-workspace RLS regression;
- critical-flow browser coverage across Auth, catalog, collection/import,
  decks, and devices;
- CSP/security headers, edge/WAF documentation, Auth/CAPTCHA production
  controls, application quotas, and kill switches;
- sanitized structured logging and correlation IDs;
- dependency and secret scanning in CI;
- accessibility, keyboard, focus, and representative performance acceptance;
- backup/restore, monitoring, incident, deployment, environment, and operator
  documentation;
- final canonical/contract consistency, clean-reset, seed, CI, security, and
  repository-hygiene audit.

## Manual production setup still required

- Configure hosted credential pepper and server-only worker database/Storage
  credentials.
- Apply reviewed migrations and the private `catalog-snapshots` bucket to
  hosted development before production.
- Choose production feature-policy limits and signed-URL lifetime.
- Run the first operator-reviewed catalog import, snapshot publication, and
  device fixture.
- Complete the earlier Auth/SMTP/CAPTCHA/bootstrap setup and all Phase 6
  private-beta readiness controls.
- Do not push, deploy, mutate hosted state, or publish the first snapshot
  without fresh explicit authorization.

See `IMPLEMENTATION_STATUS.md`, `RESTART_HANDOFF.md`, and
`docs/dev-logs/phase-5.md` for the detailed record.
