# Production setup

Production provisioning is intentionally human-controlled. No production
project, credential, email provider, CAPTCHA secret, push, or deployment was
changed by Phases 1 or 2.

## Phase 1 private-beta identity checklist

Complete these steps in a non-production Supabase project first, then repeat
them deliberately in production.

### 1. Apply and verify the database

Apply all committed migrations to an empty project before enabling invitations.
Run the database lint and pgTAP suite against a clean local stack first:

```powershell
npx supabase start
npx supabase db reset
npm run db:lint
npm run db:types:check
npm run test:supabase
```

The Phase 1 migrations create the private invitation ledger, Auth hook,
admission finalizer, workspace foundation, least-privilege grants, and RLS. Do
not add `app_private` or `app_api` to the exposed Data API schemas.

### 2. Configure Supabase Auth

In the hosted Supabase dashboard:

1. Keep public self-signup, anonymous sign-in, manual identity linking, SMS
   signup, and unused identity providers disabled.
2. Under URL Configuration, set the Site URL to the exact production origin,
   for example `https://app.example.com`.
3. Add these exact production redirect URLs:

   ```text
   https://app.example.com/auth/callback?type=invite&next=/invite/complete
   https://app.example.com/auth/callback?type=recovery&next=/reset-password
   ```

   Replace the host, keep HTTPS, and do not use a production wildcard.

4. In Auth Hooks, enable **Before User Created** with the PostgreSQL function:

   ```text
   pg-functions://postgres/app_private/before_user_created_hook
   ```

5. Confirm the migrations left `EXECUTE` on that function only for
   `supabase_auth_admin`, not `anon`, `authenticated`, or `public`.

Supabase documents the supported
[Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
and recommends exact production
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

### 3. Configure server-readable email links

In Authentication > Email Templates, retain the surrounding branded HTML but
make the primary link target use the following exact values. HTML attributes
must use `&amp;`.

Invite user:

```html
<a
  href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=invite&amp;next=/invite/complete"
>
  Accept invitation
</a>
```

Reset password:

```html
<a
  href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/reset-password"
>
  Reset password
</a>
```

These links let the server callback verify the token and set the SSR session
before rendering the next page. Disable provider-side click tracking that
rewrites authentication links. Review Supabase's
[email-template guidance](https://supabase.com/docs/guides/auth/auth-email-templates),
including link-prefetch behavior, before choosing a production mail provider.

### 4. Configure SMTP, abuse controls, and CAPTCHA

1. Configure a production custom SMTP provider and validate invite and recovery
   delivery, SPF, DKIM, and DMARC.
2. Review project-wide email limits plus recovery, OTP, verification, and token
   limits under Authentication > Rate Limits.
3. Create a Cloudflare Turnstile widget restricted to the production hostname.
4. Under Settings > Authentication > Bot and Abuse Protection, enable CAPTCHA,
   choose Turnstile, and store the Turnstile secret there.
5. Put only the Turnstile site key in the web environment as
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The CAPTCHA secret is not a Vercel/browser
   variable.
6. Add WAF limits for `/login`, `/forgot-password`, `/auth/callback`, and the
   invitation administration route. Test recovery responses for account
   enumeration resistance.

The application passes the Turnstile response to Supabase for sign-in and
password recovery. Production auth actions fail closed if the public site key
is absent. See Supabase's current
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha) and
[Auth rate-limit](https://supabase.com/docs/guides/auth/rate-limits)
documentation.

### 5. Set the Phase 1 web environment

Set these in the Vercel project, using separate values per environment:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_ORIGIN
NEXT_PUBLIC_TURNSTILE_SITE_KEY
SUPABASE_SECRET_KEY
INVITATION_DEFAULT_TTL_DAYS
FEATURE_INVITATIONS_ENABLED
```

`NEXT_PUBLIC_APP_ORIGIN` must be the exact HTTPS origin with no path. Keep
`SUPABASE_SECRET_KEY` server-only. Enable
`FEATURE_INVITATIONS_ENABLED=true` only after the hook, redirect allowlist,
templates, SMTP, CAPTCHA, and rate limits have been verified.

The trusted administration CLI additionally needs either
`TALENCE_DATABASE_URL` or `SUPABASE_DB_URL`. It may use
`TALENCE_AUTH_INVITE_REDIRECT_URL`; otherwise it derives the typed invite
callback from `NEXT_PUBLIC_APP_ORIGIN`. Do not put database credentials in
Vercel browser variables or repository files.

### 6. Bootstrap the first platform administrator

The database allows an actor-less trusted invitation only while there are zero
platform administrators. Run the trusted CLI from a secured operator machine:

```powershell
$env:SUPABASE_URL = "https://project-ref.supabase.co"
$env:SUPABASE_SECRET_KEY = "sb_secret_replace_me"
$env:TALENCE_DATABASE_URL = "postgresql://replace-with-direct-connection"
$env:NEXT_PUBLIC_APP_ORIGIN = "https://app.example.com"
$env:FEATURE_INVITATIONS_ENABLED = "true"

npm run admin:invite -- --email owner@example.com
```

Accept that email, set the managed Auth password, and complete the Talence
profile. The finalizer must create the profile, personal workspace, owner
membership, preferences, and default MTG collection. Then grant the initial
platform role:

```powershell
npm run admin:bootstrap -- --email owner@example.com
```

Record the returned Auth user UUID. Every later trusted operation supplies it:

```powershell
$ownerUserId = "replace-with-returned-uuid"
npm run admin:invite -- --email tester@example.com --actor-user-id $ownerUserId
npm run admin:invite-status -- --email tester@example.com --actor-user-id $ownerUserId
npm run admin:revoke-invite -- --email tester@example.com --actor-user-id $ownerUserId
```

The database rechecks that actor's active admission and `platform_admin` role;
the secret key alone is not the application authorization decision.

### 7. Production acceptance probes

Before admitting real users, verify:

- an email absent from `app_private.invited_users` is rejected by Auth;
- expired, revoked, failed, and metadata-mismatched invitations are rejected;
- a valid invite completes once and replay does not duplicate resources;
- a suspended profile cannot enter the application;
- one user cannot read another workspace;
- revoke removes a pending Auth identity or reports cleanup reconciliation;
- recovery remains generic for malformed, unknown, and provider-rejected email;
- browser bundles contain no secret key or direct database URL.

## Phase 2 catalog and pricing checklist

Complete the import lifecycle in a hosted development project before touching
production. A fixture import proves plumbing; it is not production catalog
data.

### 1. Apply and verify the catalog database

Apply all committed migrations to an empty/local database and then to hosted
development. Regenerate and verify the public database type contract:

```powershell
npx supabase db reset
npm run db:lint
npm run db:types
npm run db:types:check
npm run test:supabase
```

The Phase 2 migrations add public catalog identity, price, source/import/state
tables and private import staging. Keep `app_private` and `app_api` absent from
the exposed Data API schema list.

Verify that:

- anonymous, inactive, and suspended users cannot read catalog data;
- active admitted users can read only active catalog identity;
- current prices and catalog operational state have no direct authenticated
  table grant and are returned only by bounded RPCs;
- ordinary users cannot insert, update, or delete any catalog row;
- only the trusted worker can use `app_private` staging/import functions;
- admin status/queue RPCs require service role plus an active
  `platform_admin` actor.

The pgTAP performance suite seeds 50,000 deterministic printings, asserts the
full-text GIN plan and exact result, and applies a five-second local ceiling.
Recheck hosted query plans and latency with production-like statistics; the
local ceiling is a regression guard, not a hosted-service SLA.

Immediately close the database import gate in a newly migrated hosted project
until the controlled import window:

```sql
update public.catalog_state
set sync_enabled = false
where singleton_id = 1;
```

Run that statement only in the intended hosted project with a trusted database
role. Do not expose `catalog_state` as a browser-writable setting.

### 2. Provision the worker environment

Use a protected operator or worker environment, never a browser or
`NEXT_PUBLIC_` variable:

```powershell
$env:TALENCE_DATABASE_URL = "<direct PostgreSQL worker URL>"
$env:TALENCE_CATALOG_USER_AGENT = "Talence-Catalog-Worker/0.2 (+https://your-domain.example/contact)"
$env:TALENCE_CATALOG_MAX_DOWNLOAD_BYTES = "2000000000"
$env:TALENCE_CATALOG_REQUEST_TIMEOUT_SECONDS = "30"
$env:TALENCE_CATALOG_MAXIMUM_ATTEMPTS = "4"
$env:TALENCE_CATALOG_RETRY_BASE_SECONDS = "0.5"
$env:TALENCE_CATALOG_METADATA_MINIMUM_INTERVAL_SECONDS = "0.11"
$env:TALENCE_CATALOG_BATCH_SIZE = "1000"
$env:TALENCE_CATALOG_PRICE_STALE_AFTER_HOURS = "36"
```

Replace the contact URL with a monitored real contact/reference. Use the hosted
provider's protected direct or pooler PostgreSQL connection appropriate for a
long-running worker and enforce TLS according to that provider's current
instructions. Do not put the database URL on a command line, in Vercel browser
variables, workflow source, logs, or repository files.

`TALENCE_CATALOG_TEMP_DIRECTORY` is optional. If set, provision enough private
ephemeral space for the bounded bulk file and ensure cleanup/monitoring. The
worker does not require `SUPABASE_SECRET_KEY` for the Phase 2 import path.

### 3. Prove fixture behavior without provider traffic

Install the Python 3.13 package in the protected environment and run:

```powershell
talence-catalog validate
talence-catalog fixture-import --dry-run
```

Both commands are offline and perform no database write. Against the hosted
development database, deliberately open the database gate, promote the fixture,
and inspect status:

```sql
update public.catalog_state
set sync_enabled = true
where singleton_id = 1;
```

```powershell
talence-catalog fixture-import
talence-catalog status
```

Confirm representative single-face, multi-face, foreign-language, token,
missing-price, zero-price, and multiple-finish observations. Repeat the same
fixture import and verify it returns an unchanged-source no-op. Use `--force`
only when deliberately testing replay.

Close the hosted-development database gate again if no worker is expected to
run.

### 4. Perform the first live import manually

Do not enable the web queue or GitHub live job for the first provider import.
Choose a monitored maintenance window, open the database gate, and run:

```powershell
talence-catalog live-import --trigger-type manual
talence-catalog status
```

The worker must select exactly Scryfall `all_cards`, accept bulk bytes only from
the official download host, and stop rather than promote when its size,
normalization, relational validation, or live-count floors fail.

After success, verify:

- active set/card/printing/face/legality/external-ID counts are plausible;
- source SHA, consumed-set dependency SHA, observed time, active catalog
  version, and import record are present;
- a second unforced run is a no-op only for the same active source identity;
- an unforced queued run with the active provider/set identity completes
  replay-safely without downloading the bulk file, while a forced or changed
  queue proceeds to download;
- catalog search, all filters, all sort modes, and cursor navigation work;
- an omitted `lang` filters to English, `lang=all` deliberately includes all
  languages, and another valid language code selects only that language;
- card, printing, and set detail render multi-face and foreign/token examples;
- missing prices say `Price unavailable`, explicit zero remains visible, and
  provider/finish/currency/observed/ingested/stale data are present;
- direct provider images load without a transformation or application proxy;
- the prior catalog remains active after an intentionally failed candidate in
  a non-production rehearsal.
- closing `catalog_state.sync_enabled` during a non-production import blocks the
  next heartbeat or promotion, records stable `sync_disabled` failure, and
  preserves the prior active catalog.

Close `catalog_state.sync_enabled` if continued imports are not yet approved.

### 5. Deliberately enable admin queueing and scheduling

The web queue has two gates:

1. `public.catalog_state.sync_enabled=true` permits import/queue functions.
2. Server-only `FEATURE_CATALOG_SYNC_ENABLED=true` permits the admin action.

Set the Vercel feature variable only after a protected worker can claim queued
rows. The `/app/admin/catalog` request only queues work; it does not dispatch or
run the import. With the repository as committed, an operator claims a queued
UUID explicitly:

```powershell
talence-catalog live-import --queued-import-id "<queued-run-uuid>" --trigger-type manual
```

`.github/workflows/catalog-sync.yml` intentionally has no schedule or secret
wiring, and its live job is guarded by `if: false`. After the first manual live
import, production acceptance, alerting, and cost controls:

1. store the worker database URL and user-agent through protected repository or
   environment secrets;
2. limit workflow/environment access and require the chosen approval;
3. remove the explicit live-job guard;
4. add the reviewed daily cron;
5. test queue claiming, failure alerting, stale-lease recovery, and emergency
   closure of both sync gates.

Do not enable web queueing while no dispatcher/operator will claim rows.

## Phase 3 collection inventory and import checklist

Complete this rehearsal in hosted development before accepting private-beta
inventory. Do not use production collections for the first import, transfer,
reversal, or retention run.

### 1. Apply schema and verify the authorization surface

Apply the ordered Phase 3 migrations, regenerate database types, and run the
complete local database/Storage/concurrency validation documented in
`docs/dev-logs/phase-3.md`.

In hosted development, verify:

- anonymous, inactive, and suspended users cannot read collection data;
- a viewer can read an authorized active collection but cannot mutate it or
  inspect private import staging;
- an editor can create inventory transactions and imports but cannot soft-delete
  a collection;
- an owner can manage collection lifecycle, subject to default, positive
  inventory, and nonterminal-import guards;
- direct authenticated insert/update/delete on balances and committed history
  fails;
- retention/expiry RPCs are service-role-only;
- `app_private` and `app_api` remain absent from the Data API schema list.

### 2. Verify private import Storage

Confirm the `inventory-imports` bucket is private with a 2 MiB object limit.
Use an admitted editor and an actual hosted Auth session to prove:

- only the exact `<workspace-id>/<import-job-id>/source.csv` path is accepted;
- owner, MIME type, byte count, SHA-256, job ID, and parser-version metadata
  match the database job;
- the editor can read the exact authorized source object;
- another workspace and a viewer cannot read it;
- update, upsert, arbitrary-path insert, and delete fail.

Never grant ordinary users object deletion to simplify cleanup. The source
object is evidence for the staged import and remains insert-once.

### 3. Rehearse inventory and CSV behavior

With representative single-face, multi-face, foreign-language, foil, etched,
zero-price, and missing-price printings:

- add, reduce, remove, and transfer exact physical variants;
- replay an identical idempotency key and then prove a changed body conflicts;
- submit concurrent changes and verify neither quantity nor history is lost;
- provoke an expected-quantity conflict and confirm the UI shows the current
  state;
- reverse a normal change and a paired transfer without editing prior history;
- deactivate a referenced catalog identity in non-production and verify owned
  copies remain reducible/transferable/reversible while new arbitrary additions
  stay denied;
- upload matched, ambiguous, rejected, and name-only suggestion rows;
- confirm ambiguity cannot commit until explicitly resolved or excluded;
- download the safe error report and a formula-cell-resistant inventory export;
- confirm value, unpriced quantity, provider, finish, currency, observed time,
  ingestion time, and stale state.

### 4. Operate import expiry and retention

Run a protected service process on a reviewed schedule:

1. call `inventory_import_expire_stale(...)` to move abandoned queued/running
   jobs into terminal cancellation;
2. page `inventory_import_retention_candidates(...)`;
3. delete each exact private Storage object with the service role;
4. call `inventory_import_mark_purged(...)` only after object deletion.

Keep the default raw/staging retention at 30 days unless a shorter reviewed
policy is adopted. Monitor expired, failed, cancelled, committed, and purged
counts plus retained bytes. Rehearse interruption between object deletion and
the idempotent database mark so the next run recovers safely.

## Phase 4 deck checklist

Phase 4 requires no additional external provider. After applying its migrations:

1. Confirm deck tables expose only the reviewed authenticated RLS policies and
   ordinary sessions cannot write revisions directly.
2. Create, edit, validate, export, archive, and restore one deck through the
   application.
3. Select one or more same-workspace collection sources and prove that a
   cross-workspace collection cannot be attached.
4. Race two edits from the same revision and verify one succeeds while the
   stale editor receives a conflict.
5. Preserve immutable revisions/validation evidence and never infer missing
   prices as zero.

## Phase 5 device and snapshot checklist

### 1. Configure trusted runtime values

Set in Vercel Production:

- a new independent `DEVICE_CREDENTIAL_PEPPER`;
- `TALENCE_CATALOG_SNAPSHOT_BUCKET=catalog-snapshots`;
- reviewed request-body and signed-URL limits;
- `FEATURE_DEVICE_INVENTORY_WRITES_ENABLED=false`;
- `FEATURE_SNAPSHOT_DOWNLOADS_ENABLED=false`.

Set the worker’s protected Supabase URL/secret, direct database URL, snapshot
limits, client/API versions, and `TALENCE_SNAPSHOT_STORAGE_BACKEND=supabase`.
Follow `environment-matrix.md`; never place these values in browser variables.

### 2. Verify private Storage and credentials

The ordered migration creates the private `catalog-snapshots` bucket. Confirm:

- anonymous public object access is denied;
- only exact immutable version paths are published;
- uploaded bytes are re-downloaded and checked before database publication;
- generated signed URLs use the exact project origin, bucket, object path, and
  a short expiry;
- changed bytes cannot replace an existing snapshot version.

Register a disposable device, acknowledge its 256-bit credential once, and
verify only the prefix plus peppered digest remain. Exercise explicit
collection grants, credential rotation/revocation, suspension, and terminal
revocation.

### 3. Publish the first snapshot

Run the fixture and guarded local integrations first. For the live operation:

1. manually approve and complete the first Scryfall catalog import;
2. build the deterministic SQLite snapshot under the shared promotion lock;
3. verify schema, foreign keys, FTS, counts, byte size, and SHA-256;
4. upload privately, verify stored bytes, and publish the database manifest;
5. install through the robot reference client and retain the previous verified
   local generation;
6. enable snapshot downloads only after the reference installation succeeds.

No cloud route starts physical motion or stores robot execution state.

## Phase 6 release readiness

Complete the following runbooks before the first invitation:

- `environment-matrix.md` for Vercel, Supabase, worker, and preview placement;
- `waf-and-rate-limits.md` for Vercel Firewall, Supabase Auth/CAPTCHA, database
  quotas, and kill switches;
- `backup-and-restore.md` for database plus private Storage recovery;
- `incident-response.md` for containment, correlation, credential, isolation,
  and recovery procedures;
- `private-beta-checklist.md` for the final automated and hosted sign-off.

The operator must additionally:

1. run the exact clean validation matrix in the private-beta checklist;
2. configure custom SMTP, CAPTCHA, Auth rate limits, WAF rules, backups/PITR,
   Storage protection, alerts, and incident contacts;
3. confirm the production CSP/security headers and browser-bundle secret scan;
4. approve application, external-service, and device quota values;
5. verify `/app/admin/operations` can disable/re-enable each policy and records
   a sanitized correlated audit event;
6. enable the minimum read paths first, then one mutable/provider surface at a
   time.

Repository automation does not deploy Vercel, apply hosted migrations, enter
secrets, or enable production switches. Those actions require explicit human
authorization.
