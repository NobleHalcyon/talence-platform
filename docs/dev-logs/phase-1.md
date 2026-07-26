# Phase 1 - Invite-only identity and workspace foundation

Date: 2026-07-26

Branch: `greenfield/platform-v1`

Checkpoint subject:
`phase 1: invite-only identity and workspace foundation`

## Outcome

Phase 1 implements the private-beta admission boundary from database hook to
web experience. Supabase Auth remains the human credential/session authority;
Talence adds a private invitation ledger, atomic admission finalization,
workspace-rooted authorization, default-deny RLS, trusted administration
workflows, and server-rendered application context.

There is no registration route and no application `signUp` call. An invitation
row is committed before either the web admin action or trusted CLI calls
Supabase Auth Admin. Only server-controlled `invited_user_id` metadata links the
Auth identity to the ledger.

## Master-prompt completion

- Created private `app_private` and `app_api` schemas without exposing either
  through PostgREST.
- Added the invited-user ledger, profiles, platform roles, workspaces,
  memberships, workspace-invitation foundation, preferences, games, and the
  minimal collection prerequisite.
- Added normalized identifiers, bounded data, lifecycle-shape constraints,
  foreign-key indexes, update timestamp triggers, and a stable MTG seed.
- Added the Before User Created PostgreSQL hook. It admits only one current,
  unexpired `draft` or `sent` invitation with matching normalized email and
  rejects unknown, failed, expired, revoked, or malformed admission.
- Added `finalize_admitted_user()` as an authenticated, atomic, idempotent
  function. It derives identity from `auth.uid()` and confirmed Auth email,
  verifies linked metadata and invitation state under lock, and provisions the
  profile, personal workspace, owner membership, preferences, and default MTG
  collection.
- Added first-acceptance reactivation for a same-invite pre-existing profile
  while preventing accepted replay from self-unsuspending.
- Added immediate final-owner mutation checks plus a deferred invariant that
  prevents any active workspace from committing without an active owner,
  including insert and archived-to-active transitions.
- Added admitted-user, workspace-role, and platform-admin helpers; a bounded
  current-user context RPC; and service-role-only administration RPCs.
- Enabled RLS on every exposed Phase 1 table. Anonymous roles have no
  application-table grants, workspace reads require active membership, and
  ordinary users cannot directly create or mutate workspace-owned resources.
- Limited profile and preference writes to safe columns. Audit timestamps,
  admission status, role data, membership state, and workspace lifecycle remain
  database-controlled.
- Implemented login, logout, generic password recovery, reset, invite callback,
  managed password setup, minimal profile completion, and safe normalized
  status handling.
- Added a server-readable token-hash callback for invite and recovery email
  templates, plus PKCE code exchange support and allowlisted navigation.
  Invitation finalization is keyed to the verified callback type rather than a
  user-controlled destination.
- Added Cloudflare Turnstile rendering and token forwarding for production
  sign-in and recovery. Production fails closed when the site key is absent.
- Replaced the authenticated shell placeholder with verified Auth claims,
  active-admission/profile/workspace checks, server workspace context, a
  workspace switcher, and profile-completeness routing.
- Implemented profile/default-workspace/default-collection/presentation
  settings with RLS-backed validation.
- Implemented the platform-admin invitation page with issue, valid resend,
  revoke, cleanup-reconciliation, status, and safe failure states.
- Added trusted Windows-friendly CLI commands for first-admin bootstrap,
  invitation issue, status inspection, and revoke.
- Generated typed Supabase table/RPC contracts from the local database and
  added drift checks to CI.
- Expanded architecture guards to reject common registration route spellings.
- Documented exact hosted hook, URL, email-template, SMTP, CAPTCHA, rate-limit,
  environment, and first-admin setup.

## Files changed

### Repository and automation

- `.env.example`
- `package.json`, `package-lock.json`
- `.github/workflows/ci.yml`
- `scripts/check-architecture.mjs`
- `scripts/generate-database-types.mjs`

### Database

- `supabase/config.toml`, `supabase/seed.sql`, `supabase/README.md`
- `supabase/migrations/README.md`
- `supabase/migrations/20260726010000_phase_1_identity_workspace_schema.sql`
- `supabase/migrations/20260726011000_phase_1_admission_and_authorization_functions.sql`
- `supabase/migrations/20260726012000_phase_1_rls_and_grants.sql`
- `supabase/tests/README.md`
- `supabase/tests/database/100_phase_1_admission_hook_and_surface.test.sql`
- `supabase/tests/database/110_phase_1_admission_finalization.test.sql`
- `supabase/tests/database/120_phase_1_workspace_rls_and_owner_invariants.test.sql`
- `supabase/tests/database/130_phase_1_admin_invitation_rpcs.test.sql`

### Web identity and workspace behavior

- `apps/web/.env.example`
- `apps/web/app/(public)/**` login, recovery, reset, and invite-completion pages
- `apps/web/app/auth/callback/route.ts`
- `apps/web/app/(authenticated)/app/layout.tsx`
- `apps/web/app/(authenticated)/app/settings/**`
- `apps/web/app/(authenticated)/app/admin/invites/**`
- `apps/web/components/auth/**`
- `apps/web/components/shell/**`
- `apps/web/components/workspace/workspace-context.tsx`
- `apps/web/features/auth/actions.ts`
- `apps/web/features/admin/{actions,config,invite-service}.ts`
- `apps/web/features/settings/actions.ts`
- `apps/web/lib/auth/**`
- `apps/web/lib/database/contracts.ts`
- `apps/web/lib/supabase/{admin,auth,client,config,proxy,server,trusted-config}.ts`
- `apps/web/lib/supabase/database.types.ts`
- `apps/web/tests/**` Phase 1 auth, callback, access, invite, admin, settings,
  status, and configuration regressions

### Trusted administration

- `scripts/admin/README.md`
- `scripts/admin/{bootstrap-admin,invite-user,revoke-invite,invite-status}.ts`
- `scripts/admin/{admin-service,arguments,command,contracts,environment}.ts`
- `scripts/admin/{errors,postgres-repository,runtime,supabase-auth-gateway}.ts`
- `scripts/admin/{types,validation}.ts`
- `scripts/admin/tsconfig.json`
- `scripts/admin/tests/admin-service.test.ts`

### Documentation

- `README.md`
- `docs/operations/production-setup.md`
- `docs/dev-logs/phase-1.md`
- `IMPLEMENTATION_STATUS.md`

## Migrations, functions, and policies

### Schema and data

The three ordered Phase 1 migrations add:

- enums for invitation, profile, workspace, membership, resource, and
  collection visibility/lifecycle values;
- `app_private.invited_users`;
- `public.profiles`, `platform_user_roles`, `workspaces`,
  `workspace_memberships`, `workspace_invitations`, `user_preferences`,
  `games`, and minimal `collections`;
- immutable normalized email, slug, handle, lifecycle, JSON-size, relationship,
  and uniqueness checks;
- indexes for Auth links, foreign keys, workspace access, and current
  invitations;
- a deterministic MTG row with UUID
  `00000000-0000-4000-8000-000000000001`.

### Hook, helpers, and public RPCs

- `app_private.before_user_created_hook(jsonb)`
- `app_api.is_admitted_user(uuid)`
- `app_api.has_workspace_role(uuid, membership_role)`
- `app_api.is_platform_admin()`
- `public.finalize_admitted_user()`
- `public.current_user_context()`
- `public.admin_prepare_invited_user(...)`
- `public.admin_mark_invited_user_sent(...)`
- `public.admin_mark_invited_user_failed(...)`
- `public.admin_record_invited_user_error(...)`
- `public.admin_revoke_invited_user(...)`
- `public.admin_get_invited_user(...)`
- `public.admin_list_invited_users(...)`
- `public.admin_bootstrap_platform_admin(uuid)`

Security-definer functions fix their search path and expose only the minimum
role-specific execute grants. Admin wrappers remain service-role-only but also
verify the supplied active platform-admin actor; a null actor is accepted only
while the platform-role table is empty.

### RLS and grants

RLS is enabled on all eight exposed Phase 1 tables. Policies provide:

- self-only active profile and preference access;
- active-member workspace, membership, and collection reads;
- admitted-user active game reads;
- administrator-only workspace-invitation reads;
- self-only platform-role reads;
- safe self profile/preference writes only;
- no anonymous application data and no ordinary direct
  workspace/membership/collection writes.

## Route descriptions

- `/login` - managed email/password sign-in with CAPTCHA integration and no
  registration link.
- `/forgot-password` - enumeration-resistant recovery request with CAPTCHA.
- `/auth/callback` - PKCE or token-hash verification, typed invite
  finalization, safe cleanup, and allowlisted redirect.
- `/reset-password` - verified-session managed password update.
- `/invite/complete` - managed password, display name, and handle completion;
  finalization replay remains safe.
- `/app` and descendants - fail-closed claims/admission/profile/workspace guard
  with active workspace context and switcher.
- `/app/settings` - profile, default resource, currency, and presentation
  preferences.
- `/app/admin/invites` - platform-admin-only issue, resend, revoke, and ledger
  status interface.

The existing Talence responsive tokens and shared primitives are retained. The
new forms, tables, status messages, workspace switcher, and settings layout
adapt to narrow viewports. No Phase 1 screenshots are persisted; these route
descriptions are the completion evidence.

## Verification

Passed locally on Windows with Docker Desktop and the local Supabase stack:

- `npm.cmd run canon:validate` - 32 canonical files valid.
- `npm.cmd run guard:architecture` - no registration/signup, Tailwind, secret,
  browser-provider, or remote-motion violation.
- `npm.cmd run format:check` - pass.
- `npm.cmd run lint` - all workspaces pass.
- `npm.cmd run typecheck` - all workspaces plus trusted admin CLI pass.
- `npm.cmd run test:unit` - 94/94 pass: web 56, contracts 7, domain 2, UI 11,
  and trusted administration 18.
- `npm.cmd run test:contracts` - canonical copies, schemas, OpenAPI, SQLite, and
  generated contract files pass.
- Python Ruff, format, mypy, and pytest checks pass with fixture-only tests.
- `npm.cmd run build` - production Next.js build passes.
- `npm.cmd run ci` - complete non-Docker/non-browser root chain passes.
- `npx.cmd supabase db reset` - all migrations apply from a blank database and
  the seed is repeatable.
- `npm.cmd run db:lint` - no warnings in `public`, `app_private`, or `app_api`.
- `npm.cmd run db:types` and `npm.cmd run db:types:check` - generated database
  types are current.
- `npm.cmd run test:supabase` - five files and 125 pgTAP assertions pass.
- Live local Auth probe - an uninvited Admin invite is rejected with HTTP 403.
- Live trusted CLI probe - invited row preparation, Auth invitation, sent
  linkage, status inspection, database-first revoke, Auth deletion, and final
  revoked status all pass.
- Local Mailpit probe - the issued email retains the typed invite callback from
  the exact redirect allowlist.
- `$env:PLAYWRIGHT_CHANNEL='msedge'; npm.cmd run test:e2e` - desktop and mobile
  public/login smoke flows pass 4/4.
- `git diff --check` - pass.

## Manual production setup

The following are deliberately not automated without human-owned cloud access:

- apply migrations to hosted development and production projects;
- activate
  `pg-functions://postgres/app_private/before_user_created_hook`;
- configure exact Site URL and typed invite/recovery callback allowlist;
- install token-hash Invite user and Reset password email templates;
- configure and validate custom SMTP;
- configure Auth email/OTP/recovery/verification rate limits;
- create and restrict the Turnstile widget, put its secret in Supabase Auth, and
  put only its site key in Vercel;
- configure WAF limits for login, recovery, callback, and admin invitation
  routes;
- set server/browser environment values and deliberately enable invitations;
- execute and audit the first-admin bootstrap sequence.

Exact instructions and PowerShell commands are in
`docs/operations/production-setup.md`.

## Deviations, blockers, and risks

- No locked-stack or canonical behavior deviation was made.
- No production secret, push, merge, preview deployment, or production
  deployment was performed.
- Hosted email delivery, CAPTCHA verification, WAF behavior, and dashboard hook
  activation cannot be proven without human-owned projects. Their code paths
  and local database behavior are tested; hosted activation remains manual.
- Supabase Auth invitation issuance and the PostgreSQL ledger cannot share one
  distributed transaction. Both web and CLI workflows therefore commit the
  ledger first and implement bounded compensation plus an explicit
  reconciliation-required state.
- The first actor-less invite is intentionally limited to the zero-admin
  bootstrap window and still requires trusted database plus Supabase secret
  credentials.
- Catalog, inventory ledger, deck, device, and snapshot behavior remain owned by
  Phases 2-5 and are not partially introduced by Phase 1.
