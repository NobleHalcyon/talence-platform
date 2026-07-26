# Local Supabase

This directory is the version-controlled local Supabase project for Talence.
Phase 0 contains no application schema. Canonical admission, workspace, catalog,
inventory, deck, and device objects arrive through ordered migrations in later
phases.

The local stack is development-only. It uses local credentials and captures
email in Inbucket; do not expose it to a network or treat its settings as
production configuration.

## Windows setup

Prerequisites:

- Docker Desktop is installed and running.
- Root dependencies are installed with `npm install`.

From the repository root in PowerShell:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db --local
```

Useful local endpoints are printed by `supabase start`. With the committed
configuration, the API is at `http://127.0.0.1:54321`, Studio is at
`http://127.0.0.1:54323`, and captured email is at
`http://127.0.0.1:54324`.

Stop the local services without deleting their data:

```powershell
npx supabase stop
```

`npx supabase db reset` is destructive to the local database: it recreates the
database, applies every migration in order, and then runs `seed.sql`. Never add
`--linked` unless a separately documented dev/staging operation explicitly
requires it, and never reset production.

## Private-beta authentication baseline

Local Auth is enabled for email invitations, existing-user sign-in, and password
recovery. Global public signup, anonymous sign-in, manual identity linking, and
SMS signup are disabled. The local Inbucket service receives email without SMTP
credentials.

The database-backed invitation ledger, Before User Created hook, admission
finalizer, and RLS policies are Phase 1 work. Hosted CAPTCHA, SMTP, redirect
URLs, hook activation, and rate limits remain human-managed production setup;
no production secret belongs in `config.toml`.
