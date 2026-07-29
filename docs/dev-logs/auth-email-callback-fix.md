# Auth email callback token-hash fix

Date: 2026-07-28

Branch: `fix/invite-callback-token-hash`

## Root cause reproduced

Against a no-seed disposable local database, the trusted administration CLI
successfully prepared the private invitation row and created the managed Auth
identity. Mailpit then received Supabase's default Invite user template. Its
link targeted `/auth/v1/verify`; after provider verification the session was
returned in a browser fragment. The Talence Next.js callback could read neither
that fragment nor a server-verifiable credential, so it failed closed with
`callback_code_missing`.

The existing callback already supported the provider-recommended
`verifyOtp({ token_hash, type })` path. The missing piece was applying matching
email templates to the real local Auth service.

## Implementation

- Added committed local Invite user and Reset password templates using
  provider-supported `SiteURL` and `TokenHash` variables.
- Configured both templates through `supabase/config.toml`.
- Kept template destinations fixed and encoded; neither template consumes
  caller-controlled `RedirectTo`.
- Bounded callback credentials, rejected ambiguous credentials, and restricted
  `next` per action type.
- Made server-issued Supabase session cookies HTTP-only, with secure transport
  required in production.
- Added template contract, callback failure, and cookie-option unit tests.
- Added a loopback-only destructive live harness that restarts Auth after its
  reset, invokes the trusted CLI, reads real Mailpit HTML, and clicks both
  messages through Chromium.
- Updated local, trusted administration, hosted production, and release
  checklist documentation.

No hosted Supabase, SMTP, Vercel, DNS, production secret, or real user state was
changed.

## Live acceptance evidence

`npm run test:auth-email:local` proves:

- uninvited Auth Admin creation fails through the admission hook, while the
  existing configuration and architecture guard keep public signup disabled;
- actual invite and recovery messages use Talence `token_hash` callbacks;
- an expired provider invite fails without provisioning;
- invalid, missing, malformed, and reused tokens fail with bounded statuses;
- a valid invite provisions one profile, personal workspace, owner membership,
  preference row, and default MTG collection;
- replay does not duplicate those resources;
- the invited user sets a password, enters `/app`, and signs in again;
- recovery changes the managed password and the new password enters `/app`;
- callback URLs, rendered application state, browser storage, and audit events
  contain no retained token or session credential;
- managed session cookies are HTTP-only.

## Human production work

The operator must copy the reviewed Invite user and Reset password HTML into
the hosted Supabase dashboard, verify the exact production Site URL and
redirect allowlist, disable unsafe link rewriting/prefetch behavior, and test
newly delivered messages in a hosted non-production project before enabling
invitations. The repository does not mutate those hosted settings.

## Validation

Final commands and results:

- pre-fix disposable CLI/Mailpit probe: reproduced the default
  `/auth/v1/verify` link with no Talence `token_hash` callback;
- post-fix disposable CLI/Mailpit probe: direct Talence callback present,
  provider verify URL and session credentials absent;
- callback/template/cookie targeted unit tests: 15 passed;
- `npm run test:auth-email:local`: 1 live Chromium scenario passed, including
  actual invite and recovery messages plus failure/replay cases;
- `npx supabase db reset --local --no-seed`: passed from an empty local
  database;
- `npm run test:supabase`: 31 files and 808 pgTAP assertions passed;
- `npm run test:phase6:local`: repeatable two-workspace fixture and full live
  private-beta browser journey passed;
- `npm run ci`: canonical/architecture/secret/release guards, dependency
  audits, formatting, lint, types, 241 web tests, 38 package/admin tests, 83
  Python tests, production build, browser-bundle scan, and production security
  header smoke test passed;
- `git diff --check`: passed.

The first pgTAP invocation after Docker Desktop was reinstalled could not find
`docker.exe` in the inherited VS Code `PATH`. Prepending the detected
`Programs\DockerDesktop\resources\bin` directory resolved it; the complete
suite then passed.
