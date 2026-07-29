# Talence trusted administration CLI

These commands operate the invite-only admission boundary. They are trusted
server tools, not browser utilities.

## Required environment

- `SUPABASE_SECRET_KEY` — a current `sb_secret_…` key or legacy service-role
  JWT. Publishable/anonymous keys are rejected.
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` — the matching project URL.
- `TALENCE_DATABASE_URL` or `SUPABASE_DB_URL` — a direct PostgreSQL connection
  that can execute the service-only administration functions. If both aliases
  are set, they must be identical.
- `FEATURE_INVITATIONS_ENABLED=true` — required only when issuing an invite.
- `TALENCE_AUTH_INVITE_REDIRECT_URL` — recommended explicit callback URL. It
  must use the allowlisted
  `/auth/callback?type=invite&next=/invite/complete` route. When absent, the CLI
  derives that route from `NEXT_PUBLIC_APP_ORIGIN`.
- `INVITATION_DEFAULT_TTL_DAYS` — optional; defaults to `7`.

The CLI does not load a local `.env` file. Set trusted values in the process
environment or an approved secret-injection tool. Never put a database URL or
secret key in a `NEXT_PUBLIC_*` variable.

Supabase controls the message body independently of `redirectTo`. Before
issuing invitations, configure both the local or hosted **Invite user** email
template and its fixed `TokenHash` callback as documented in
`docs/operations/production-setup.md`. The default provider
`/auth/v1/verify` link redirects session credentials in a browser fragment and
is incompatible with the Talence server callback. Never edit a captured
Mailpit link by hand; restart local Auth after template changes and issue a
fresh invitation.

## First administrator

There is intentionally no pre-existing platform administrator. The database
allows a null actor only while the platform-admin table is empty.

1. Apply Phase 1 migrations and configure the Supabase Before User Created
   hook.
2. Deliberately enable invitations and issue the first invite:

   ```powershell
   $env:FEATURE_INVITATIONS_ENABLED = "true"
   npm run admin:invite -- --email owner@example.com
   ```

3. Accept the managed Auth invitation and complete admission so the profile,
   personal workspace, owner membership, and default collection exist.
4. Bootstrap that admitted identity exactly once:

   ```powershell
   npm run admin:bootstrap -- --email owner@example.com
   ```

5. Record the returned user ID. All later invite, revoke, and status operations
   pass it as `--actor-user-id`; the database verifies that it still has the
   `platform_admin` role.

## Commands

```powershell
npm run admin:invite -- --email tester@example.com --actor-user-id <uuid>
npm run admin:invite-status -- --email tester@example.com --actor-user-id <uuid>
npm run admin:revoke-invite -- --email tester@example.com --actor-user-id <uuid>
npm run admin:bootstrap -- --user-id <accepted-auth-user-uuid>
```

Use `--help` on any command for all accepted options. Commands emit structured
JSON and never print raw provider/database errors, credentials, or connection
strings.

## Disposable local first-owner flow

This reset destroys only the loopback local database. Do not add `--linked`.
The stop/start after the reset both reloads the committed templates and gives
local Auth a fresh connection to the recreated database.

```powershell
npx supabase db reset --local --no-seed
npx supabase stop
npx supabase start

$localSupabase = npx supabase status -o json | ConvertFrom-Json
$env:SUPABASE_URL = $localSupabase.API_URL
$env:NEXT_PUBLIC_SUPABASE_URL = $localSupabase.API_URL
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = if ($localSupabase.PUBLISHABLE_KEY) {
  $localSupabase.PUBLISHABLE_KEY
} else {
  $localSupabase.ANON_KEY
}
$env:SUPABASE_SECRET_KEY = if ($localSupabase.SECRET_KEY) {
  $localSupabase.SECRET_KEY
} else {
  $localSupabase.SERVICE_ROLE_KEY
}
$env:TALENCE_DATABASE_URL = $localSupabase.DB_URL
$env:NEXT_PUBLIC_APP_ORIGIN = "http://localhost:3000"
$env:TALENCE_AUTH_INVITE_REDIRECT_URL = "http://localhost:3000/auth/callback?type=invite&next=/invite/complete"
$env:FEATURE_INVITATIONS_ENABLED = "true"
$ownerEmail = Read-Host "Disposable local owner email"

npm run admin:invite -- --email $ownerEmail
```

Run `npm run dev`, open Mailpit at `http://127.0.0.1:54324`, open the newest
message for that address, and click **Accept invitation** without changing its
URL. Complete the profile/password form, verify `/app`, then bootstrap that
accepted identity with:

```powershell
npm run admin:bootstrap -- --email $ownerEmail
```

For automated coverage of the same provider-compatible email path:

```powershell
npm run test:auth-email:local
```

## Ordering and recovery

Invitation issuance always commits `app_private.invited_users` through the
database-owned administration function before calling Supabase Auth Admin.
Only `invited_user_id` is sent as server-controlled Auth user metadata.

If Auth issuance fails, the row is marked `failed` with a bounded safe code. If
Auth succeeds but sent-state persistence fails, the CLI independently attempts
to fail the admission row and remove the pending Auth identity. The
`invite_reconciliation_required` result means neither cleanup path could be
confirmed; inspect both systems before retrying.

Revocation commits the ledger state first, then removes a pending Auth
identity. The foreign key clears `auth_user_id` when that pending identity is
deleted. Accepted invitations are not revocable through this command.
