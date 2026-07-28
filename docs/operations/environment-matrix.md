# Production environment matrix

Last reviewed: 2026-07-27

This is the authoritative placement matrix for Talence deployment
configuration. Commit only the three `.env.example` contracts. Put production
values in Vercel, Supabase, or the protected worker runtime; never commit a
populated `.env` file.

## Browser-visible values

| Variable                               | Runtime                    | Required in production      | Secret | Notes                                                                                              |
| -------------------------------------- | -------------------------- | --------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser and Next.js server | Yes                         | No     | Exact HTTPS Supabase project origin.                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and Next.js server | Yes                         | No     | Use the publishable/anon client key; authorization still depends on Auth and RLS.                  |
| `NEXT_PUBLIC_APP_ORIGIN`               | Browser and Next.js server | Yes                         | No     | Exact canonical HTTPS application origin, with no path.                                            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | Browser                    | Yes when CAPTCHA is enabled | No     | The matching Turnstile secret is entered in Supabase Auth and is never a web environment variable. |

These are the only allowed `NEXT_PUBLIC_` values. Adding another browser value
requires a security review and an update to the bundle-secret guard.

## Trusted Next.js server values

| Variable                                  | Required in production | Secret | Default or constraint                                                                                                    |
| ----------------------------------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_SECRET_KEY`                     | Yes                    | Yes    | Server-only Supabase secret/service-role key. Never expose to client components.                                         |
| `DEVICE_CREDENTIAL_PEPPER`                | Yes                    | Yes    | Independent high-entropy value used for device credential HMACs. Rotation requires an explicit credential-rotation plan. |
| `TALENCE_AUTH_INVITE_REDIRECT_URL`        | Yes                    | No     | Exact HTTPS callback URL approved in Supabase Auth.                                                                      |
| `INVITATION_DEFAULT_TTL_DAYS`             | Yes                    | No     | Defaults to `7`; keep within the database bounds.                                                                        |
| `TALENCE_DEVICE_HEARTBEAT_MAX_BODY_BYTES` | No                     | No     | Defaults to `16384`.                                                                                                     |
| `TALENCE_DEVICE_INVENTORY_MAX_BODY_BYTES` | No                     | No     | Defaults to `262144`.                                                                                                    |
| `TALENCE_DEVICE_RUN_MAX_BODY_BYTES`       | No                     | No     | Defaults to `32768`.                                                                                                     |
| `TALENCE_SNAPSHOT_SIGNED_URL_SECONDS`     | No                     | No     | Defaults to `600`; review before increasing.                                                                             |
| `TALENCE_CATALOG_SNAPSHOT_BUCKET`         | Yes                    | No     | Must remain `catalog-snapshots`.                                                                                         |
| `FEATURE_INVITATIONS_ENABLED`             | Yes                    | No     | Fail-closed boolean; begin `false`.                                                                                      |
| `FEATURE_CATALOG_SYNC_ENABLED`            | Yes                    | No     | Fail-closed boolean; begin `false`.                                                                                      |
| `FEATURE_DEVICE_INVENTORY_WRITES_ENABLED` | Yes                    | No     | Fail-closed boolean; begin `false`.                                                                                      |
| `FEATURE_SNAPSHOT_DOWNLOADS_ENABLED`      | Yes                    | No     | Fail-closed boolean; begin `false`.                                                                                      |

`TALENCE_ENABLE_STATIC_APP_PREVIEW` is development/test-only. The application
ignores it in production, and it must not be configured in Vercel production.

## Catalog worker values

The worker is a separate trusted process. It must not inherit browser build
configuration unnecessarily.

| Variable                                            | Required for live work       | Secret | Constraint                                                                         |
| --------------------------------------------------- | ---------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `TALENCE_DATABASE_URL`                              | Yes                          | Yes    | Direct PostgreSQL URL with the reviewed worker role; TLS required when hosted.     |
| `SUPABASE_URL`                                      | Yes for snapshot publication | No     | Exact HTTPS project origin.                                                        |
| `SUPABASE_SECRET_KEY`                               | Yes for snapshot publication | Yes    | Protected worker secret only.                                                      |
| `TALENCE_CATALOG_USER_AGENT`                        | Yes                          | No     | Must contain a real operator contact before any provider request.                  |
| `TALENCE_CATALOG_MAX_DOWNLOAD_BYTES`                | Yes                          | No     | Defaults to `2000000000`; remains below the reviewed host capacity.                |
| `TALENCE_CATALOG_REQUEST_TIMEOUT_SECONDS`           | Yes                          | No     | Defaults to `30`.                                                                  |
| `TALENCE_CATALOG_MAXIMUM_ATTEMPTS`                  | Yes                          | No     | Defaults to `4`.                                                                   |
| `TALENCE_CATALOG_RETRY_BASE_SECONDS`                | Yes                          | No     | Defaults to `0.5`.                                                                 |
| `TALENCE_CATALOG_METADATA_MINIMUM_INTERVAL_SECONDS` | Yes                          | No     | Defaults to `0.11`; do not reduce without provider review.                         |
| `TALENCE_CATALOG_BATCH_SIZE`                        | Yes                          | No     | Defaults to `1000`.                                                                |
| `TALENCE_CATALOG_PRICE_STALE_AFTER_HOURS`           | Yes                          | No     | Defaults to `36`.                                                                  |
| `TALENCE_CATALOG_TEMP_DIRECTORY`                    | No                           | No     | Protected ephemeral directory; downloaded bulk data must not enter the repository. |
| `TALENCE_SNAPSHOT_STORAGE_BACKEND`                  | Yes                          | No     | Use `supabase` when hosted; `local` is only for local work.                        |
| `TALENCE_SNAPSHOT_STORAGE_ROOT`                     | Local only                   | No     | Required only for the local backend.                                               |
| `TALENCE_SNAPSHOT_STORAGE_BUCKET`                   | Yes                          | No     | Must remain `catalog-snapshots`.                                                   |
| `TALENCE_SNAPSHOT_API_CONTRACT_VERSION`             | Yes                          | No     | Must remain compatible with `/api/v1`.                                             |
| `TALENCE_SNAPSHOT_MINIMUM_CLIENT_VERSION`           | Yes                          | No     | SemVer minimum accepted robot client.                                              |
| `TALENCE_SNAPSHOT_MAX_BYTES`                        | Yes                          | No     | Defaults to `1073741824`.                                                          |
| `TALENCE_SNAPSHOT_BATCH_SIZE`                       | Yes                          | No     | Defaults to `5000`.                                                                |
| `TALENCE_SNAPSHOT_STORAGE_TIMEOUT_SECONDS`          | Yes                          | No     | Defaults to `120`.                                                                 |

## Supabase dashboard configuration

These values live in Supabase rather than Vercel:

- production Site URL and the exact invitation, login, recovery, and reset
  redirect allowlist;
- the Before User Created hook targeting
  `app_private.before_user_created`;
- custom SMTP credentials and sender identity;
- CAPTCHA provider secret and its matching site key selection;
- Auth rate limits;
- database connection restrictions, backup/PITR plan, and alert recipients.

## GitHub Actions and Vercel

- Pull-request workflows use non-secret invalid build placeholders only. They
  do not deploy and must not receive production keys.
- Vercel Preview uses a distinct Supabase preview project or deliberately
  nonfunctional placeholder values. Never point untrusted previews at
  production.
- Vercel Production receives the browser and trusted-web values in the tables
  above. Scope every value explicitly to Production, Preview, or Development.
- The catalog worker receives secrets from its own protected runtime or
  environment, not from browser build arguments.

After every configuration change, run `npm run build`,
`npm run guard:browser-bundle`, and `npm run guard:security-headers` before
promotion.
