# Phase 6 - Private-beta hardening and delivery

Date: 2026-07-27

Branch: `greenfield/platform-v1`

Starting checkpoint:

```text
433cbcd phase 5: device API and robot catalog snapshot
```

Required checkpoint subject:

```text
phase 6: private beta hardening and delivery
```

Checkpoint SHA: resolve the self-containing checkpoint after commit with
`git log -1 --oneline`.

## Current status

Phase 6 is implemented. The release adds consolidated authorization
regressions, atomic application and external-service quotas, operator kill
switches and safe audit data, production security headers, sanitized
correlated logging, deterministic private-beta fixtures, full live browser
coverage, release scanning, and production runbooks.

No repository action deployed Vercel, mutated hosted Supabase/Auth/Storage,
sent a real invitation, downloaded live provider data, or called a paid
service. Those operations remain explicit human setup.

## Files changed

### Database and generated contracts

- `supabase/migrations/20260727060000_phase_6_operational_controls.sql`;
- `supabase/tests/database/600_phase_6_operational_controls.test.sql`;
- `supabase/tests/database/610_phase_6_complete_rls_matrix.test.sql`;
- `supabase/tests/database/620_phase_6_inventory_summary_performance.test.sql`;
- `supabase/tests/integration/phase6-quota-concurrency.mjs`;
- `apps/web/lib/supabase/database.types.ts`;
- `apps/web/lib/database/contracts.ts`.

### Web hardening and operations

- production request security and correlation logic in `apps/web/proxy.ts`,
  `apps/web/lib/supabase/proxy.ts`, and `apps/web/lib/security`;
- bounded JSON security logging in `apps/web/lib/observability`;
- platform operations page, parsing, actions, and CSS under
  `apps/web/app/(authenticated)/app/admin/operations` and
  `apps/web/features/operations`;
- quota reservations, safe statuses, audit records, and correlation IDs across
  Auth, admin, catalog, collection, deck, settings, and device boundaries;
- security-header, logger, operations parser, and external-quota unit tests;
- dependency pins and overrides in the root/web package manifests and lockfile.

### Fixtures, browser, release automation, and CI

- `scripts/seed-private-beta-fixture.mjs` and its TypeScript declaration;
- `scripts/check-seed-repeatability.mjs`;
- `scripts/run-phase6-critical-journey.mjs`;
- `apps/web/playwright.phase6.config.ts` and
  `apps/web/e2e/phase6-private-beta.spec.ts`;
- source secret, release hygiene, production bundle, and production header
  guards under `scripts/check-*.mjs`;
- `.github/workflows/ci.yml` and `.github/workflows/preview.yml`;
- npm dependency scanning and Python `pip-audit`.

### Documentation

- `docs/operations/backup-and-restore.md`;
- `docs/operations/environment-matrix.md`;
- `docs/operations/incident-response.md`;
- `docs/operations/private-beta-checklist.md`;
- `docs/operations/production-setup.md`;
- `docs/operations/waf-and-rate-limits.md`;
- `README.md`, `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_STATUS.md`,
  `RESTART_HANDOFF.md`, and this log.

## Migration, functions, and policies

### Safe audit model

`public.audit_events` retains bounded event/result/resource codes, an optional
workspace/resource identity, a UUID correlation ID, safe JSON metadata, and a
server timestamp. `safe_audit_metadata_valid` rejects dangerous key names and
oversized payloads. `record_audit_event` validates actor/workspace
relationships before insertion.

The only RLS policy is:

- `audit_events_select_platform_admin`.

Anonymous access and ordinary direct writes are revoked. Ordinary workspace
owners see no rows. The service-side `record_server_audit_event` RPC is
available only to the trusted server role and still applies bounded metadata
validation.

### Application quota model

Private `application_feature_policies` and `application_usage_windows` enforce
atomically locked per-user/workspace minute requests, day requests, day work
units, and maximum work units per request.

Initial policies:

- `catalog_search`: 120 requests/minute, 10,000/day, 240,000 units/day, 200
  units/request;
- `collection_analytics`: 30 requests/minute, 1,000/day, 500,000 units/day,
  5,000 units/request.

Catalog queries reserve by bounded page work. Collection analytics reserves by
the requested result bound before database work. Disabled, oversized, and
exhausted operations fail closed.

### Generic external-service quota model

Private `external_service_policies` and
`external_service_usage_daily` support any reviewed service key and atomic
UTC-day limits over any combination of:

- global;
- admitted user;
- workspace;
- active device.

The initial `managed_auth_invitation` policy permits 100 global, 20 per user,
and 50 per workspace units/day. The trusted invitation action reserves one
unit before calling Supabase Admin Auth, so exhaustion prevents provider work.
The database suite also proves a separate generic service policy with the
device dimension; adding another provider does not require another quota
schema.

### Administration and kill switches

Platform-admin-only functions are:

- `admin_operational_controls`;
- `admin_application_feature_policy_update`;
- `admin_external_service_policy_update`;
- `admin_operational_control_toggle`.

Updates use row locks and expected timestamps, reject stale operators, and
write sanitized audit records. `/app/admin/operations` consolidates
application, external, and existing device policy switches; global/workspace
daily aggregates; and the latest 50 safe events. Existing environment switches
remain independent outer deployment controls.

## Consolidated release RLS matrix

The Phase 6 matrix provisions two admitted users with two personal workspaces,
collections, inventory transactions/imports, decks/revisions, devices/grants,
and audit events. It proves:

- all 36 exposed application tables have RLS enabled;
- no exposed application table has an anonymous or public policy;
- anonymous callers have no direct application-data grants;
- each user sees exactly one identity/workspace/inventory/deck/device root;
- cross-workspace collection, inventory, deck, device, and grant access fails;
- ordinary owners cannot read platform audit events;
- bounded security-definer RPCs preserve the same isolation as table RLS.

The suite temporarily grants transaction-local inventory reads only to test the
RLS layer beneath the intentionally RPC-only production grant surface.

## Security, logging, and release scanning

Every non-static request receives a canonical UUID `X-Request-Id`. The same ID
flows through response envelopes, safe database audit records, and one-line
structured request completion/failure logs. Log fields are allowlisted; raw
bodies, email addresses, tokens, credentials, digests, signed URLs, and
provider payloads are excluded.

The production response baseline includes:

- nonce-based Content Security Policy with `strict-dynamic`;
- Scryfall image, configured Supabase, and Turnstile sources;
- `frame-ancestors 'none'`, restrictive object/media/base/form directives, and
  `upgrade-insecure-requests`;
- HSTS, `nosniff`, `DENY`, restrictive Permissions Policy, and strict-origin
  referrer policy.

Production excludes `unsafe-eval`. A generated production server smoke test
verifies the real response, not only the header builder.

Release automation now checks:

- likely committed secrets and populated sensitive assignments;
- prohibited env/database/bulk/snapshot/legacy/deferred-product artifacts;
- production npm dependencies at high severity;
- installed Python dependencies with `pip-audit`;
- production browser assets for server-only markers and configured secrets;
- production security headers against a running Next build.

The full npm development graph may inherit advisories from lint/documentation
tooling; the shipping production graph is scanned separately and must remain
clean. Do not hide or force-upgrade incompatible transitive developer packages.

## Deterministic seed and critical browser journey

`npm run test:seed:repeatability` imports a committed network-free catalog
fixture at a fixed provider time, provisions two invite-gated Auth users, two
isolated personal workspaces/default collections, and one platform admin, then
replays the seed. The second run must be unchanged and the bounded database
state must be identical.

`npm run test:phase6:local` refuses non-loopback Supabase, resets an empty local
database without the ordinary seed, proves fixture repeatability, and runs the
live Chromium journey. The journey covers:

- production-relevant security and correlation headers;
- keyboard order and serious/critical axe checks;
- admitted login through real Auth cookies;
- catalog search and modal focus/escape/focus return;
- exact inventory addition;
- private Storage CSV upload, preview, and atomic commit;
- deck creation;
- one-time device credential issuance and explicit grants;
- rendered cross-workspace denial;
- platform operations toggle, re-enable, and visible audit record.

The browser uses real local Auth/Postgres/RLS/RPC/Storage and never a static
application preview.

## Performance acceptance

The existing catalog suite retains its representative 50,000-printing indexed
search plan/bound. Phase 6 adds a representative workspace inventory-summary
test with 10,000 exact balance rows. It asserts complete aggregates, explicit
unpriced state, and a five-second local execution ceiling. All network-dependent
catalog work remains fixture-backed.

## Validation record

Final checkpoint commands:

```powershell
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
npm ci
.\scripts\setup-python.ps1
npx supabase db reset --local --no-seed
npm run db:lint
npm run db:types
npm run db:types:check
npm run test:supabase
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
npm run test:phase5:local
npm run test:supabase:phase6-concurrency
npm run test:phase6:local
npm run test:e2e
npm run ci
git diff --check
```

Checkpoint results:

- blank migration reset: pass through the Phase 6 migration;
- database lint: zero warnings;
- pgTAP: 31 files and 808 assertions, all pass;
- generated database types: current;
- Phase 3, Phase 4, Phase 5, and Phase 6 concurrency/integration regressions:
  pass;
- private snapshot Storage and live Phase 5 device/API contract composition:
  pass;
- deterministic fixture: second run unchanged with two isolated identities;
- live Phase 6 critical journey: 1/1 pass;
- desktop/mobile preview browser suite: 19 pass / 3 intentional
  project-specific skips;
- root CI, production dependency/Python audits, build, browser-bundle scan,
  production-header smoke test, formatting, lint, typecheck, unit/contract/
  Python tests, canon manifest, architecture, secret, and release guards:
  pass;
- web Vitest: 41 files / 232 tests;
- contracts/domain/UI/trusted administration: 7 / 2 / 11 / 18 tests;
- Python: 83 pass / 3 intentional environment-gated skips, plus both guarded
  PostgreSQL integrations and the guarded private Storage integration;
- production npm audit and Python audit: zero known shipping vulnerabilities;
- browser bundle scan: 33 static assets and no server-only marker/configured
  secret;
- `git diff --check`: pass.

The exact test counts emitted by the final root CI run are also recorded in
`IMPLEMENTATION_STATUS.md`.

## Route descriptions

Phase 6 adds `/app/admin/operations`, visible only to admitted platform
administrators. It presents three control groups, bounded external usage, and
safe audit history in responsive semantic cards/table markup. Existing
critical routes were exercised at desktop Chromium dimensions; the broader
preview suite retains desktop and mobile route coverage.

## Manual production setup

Humans must still:

- apply reviewed migrations and environment values to hosted projects;
- configure Supabase Site URL/redirects, Before User Created hook, custom SMTP,
  CAPTCHA, Auth limits, backups/PITR, and alerts;
- configure Vercel environment scopes, WAF rules, spend alerts, DNS/TLS, and
  deployment authorization;
- protect Storage separately from database backups and complete a restore
  rehearsal;
- bootstrap the first admin, review production quotas, and enable the smallest
  required switches;
- run the first reviewed live catalog import and snapshot publication.

Exact steps are in `docs/operations/private-beta-checklist.md` and the linked
runbooks.

## Deviations, incomplete items, and risks

- There is no automated production deployment by design. The master prompt
  prohibits push/merge/deploy without current-session authorization.
- Production secrets, hosted dashboard configuration, real SMTP/CAPTCHA/WAF
  behavior, backup restoration, and live provider calls cannot be completed
  locally and remain human-controlled setup.
- The initial external service is managed Auth invitation. The quota model is
  intentionally generic and separately tested with another policy/device
  dimension; no paid browser call or deferred provider subsystem was added.
- Style CSP retains `unsafe-inline` because Next.js/CSS runtime output requires
  it; scripts use a nonce and production excludes `unsafe-eval`.
- There is no open local implementation blocker or incomplete achievable
  Phase 6 acceptance item.
