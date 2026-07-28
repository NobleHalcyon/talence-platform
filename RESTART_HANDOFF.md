# Restart handoff - Phase 5 complete, Phase 6 next

Date: 2026-07-27

Branch: `greenfield/platform-v1`

## Resume point

Phase 5 is fully implemented and validated. The commit containing this file is
the prescribed Phase 5 checkpoint:

```text
phase 5: device API and robot catalog snapshot
```

Resolve its SHA with `git log -1 --oneline` after restart. It follows the
foundation checkpoint:

```text
6557191 phase 5 checkpoint: device API and snapshot foundations
```

Phase 6 has not started in this checkpoint. No change was pushed, deployed, or
applied to hosted Supabase, Storage, or Vercel.

## Read first

1. `AGENTS.md`;
2. every file under `docs/canonical/`;
3. the original Master Greenfield Build Prompt;
4. `IMPLEMENTATION_PROGRESS.md`;
5. `IMPLEMENTATION_STATUS.md`;
6. `docs/dev-logs/phase-5.md`;
7. the Phase 6 acceptance criteria in the master prompt;
8. this file and recent git history.

Preserve the completed Phase 5 database, HTTP, Storage, worker, robot reference
client, concurrency, and live conformance surfaces.

## First terminal checks

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -5 --oneline
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
docker version
npx supabase start
```

Expected branch: `greenfield/platform-v1`.

Expected worktree: clean at `phase 5: device API and robot catalog snapshot`.
Local Supabase data and private Storage fixtures are disposable.

## Phase 5 closure delivered

- true multi-session inventory, run-summary, lifecycle, credential/grant,
  quota, and snapshot-promotion concurrency;
- real private Supabase Storage publication, byte verification, signing,
  reference installation, anonymous denial, and previous-snapshot retention;
- complete SemVer prerelease precedence;
- exact configured Storage origin/bucket/path signed-URL binding;
- non-preview invitation/Auth/device administration through real RLS/RPCs;
- all six `/api/v1/device` routes under live OpenAPI/JSON Schema validation;
- replay/conflict, unknown printing, revoked credential, and suspended device
  proofs;
- corrected canonical inventory-page metadata schema and regenerated contracts;
- clean reset, 754-assertion pgTAP suite, older phase regressions, local
  integrations, desktop/mobile preview tests, and complete root CI/build.

## Phase 6 work, in master-prompt order

1. Complete a cross-feature two-user/two-workspace RLS regression matrix,
   including anonymous and wrong-workspace denial.
2. Add real or production-faithful Playwright critical flows:
   invitation/login fixture path, catalog search, collection add/import
   preview, deck creation, device credential/grant, and cross-workspace denial.
3. Add and verify security headers and a CSP compatible with required Scryfall
   image hosts.
4. Document and test the Vercel/edge WAF rate-limit/challenge rules; finish
   hosted Auth rate-limit/CAPTCHA configuration guidance.
5. Verify application quotas and external-service limits; add operator-facing
   feature kill switches for risky operations.
6. Standardize sanitized structured logging and correlation IDs without
   credentials, signed URLs, bodies, or sensitive provider details.
7. Add practical dependency and secret scanning to CI.
8. Finish accessibility, keyboard, focus, and representative search/inventory
   performance acceptance.
9. Complete backup/restore, monitoring, incident response, production
   environment, deployment, and human setup/runbook documentation.
10. Audit canon/contracts/README and run the final clean private-beta
    acceptance matrix.
11. Create the prescribed Phase 6 checkpoint:

```text
phase 6: private beta hardening and delivery
```

Do not reduce scope or substitute placeholders. Hosted mutations and production
deployment still require explicit user authorization.

## Known-good Phase 5 validation commands

```powershell
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
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

`npm run test:phase5:local` runs the guarded Phase 5 concurrency harness, real
private Storage integration, and live non-preview browser/API contract flow in
the required order. Every integration target is constrained to loopback and
the standard disposable local database.

## Important implementation notes

- Docker Desktop is installed per-user. Add the two paths above when a new VS
  Code terminal does not inherit `docker.exe`.
- Storage objects can outlive a database reset. Phase 5 publication verifies
  identical replays and rejects changed bytes at immutable paths.
- The Phase 3 ledger remains the only inventory authority.
- Raw device credentials are returned once and never persisted. Only a prefix
  and server-peppered digest are stored.
- Manifest URLs must match the configured Supabase origin,
  `catalog-snapshots` bucket, and exact immutable version path.
- Local HTTP is accepted only on loopback; hosted service and download URLs
  require HTTPS.
- No cloud endpoint starts motion, and no cloud table stores robot execution
  checkpoints, motor/bin/sensor/camera state, or motion plans.
- A Next development server can temporarily rewrite `apps/web/next-env.d.ts`
  to `.next/dev/types/routes.d.ts`; the committed/build state remains
  `.next/types/routes.d.ts`.

## Manual setup remains human-controlled

The hosted credential pepper, worker database/Storage credentials, private
bucket, feature-policy values, signed-URL lifetime, first snapshot publication,
WAF/Auth/CAPTCHA controls, production environment values, and deployment remain
unset. Do not perform those actions without fresh user authorization.
