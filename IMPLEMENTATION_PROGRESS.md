# Talence implementation progress

Last updated: 2026-08-01

Branch: `filter-updates`

## Post-greenfield catalog filtering redesign

The `filter-updates` branch adds the shared progressive catalog/collection filtering system without changing authentication, inventory ownership, device contracts, or existing database rows. It includes a typed URL filter tree, server-side AND/OR/NOT compiler, normalized types and numeric P/T/L, multi-artist and legality filters, bounded data-derived facets, matching Oracle representatives, debounced quick filters, wide/mobile advanced panels, shared owned-printing collection filtering, and desktop/mobile browser coverage.

Implementation and current validation evidence are recorded in `docs/dev-logs/catalog-filtering-redesign.md`; steady-state behavior is documented in `docs/catalog-filtering.md`.

## Checkpoint position

The greenfield master build is complete through Phase 6. Checkpoints:

```text
211e438 phase 0: greenfield platform scaffold
56cece3 phase 1: invite-only identity and workspace foundation
2cc652c phase 2: canonical catalog pricing and browse
d819a17 phase 3: auditable collection inventory
905deaf phase 4: collection-aware deck builder
6557191 phase 5 checkpoint: device API and snapshot foundations
433cbcd phase 5: device API and robot catalog snapshot
phase 6: private beta hardening and delivery
```

The Phase 6 SHA is intentionally not embedded in the commit that defines it.
Resolve it with `git log -1 --oneline` after the checkpoint. Post-greenfield
feature work uses separate branches; nothing was deployed or applied to hosted
Supabase/Auth/Storage or Vercel.

## Completed phases

### Phase 0 - greenfield foundation

- Established the locked npm-workspace, Next.js/React/TypeScript, CSS Modules,
  Supabase, Python 3.13, Vercel, test, and CI structure.
- Checked in canonical docs/contracts and guards against architecture drift,
  public registration, Tailwind, and historical application imports.
- Added Windows-friendly setup and clean database smoke automation.

### Phase 1 - invitation, identity, and workspaces

- Added invite-gated Before User Created admission, idempotent profile/personal
  workspace/default collection provisioning, recovery/login/logout/settings,
  and trusted admin scripts.
- Enforced default-deny workspace RLS, active membership/role rules, and final
  owner protection.
- Kept human identity entirely in managed Supabase Auth; there is no public
  registration route or application-owned password/session system.

### Phase 2 - canonical catalog and pricing

- Added normalized global catalog, provider identities, faces/legalities,
  current finish-specific price observations, active import promotion, and
  bounded browse/detail/admin RPCs.
- Added the offline-testable Scryfall worker with download/redirect/size/hash/
  retry guards, deterministic fixture import, and failure-safe promotion.
- Added indexed search and representative 50,000-printing performance proof.
  Missing prices remain missing and every present price carries source and
  freshness.

### Phase 3 - auditable inventory

- Added workspace collections, exact balances, immutable transactions/lines,
  idempotent mutations, transfers, reversals, history, valuation, analytics,
  private CSV import, retention, and safe export.
- Removed ordinary direct balance/history writes; every quantity mutation
  crosses a locked PostgreSQL transaction function.
- Added real local Storage and multi-session concurrency coverage.

### Phase 4 - collection-aware decks

- Added formats/versions, workspace decks, entries, selected collection
  sources, immutable revisions, validation evidence, ownership/value, history,
  export, archive/restore, and responsive editing.
- Added optimistic concurrency, cross-workspace source denial, revision-bound
  validation, and price/ownership behavior that never treats missing as zero.

### Phase 5 - device API and robot snapshot

- Added digest-only scoped/revocable device credentials, explicit collection
  grants, lifecycle administration, feature policies/quotas, idempotent
  inventory batches and run summaries, and six stable `/api/v1/device` routes.
- Added deterministic SQLite catalog snapshots, private immutable Storage
  publication, active/previous manifests, full SemVer compatibility, and the
  separate robot reference installer.
- Proved live Auth/RLS/RPC/HTTP/OpenAPI/JSON Schema/Storage composition and
  concurrent lifecycle, quota, idempotency, and promotion invariants.
- Kept robot motion and execution checkpoints entirely outside cloud state.

### Phase 6 - private-beta hardening and delivery

- Added a consolidated two-user/two-workspace release RLS matrix covering all
  exposed tables, direct grants, and bounded cross-feature RPCs.
- Added private application request/work-unit windows and a generic atomic
  external-service UTC-day quota model over global/user/workspace/device
  scopes. Managed Auth invitation reserves before provider work.
- Added platform-admin operations controls for application, external, and
  device switches, daily usage, optimistic updates, and sanitized audit events.
- Added UUID request correlation and allowlisted structured security/request
  logging across browser and device boundaries.
- Added nonce-based production CSP, Scryfall/Supabase/Turnstile compatibility,
  HSTS, Permissions/Referrer/Frame/Content-Type headers, and a built-server
  header smoke test.
- Added source/release/browser-bundle secret scanning, production npm audit,
  Python dependency audit, repository hygiene guards, and CI coverage.
- Added a repeatable network-free catalog/two-workspace/Auth fixture.
- Added a live browser critical journey across login, catalog, modal keyboard
  focus, inventory, real Storage import preview/commit, deck creation, device
  credential/grants, cross-workspace denial, operations toggle/audit, and axe
  serious/critical checks.
- Added representative 10,000-row inventory-summary performance acceptance.
- Added the final environment, WAF/Auth/rate-limit, backup/restore, incident,
  production setup, and private-beta sign-off runbooks.

## Phase 6 database surface

Migration:

- `20260727060000_phase_6_operational_controls.sql`.

New exposed RLS table:

- `public.audit_events`, selectable only by admitted platform administrators.

New private tables:

- `application_feature_policies`;
- `application_usage_windows`;
- `external_service_policies`;
- `external_service_usage_daily`.

New bounded functions:

- `consume_application_feature_quota`;
- `consume_external_service_quota`;
- `record_server_audit_event`;
- `admin_operational_controls`;
- `admin_application_feature_policy_update`;
- `admin_external_service_policy_update`;
- `admin_operational_control_toggle`.

Ordinary direct writes are revoked. Private quota/policy tables are not exposed.
Audit metadata is bounded and rejects secret-bearing key names.

## Validation evidence

The completed Phase 6 checkpoint has green evidence for:

- empty local database migration through all 26 ordered migrations;
- database lint with zero warnings and generated database types with no drift;
- pgTAP: 31 files / 808 assertions;
- Phase 3 inventory/Storage, Phase 4 deck, Phase 5 device/snapshot, and Phase 6
  quota multi-session regressions;
- real private snapshot Storage publication/reference installation;
- live Phase 5 Auth/device/all-route OpenAPI and JSON Schema composition;
- repeatable Phase 6 seed and live full critical journey;
- desktop/mobile preview browser coverage;
- canonical manifest, architecture, source-secret, release-hygiene,
  production-dependency, browser-bundle-secret, and production-header guards;
- formatting, lint, strict TypeScript, worker Ruff/mypy/pytest/pip-audit,
  unit/contract suites, and production Next.js build;
- web Vitest 41 files / 232 tests; contracts/domain/UI/admin 7/2/11/18;
- Python 83 pass / 3 intentional environment skips plus all guarded
  PostgreSQL/Storage integrations;
- desktop/mobile preview browser 19 pass / 3 intentional project skips;
- `git diff --check`.

Exact command output and test counts are recorded in
`docs/dev-logs/phase-6.md` and `IMPLEMENTATION_STATUS.md`.

## Achievable work remaining

No locally achievable master-prompt implementation or Phase 6 acceptance item
is incomplete.

## Manual production setup remaining

Only credentialed/human operations remain:

- approve and apply hosted migrations;
- enter Vercel/server/worker secrets and environment values;
- configure Supabase redirects, Before User Created hook, SMTP, CAPTCHA, Auth
  limits, backups/PITR, alerts, and private Storage protection;
- configure Vercel DNS/TLS, WAF/rate/challenge rules, spend alerts, and
  authorized deployment;
- complete a restore rehearsal and fill operator/incident contacts;
- bootstrap the first platform admin and review quota/feature values;
- perform the first approved live catalog import/snapshot publication;
- enable production surfaces incrementally and invite beta users.

Follow `docs/operations/private-beta-checklist.md`. The repository intentionally
does not perform those actions.
