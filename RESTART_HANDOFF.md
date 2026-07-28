# Restart handoff - Phase 6 complete

Date: 2026-07-27

Branch: `greenfield/platform-v1`

## Resume point

The Talence greenfield master implementation is complete through Phase 6. The
final checkpoint containing this handoff has the prescribed subject:

```text
phase 6: private beta hardening and delivery
```

Resolve its self-referential SHA after restart:

```powershell
git log -1 --oneline
```

It follows:

```text
433cbcd phase 5: device API and robot catalog snapshot
```

No remote push/merge, hosted migration, production deployment, Auth/Storage
mutation, real invitation, or live provider call occurred.

## Read first

1. `AGENTS.md`;
2. every file under `docs/canonical/`;
3. the original Master Greenfield Build Prompt;
4. `IMPLEMENTATION_PROGRESS.md`;
5. `IMPLEMENTATION_STATUS.md`;
6. `docs/dev-logs/phase-6.md`;
7. this file and recent git history.

Do not regenerate or replace the completed Phase 0-6 implementation.

## First terminal checks

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -8 --oneline
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
docker version
npx supabase status
```

Expected branch: `greenfield/platform-v1`.

Expected repository state after the checkpoint: clean at
`phase 6: private beta hardening and delivery`. Local Supabase data and private
Storage fixtures are disposable and ignored.

## Phase 6 delivered

- consolidated RLS regression over all 36 exposed tables using two admitted
  users and two isolated workspaces;
- atomic application request/work-unit quotas and generic external-service
  global/user/workspace/device daily reservations;
- provider-before-call enforcement for managed Auth invitations;
- platform operations page for application/external/device kill switches,
  bounded usage, optimistic updates, and sanitized audit events;
- nonce-based production CSP and the full response security-header baseline;
- canonical correlation IDs and allowlisted structured request/security logs;
- source/release/browser bundle secret scans, npm production audit, Python
  dependency audit, and CI integration;
- repeatable network-free catalog/Auth/two-workspace private-beta fixture;
- live browser path through login, catalog, keyboard modal, inventory, real
  Storage import, deck, device credential/grants, workspace denial, operations,
  audit, and axe accessibility checks;
- representative inventory summary performance acceptance;
- complete environment, WAF/Auth limits, backup/restore, incident, production,
  and release sign-off documentation.

The generic external model is not invitation-specific: tests add another
service and exercise its device scope. The release RLS matrix includes direct
policy/grant checks and bounded RPC denials rather than only checking one table.

## Known-good validation

From PowerShell:

```powershell
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
npm ci
.\scripts\setup-python.ps1
npx playwright install chromium
npx supabase start
npx supabase db reset --local --no-seed
npm run db:lint
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

Checkpoint evidence:

- clean reset through Phase 6, zero database lint warnings, no type drift;
- 31 pgTAP files / 808 assertions;
- all prior-phase and Phase 6 multi-session/Storage/live regressions;
- exact 3/8 concurrent quota admission at a limit of 3;
- unchanged fixture replay with two isolated admitted identities;
- live Phase 6 browser journey 1/1;
- web 41 files / 232 tests; contracts/domain/UI/admin 7/2/11/18;
- Python 83 pass / 3 intentional environment skips plus guarded database and
  Storage integrations;
- desktop/mobile preview 19 pass / 3 intentional project skips;
- production build, dependency/secret/release/bundle/header scans, unit/
  contract/worker suites, and preview browser coverage.

`npm run test:phase6:local` resets the local database itself before seeding and
running the browser. Direct `npm run test:e2e:phase6-live` assumes the fixture
is already present and is not the clean standalone entry point.

## Important implementation notes

- Docker Desktop is installed per-user; add the two PATH entries above when a
  new VS Code terminal cannot find `docker.exe`.
- All integration scripts verify loopback endpoints and refuse a hosted
  Supabase target.
- A Next development server may temporarily rewrite `apps/web/next-env.d.ts`
  to development route types. The production/build form uses
  `.next/types/routes.d.ts`.
- Storage objects can survive a database reset. Phase 5 publication treats
  snapshot paths as immutable and verifies bytes.
- The Phase 3 ledger remains the only inventory mutation authority.
- Raw device credentials are returned once and never persisted.
- Cloud routes never start motion or store robot execution state.
- Application and external quotas are database-atomic. WAF/IP controls are an
  additional layer, not a substitute.
- Audit/log metadata must remain allowlisted. Never add bodies, email
  addresses, tokens, credentials, digests, signed URLs, or provider payloads.

## Remaining work

There is no remaining locally achievable master-prompt implementation phase.
Do not invent Phase 7 or broaden into deferred marketplace, billing, store, AI,
or robot-motion systems.

The next legitimate work unit is human-authorized production setup:

1. complete `docs/operations/private-beta-checklist.md`;
2. configure the environment matrix, hosted migrations, Auth hook/redirects,
   SMTP, CAPTCHA, limits, WAF, backups/PITR, Storage protection, and alerts;
3. rehearse restore and incident procedures;
4. bootstrap the first admin and review every switch/quota;
5. manually approve the first live catalog import and snapshot publication;
6. deploy only with explicit current-session authorization;
7. execute the human acceptance journey and enable beta access incrementally.

External credentials, hosted dashboards, real provider traffic, and production
authorization are required for those steps. Repository code intentionally
cannot complete them alone.
