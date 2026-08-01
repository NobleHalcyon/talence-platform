# Talence implementation status

Last updated: 2026-08-01

Branch: `filter-updates`

Current milestone: Phase 6 implemented and prepared for the prescribed final
checkpoint.

Current post-greenfield work: the catalog and collection filtering redesign is implemented and validated on `filter-updates`. It is additive, preserves all Auth/catalog/inventory data, and is documented in `docs/catalog-filtering.md` and `docs/dev-logs/catalog-filtering-redesign.md`.

## Checkpoint commits

```text
35be284 Initialize Talence greenfield platform
211e438 phase 0: greenfield platform scaffold
56cece3 phase 1: invite-only identity and workspace foundation
2cc652c phase 2: canonical catalog pricing and browse
d819a17 phase 3: auditable collection inventory
905deaf phase 4: collection-aware deck builder
6557191 phase 5 checkpoint: device API and snapshot foundations
433cbcd phase 5: device API and robot catalog snapshot
phase 6: private beta hardening and delivery
```

Because a commit cannot contain its own final hash, resolve the Phase 6 SHA
after creation with:

```powershell
git log -1 --oneline
```

The Phase 6 checkpoint was not pushed or merged when it was created. Later
post-greenfield work uses separate branches. No production deployment occurred,
and no hosted Supabase/Auth/Storage state or live provider was changed.

## Architecture and repository state

- Next.js 16 App Router, React, and strict TypeScript in `apps/web`.
- npm workspaces for web, domain, semantic UI, and machine contracts.
- CSS Modules and shared Talence CSS tokens; no Tailwind dependency, config, or
  class wall.
- Supabase PostgreSQL/Auth/Storage/RLS with ordered migrations and pgTAP.
- Python 3.13 network-guarded catalog/snapshot worker.
- versioned `/api/v1` device contract plus a separate SQLite robot reference
  client.
- Vercel target and GitHub Actions validation; no automatic production
  deployment credentials.
- Canonical numbered docs and machine-readable contracts remain authoritative.
- No historical Talence application dependency and no marketplace, billing,
  store, recommendation AI, or remote robot-motion subsystem.

## Completed product and security behavior

### Invitation and workspaces

- No registration route and no public `signUp` call.
- User creation is gated by `app_private.invited_users` and the Supabase Before
  User Created hook.
- Managed Auth owns human passwords/sessions/recovery.
- Admission atomically creates profile, personal workspace, owner membership,
  preferences, and default MTG collection.
- Every mutable human resource is workspace-scoped; active owner invariants and
  default-deny RLS are tested.
- Platform-admin invitation/bootstrap/revoke/status workflows use trusted
  server/CLI paths.

### Catalog and pricing

- Normalized sets, cards, printings, faces, legalities, external IDs, source
  files/imports, active state, and finish-specific current observations.
- Bounded indexed browse/detail/admin RPCs and responsive web routes.
- Network-safe worker with fixed fixtures, provider identity, redirect/host/
  size/hash/pacing/retry checks, idempotent unchanged imports, and atomic
  promotion.
- Prices always carry provider, currency, observation, ingestion, and stale
  state; missing is never zero.

### Collections and inventory

- Workspace collections, exact physical balances, immutable transactions and
  lines, idempotency, transfers, compensating reversals, history, analytics,
  valuation, private CSV imports, retention, and safe exports.
- All quantity changes use locked transaction functions. Ordinary sessions
  cannot directly write balances or committed history.
- Import files are private, bounded, staged, explicitly resolved when
  ambiguous, and committed as one additive transaction.

### Decks

- Workspace deck formats/versions, entries, selected collection sources,
  immutable revisions, validation evidence, ownership/value, history, export,
  and archive/restore.
- Optimistic revision conflicts and cross-workspace source denial.
- Collection ownership and value stay finish-specific and preserve unpriced
  state.

### Devices and robot snapshots

- Independent 256-bit device credentials returned once, then stored only as a
  prefix plus server-peppered digest.
- Scoped/revocable lifecycle and explicit collection read/write/run grants.
- Six stable machine routes for identity, heartbeat, catalog manifest,
  inventory read, idempotent inventory batch, and idempotent run summary.
- Canonical response/error envelope, request IDs, bounded inputs, constant-time
  credential checks, feature policy/quotas, and safe error details.
- Deterministic verified SQLite snapshots in private immutable Storage with
  current/previous manifests and complete SemVer compatibility.
- Reference installer verifies contract/client/schema version, size, SHA-256,
  SQLite integrity, cloud identity, and retains a prior generation.
- No cloud endpoint starts motion and no cloud table stores execution,
  checkpoint, motor, bin, sensor, camera, or motion-plan state.

### Phase 6 operations and release hardening

- `public.audit_events`: bounded safe metadata, UUID correlation, platform-admin
  read policy, no anonymous or ordinary workspace visibility.
- Atomic application request/work-unit windows for `catalog_search` and
  `collection_analytics`.
- Generic external-service daily reservation across any configured combination
  of global/user/workspace/device scopes. `managed_auth_invitation` reserves
  before the Supabase Admin provider call.
- `/app/admin/operations`: application/external/device kill switches,
  optimistic updates, aggregate usage, and recent safe events.
- Per-request structured logs and `X-Request-Id` across non-static human and
  device traffic. Only allowlisted identifiers/status/duration fields are
  emitted.
- Production nonce CSP for Scryfall, configured Supabase, and Turnstile;
  HSTS, Permissions Policy, referrer policy, clickjacking/content-type guards,
  and production exclusion of `unsafe-eval`.
- Practical source secret, release artifact, production dependency, Python
  dependency, browser-bundle secret, and built-server header scanning in CI.
- Repeatable offline two-user/two-workspace/Auth/catalog seed.
- Full real local critical browser journey with accessibility/keyboard/focus
  checks and rendered cross-workspace denial.
- Final WAF/Auth rate, environment, backup/restore, incident, production, and
  release checklist documentation.

## Database migrations, RLS, and transaction surface

The empty database applies 26 numbered migration files through:

```text
20260727060000_phase_6_operational_controls.sql
```

Phase 6 adds:

- exposed `public.audit_events` with
  `audit_events_select_platform_admin`;
- private `application_feature_policies`;
- private `application_usage_windows`;
- private `external_service_policies`;
- private `external_service_usage_daily`;
- quota reservation, server audit, admin read/update, and generic toggle
  functions documented in `docs/dev-logs/phase-6.md`.

The release matrix enumerates all 36 exposed application tables, verifies RLS
on every one, proves there is no anonymous/public policy or direct application
grant, and exercises two users’ identity, collections, inventory, imports,
decks, devices, grants, RPCs, and audit isolation.

Inventory writes still route only through the immutable Phase 3 functions.
Device inventory calls compose through the same ledger. Quota first use and
exhaustion serialize with row locks and exact counters.

## Routes

Human application:

- identity invitation/callback/login/recovery/settings;
- `/app`, `/app/catalog`, catalog card/printing/set detail, and admin catalog;
- `/app/collections`, collection detail/history/import/export;
- `/app/decks` and `/app/decks/[deckId]`;
- `/app/devices` and `/app/devices/[deviceId]`;
- `/app/admin/invites`, `/app/admin/catalog`, and
  `/app/admin/operations`.

Machine API:

- `GET /api/v1/device/me`;
- `POST /api/v1/device/heartbeat`;
- `GET /api/v1/device/catalog/manifest`;
- `GET /api/v1/device/collections/[collectionId]/inventory`;
- `POST /api/v1/device/collections/[collectionId]/inventory-batches`;
- `POST /api/v1/device/runs`.

## Final validation commands and results

Clean database and generated surface:

```powershell
npx supabase db reset --local --no-seed
npm run db:lint
npm run db:types
npm run db:types:check
npm run test:supabase
```

Result:

- empty reset passed through all Phase 6 migrations;
- database lint reported zero warnings;
- generated types matched;
- 31 pgTAP files / 808 assertions passed.

Guarded integrations:

```powershell
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
npm run test:phase5:local
npm run test:supabase:phase6-concurrency
npm run test:phase6:local
```

Result:

- Phase 3 Storage/inventory concurrency passed;
- Phase 4 deck concurrency passed;
- Phase 5 device/snapshot concurrency, real private Storage, and live all-route
  device contract flow passed;
- Phase 6 admitted exactly 3 of 8 concurrent application and external quota
  reservations and rejected 5 with exact counters;
- repeatable fixture replayed unchanged with one catalog import, four active
  printings, two admitted identities, two isolated workspaces/collections, and
  one platform admin;
- live Phase 6 critical journey passed 1/1.

Repository, unit, worker, production build, and release checks:

```powershell
npm ci
.\scripts\setup-python.ps1
npm run test:e2e
npm run ci
git diff --check
```

Result:

- canonical manifest and copied/generated machine contracts passed;
- architecture, secret, release hygiene, production npm dependency, Python
  dependency, browser-bundle secret, and production-header guards passed;
- formatting, ESLint, strict TypeScript, trusted-admin typecheck, Ruff, Python
  formatting, and strict mypy passed;
- web Vitest passed 41 files / 232 tests;
- contracts/domain/UI/trusted administration passed 7 / 2 / 11 / 18 tests;
- Python passed 83 tests with three intentional environment-gated skips; the
  two guarded PostgreSQL tests and private Storage test passed separately;
- production Next.js build passed with all authenticated and machine routes;
- desktop/mobile preview Playwright passed 19 tests with three intentional
  project-specific skips;
- production npm and Python audits reported zero known shipping
  vulnerabilities, and 33 browser static assets contained no server marker or
  configured secret;
- `git diff --check` passed.

See `docs/dev-logs/phase-6.md` for the complete feature-to-evidence mapping.

## Manual production setup remaining

The codebase is deployment-ready, but production is intentionally not
configured. A human with current credentials and authorization must:

1. choose hosted Vercel and Supabase projects and apply reviewed migrations;
2. enter exact browser, server, and worker environment values;
3. configure Auth redirects, Before User Created hook, custom SMTP, Turnstile,
   Auth rate limits, and email templates;
4. configure private Storage, database backups/PITR, Storage protection,
   monitoring, alerts, operator access, and a restore rehearsal;
5. configure DNS/TLS, Vercel Firewall rules, spend alerts, and deployment
   approval;
6. bootstrap the first platform administrator and review every quota/switch;
7. run the first approved live catalog import/snapshot/reference installation;
8. execute the human two-workspace journey and enable beta surfaces
   incrementally.

Exact values and sign-off order are in
`docs/operations/private-beta-checklist.md`.

## Incomplete items

No locally achievable master-prompt or Phase 6 acceptance item is incomplete.

The following are incomplete only because they require external credentials,
hosted dashboard access, production authorization, or human observation:

- hosted migration and deployment;
- real SMTP, CAPTCHA, Auth limit, WAF, DNS/TLS, backup/PITR, alert, and spend
  configuration;
- live provider import/snapshot publication;
- production restore rehearsal and operator sign-off;
- invitation of real private-beta users.

These are the external/human exceptions explicitly allowed by the master
prompt. They were not replaced with code placeholders.

## Known risks

- Database backups do not include Supabase Storage object bytes; both private
  buckets need a separately rehearsed protection/reconciliation process.
- Production rate/WAF thresholds require observation and tuning. Edge rules
  complement, rather than replace, database authorization and quotas.
- CSP retains `style-src 'unsafe-inline'` for framework/CSS compatibility;
  scripts are nonce-based and production excludes `unsafe-eval`.
- Full npm audit can report advisories in development-only lint/documentation
  dependency trees. The shipping production dependency graph is the enforced
  high-severity gate; incompatible forced transitive upgrades are not hidden.
- Device pepper loss or rotation invalidates credential verification and
  requires planned re-enrollment.
- Rollback must remain schema compatible; immutable inventory, revisions, and
  snapshot bytes must never be repaired in place.

## Operator entry point

Read, in order:

1. `docs/operations/private-beta-checklist.md`;
2. `docs/operations/environment-matrix.md`;
3. `docs/operations/production-setup.md`;
4. `docs/operations/waf-and-rate-limits.md`;
5. `docs/operations/backup-and-restore.md`;
6. `docs/operations/incident-response.md`.
