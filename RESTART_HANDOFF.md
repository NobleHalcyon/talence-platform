# Restart handoff - Phase 5 partial checkpoint

Date: 2026-07-27

Branch: `greenfield/platform-v1`

## Resume point

The commit containing this file is the partial checkpoint:

```text
phase 5 checkpoint: device API and snapshot foundations
```

Resolve its SHA with `git log -1 --oneline` after restart. It follows:

```text
905deaf phase 4: collection-aware deck builder
```

The checkpoint contains the coherent Phase 5 database/device API/web
administration/snapshot-worker foundations and their current green validation.
It is not the final Phase 5 checkpoint. Phase 6 has not started.

## Read first

1. `AGENTS.md`;
2. every file under `docs/canonical/`;
3. the master build prompt supplied by the user;
4. `IMPLEMENTATION_PROGRESS.md`;
5. `IMPLEMENTATION_STATUS.md`;
6. `docs/dev-logs/phase-5.md`;
7. this file.

Do not reimplement or discard the checkpointed foundations. Continue only the
remaining Phase 5 work listed below.

## First terminal checks

```powershell
Set-Location C:\Users\judge\talence-platform
git branch --show-current
git status --short
git log -3 --oneline
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
docker version
npx supabase start
```

Expected branch: `greenfield/platform-v1`.

Expected worktree: clean at the partial Phase 5 checkpoint. Local Supabase data
is disposable and may not survive the editor restart.

## Remaining Phase 5 work, in order

1. Build the guarded multi-session Phase 5 concurrency harness for device
   inventory, run summaries, lifecycle/grant/credential races, quota races, and
   snapshot publication races. Add its root npm command.
2. Build a guarded live-local device integration path across admitted human
   setup, one-time credential issuance, device authentication, real RLS/RPCs,
   grants, all six HTTP routes, inventory replay/conflict, unknown printing,
   revoke, and suspend.
3. Integrate real local Supabase private Storage for create-only snapshot
   upload, download verification, signed manifest, reference installation, and
   previous-compatible-snapshot retention.
4. Validate live HTTP responses against the canonical OpenAPI/JSON Schema and
   add a non-preview device administration Playwright flow.
5. Resolve the prerelease SemVer comparison and signed-URL origin/bucket
   binding decisions recorded in `IMPLEMENTATION_PROGRESS.md`.
6. Run the final clean Phase 5 matrix and hygiene audit. Only then use the
   prescribed full-phase commit subject:

```text
phase 5: device API and robot catalog snapshot
```

Stop before Phase 6 unless the user explicitly directs continuation.

## Known-good validation commands

```powershell
npx supabase db reset --local --no-seed
npm run db:lint
$env:Path = "C:\Users\judge\AppData\Local\Programs\Docker\Docker\resources\bin;C:\Users\judge\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
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

The worker integration guard accepts only the disposable local Supabase
PostgreSQL endpoint. Do not set an override to point it at hosted data.

## Important implementation notes

- The credential prefix is 12 lowercase hexadecimal characters; the database
  accepts the compatible bounded lowercase alphanumeric shape.
- Raw device credentials are displayed once and are never stored. Only
  server-peppered HMAC digests cross the database boundary.
- The Phase 3 ledger remains the sole inventory authority.
- Snapshot bytes are reproducible for a catalog version. Provider observation
  is normalized to catalog-version second precision for snapshot generation,
  and mutable worker download/ingestion clocks are not embedded.
- `catalog-snapshots` is private, create-only for the worker flow, and has a
  1 GiB configured ceiling. A Supabase stop/start is required after changing
  `supabase/config.toml`; database reset alone does not recreate Storage
  configuration.
- No cloud endpoint starts motion, and no cloud table stores robot execution
  checkpoints, motor/bin/sensor/camera state, or motion plans.
- Nothing has been pushed, merged, deployed, or applied to hosted services.

## Manual setup remains human-controlled

The hosted credential pepper, worker database and Storage credentials, private
bucket, feature policy values, signed-URL lifetime, first snapshot publication,
and all production deployment settings remain unset. Do not perform those
actions without fresh user authorization.
