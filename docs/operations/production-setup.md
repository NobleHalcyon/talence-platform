# Production setup

Production provisioning is intentionally human-controlled. No production
project, credential, email provider, CAPTCHA secret, push, or deployment was
changed by Phase 1.

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

## Later-phase production work

The following remain intentionally pending until their implementation phases:

1. Create private import and immutable catalog-artifact Storage buckets with
   MIME, size, retention, and signed-URL policies.
2. Configure catalog-worker secrets and keep live catalog sync disabled until a
   fixture import and first live manual import are reviewed.
3. Configure device API quotas, credential pepper, and snapshot controls.
4. Enable Vercel Spend Management and Supabase cost controls.
5. Complete backup/restore and incident-response rehearsals.
6. Perform the Phase 6 security, accessibility, performance, and deployment
   acceptance review.
