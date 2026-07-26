# Local Supabase

This directory is the version-controlled local Supabase project for Talence.
Phase 1 contains the invite-only admission, profile, workspace, membership,
preference, game, and default-collection foundation. Catalog, inventory-ledger,
deck, and device objects arrive through ordered migrations in later phases.

The local stack is development-only. It uses local credentials and captures
email in the local SMTP viewer; do not expose it to a network or treat its settings as
production configuration.

## Windows setup

Prerequisites:

- Docker Desktop is installed and running.
- Root dependencies are installed with `npm install`.

From the repository root in PowerShell:

```powershell
npx supabase start
npx supabase db reset
npm run db:lint
npm run db:types:check
npm run test:supabase
```

Useful local endpoints are printed by `supabase start`. With the committed
configuration, the API is at `http://127.0.0.1:54321`, Studio is at
`http://127.0.0.1:54323`, and captured email is at
`http://127.0.0.1:54324`.

Stop the local services without deleting their data:

```powershell
npx supabase stop
```

When `config.toml` changes, stop and start the stack so the Auth container is
recreated with the new hook or redirect configuration. `db reset` recreates
PostgreSQL data but does not rebuild Auth container environment variables.

`npx supabase db reset` is destructive to the local database: it recreates the
database, applies every migration in order, and then runs `seed.sql`. Never add
`--linked` unless a separately documented dev/staging operation explicitly
requires it, and never reset production.

## Private-beta authentication baseline

Local Auth is enabled for email invitations, existing-user sign-in, and password
recovery. Global public signup, anonymous sign-in, manual identity linking, and
SMS signup are disabled. The local SMTP viewer receives email without production
credentials.

The database-backed invitation ledger, Before User Created hook, admission
finalizer, and RLS policies are active locally. `config.toml` points the local
Auth service to:

```text
pg-functions://postgres/app_private/before_user_created_hook
```

`app_private` and `app_api` are intentionally absent from `api.schemas`.
Invitation administration crosses the Data API only through service-role-only
`public.admin_*` functions, and each function independently checks its actor.
The authenticated finalizer derives the user and email from Supabase Auth and
accepts no identity arguments.

The typed database client file is generated from the running local schema:

```powershell
npm run db:types
npm run db:types:check
```

Commit the generated file whenever a migration changes the exposed schema or
RPC signatures.

For a hosted project, apply migrations first and then activate the **Before User
Created** hook in Supabase Auth using the same Postgres function URI. Confirm
that only `supabase_auth_admin` has execute permission. CAPTCHA, SMTP, redirect
URLs, hook activation, Auth rate limits, and the first trusted invitation/admin
bootstrap remain human-managed production setup. The exact callback allowlist,
invite/recovery email templates, and bootstrap commands are in
`docs/operations/production-setup.md`; no production secret belongs in
`config.toml`.
