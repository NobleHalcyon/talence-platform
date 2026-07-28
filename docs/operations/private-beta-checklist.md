# Private-beta release checklist

Last reviewed: 2026-07-27

This checklist separates automated repository evidence from hosted actions that
require a human operator and production credentials. Complete every unchecked
item before enabling a beta invitation.

## Release identity

```text
Branch: greenfield/platform-v1
Checkpoint subject: phase 6: private beta hardening and delivery
Checkpoint SHA:
Vercel production deployment ID:
Supabase project reference:
Primary / secondary operator:
Approval time (UTC):
```

## Automated acceptance

From a fresh PowerShell at the repository root:

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
git status --short
```

Confirm:

- [ ] clean migrations apply through Phase 6;
- [ ] the seed replay is unchanged and produces two isolated users/workspaces;
- [ ] all pgTAP, multi-session, private Storage, and live browser tests pass;
- [ ] the production build, CSP/header smoke test, dependency audits, source
      secret scan, and browser-bundle secret scan pass;
- [ ] all exposed application tables have RLS and no anonymous/public policy;
- [ ] no `.env`, local database, bulk provider download, or generated SQLite
      artifact is staged;
- [ ] no Tailwind, historical application, marketplace, billing, store, or AI
      subsystem has entered the release.

## Supabase

- [ ] hosted migrations were reviewed and applied in order;
- [ ] Before User Created hook targets `app_private.before_user_created`;
- [ ] public registration is disabled and only invited-user creation succeeds;
- [ ] exact Site URL and redirect allowlist are configured;
- [ ] custom SMTP sender/domain and delivery monitoring are configured;
- [ ] Turnstile CAPTCHA is enabled for sign-in/recovery and tested;
- [ ] Auth rate limits are approved and a throttled probe was observed;
- [ ] `inventory-imports` and `catalog-snapshots` are private with the migrated
      MIME/size policies;
- [ ] database backups/PITR, Storage protection, alerts, and operator access are
      configured;
- [ ] a restore rehearsal met the approved RPO/RTO;
- [ ] the first platform administrator was bootstrapped through the trusted
      script and no extra platform admin exists.

## Vercel and domain

- [ ] production and preview environment values follow
      `environment-matrix.md`;
- [ ] no production secret is available to untrusted preview workflows;
- [ ] the canonical HTTPS origin and DNS/TLS are correct;
- [ ] production CSP contains its nonce, Scryfall image host, Supabase origin,
      Turnstile frame/connect sources, HSTS, and no `unsafe-eval`;
- [ ] WAF identity, device API, authenticated-app, and emergency-deny rules
      were observed in log mode and then enforced;
- [ ] spend/usage alerts and the incident contact path are configured;
- [ ] rollback points to a schema-compatible known-good deployment.

## Application and worker

- [ ] invitations, catalog sync, device writes, and snapshot downloads start
      disabled in Vercel;
- [ ] application, external-service, and device quota values were reviewed;
- [ ] `/app/admin/operations` shows controls, usage, and safe audit events;
- [ ] a catalog fixture import is green before the first manually approved live
      Scryfall import;
- [ ] the live worker user agent contains a real contact and respects provider
      pacing;
- [ ] the first snapshot was built, verified, privately published, signed, and
      installed by a reference client;
- [ ] inventory imports remain private and the retention worker is scheduled;
- [ ] device credentials are issued once, stored only as digests, scoped,
      revocable, and separated from human Auth.

## Human critical journey

Using two ordinary beta identities in different workspaces:

- [ ] invite, complete admission, log in, recover, and log out;
- [ ] search catalog and verify source/freshness on priced and missing-price
      records;
- [ ] add exact inventory, preview/resolve/commit a CSV, inspect immutable
      history, and export safely;
- [ ] create and validate a deck against selected collection sources;
- [ ] register a device, acknowledge its credential once, grant only intended
      collections, rotate/revoke it, and verify denial;
- [ ] prove each identity is denied the other workspace’s collection, deck,
      device, and audit data;
- [ ] complete keyboard-only navigation, modal focus return, mobile viewport,
      and accessibility checks.

## Launch and rollback

- [ ] incident commander and backup operator are reachable;
- [ ] a maintenance message and beta-user communication path are ready;
- [ ] enable only the minimum read surfaces, then one write/provider surface at
      a time;
- [ ] watch structured errors, request IDs, audit events, Auth/WAF limits,
      quotas, database health, Storage usage, and provider usage;
- [ ] if isolation, integrity, or secret custody is uncertain, disable writes
      and follow `incident-response.md`;
- [ ] record the final commit, deployment, migration, configuration approval,
      and UTC launch time above.

The repository does not deploy production or mutate hosted Supabase. Those
steps remain explicit human actions.
