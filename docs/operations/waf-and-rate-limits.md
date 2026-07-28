# WAF, authentication, and quota controls

Last reviewed: 2026-07-27

Talence uses layered controls. Vercel Firewall absorbs abusive traffic before
application execution, Supabase Auth protects identity endpoints, and
PostgreSQL atomically enforces application, device, and external-service
budgets. No single layer replaces the others.

## Vercel Firewall setup

Create the rules in the production project before enabling invitations. Keep
the initial action in log mode long enough to observe legitimate beta traffic,
then change it to the stated enforcement action.

| Priority | Match                                                                                                                        | Initial action | Enforced action                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| 1        | A maintained emergency IP/CIDR denylist                                                                                      | Deny           | Deny                                                        |
| 2        | `POST` to `/login`, `/forgot-password`, `/reset-password`, or `/invite/complete`, plus abnormal requests to `/auth/callback` | Log            | Challenge, followed by rate-limit `429` for sustained abuse |
| 3        | `/api/v1/device/**` with an abnormal per-IP burst                                                                            | Log            | Rate-limit `429`                                            |
| 4        | Repeated malformed or high-volume traffic to authenticated `/app/**` routes                                                  | Log            | Challenge                                                   |
| 5        | Known-good health and static-asset traffic                                                                                   | Allow          | Allow                                                       |

Use conservative beta thresholds derived from observed traffic rather than
copying database limits into the edge. A practical starting review window is:

- identity routes: challenge after 10 requests per minute per IP and rate-limit
  after 30;
- device routes: rate-limit after 120 requests per minute per IP;
- authenticated application routes: challenge after 300 requests per minute
  per IP.

Those are deployment recommendations, not code defaults. Record the approved
values and the observation date in the private-beta checklist. Vercel rate
rules require a follow-up action, so verify that the deployed rule actually
returns the intended challenge or `429`, not only a log entry. See the official
[Vercel Firewall overview](https://vercel.com/docs/vercel-firewall) and
[custom-rule documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules).

Never treat source IP as device identity. The `/api/v1/device` routes still
require a scoped, revocable credential and database quota reservation.

## Supabase Auth controls

Before production:

1. Configure custom SMTP; the built-in email sender is not a production
   delivery service.
2. Set the Auth email, token-verification, password-recovery, and anonymous
   request limits in the Supabase dashboard. Start below the SMTP provider’s
   hard limit and raise only from observed private-beta demand.
3. Enable Cloudflare Turnstile CAPTCHA for sign-in and password recovery. Put
   only the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; enter the secret
   directly in Supabase Auth.
4. Exercise valid login, invalid login, recovery, an expired challenge, and a
   throttled request from a non-admin account.
5. Confirm the Before User Created hook still denies every account creation
   without an active `app_private.invited_users` row.

Supabase documents its token-bucket controls in
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) and
supported CAPTCHA providers in
[Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

## Database-enforced budgets and switches

The Phase 6 migration adds four private policy/usage tables:

- `application_feature_policies` and `application_usage_windows`;
- `external_service_policies` and `external_service_usage_daily`.

Application reservations enforce per-principal minute/day request limits,
daily work units, and maximum units per request. External reservations enforce
the configured combination of global, user, workspace, and device UTC-day
units. Reservations lock and increment every applicable scope atomically before
the protected work begins. Concurrent callers cannot over-admit the budget.

Current application controls are:

- `catalog_search`;
- `collection_analytics`.

The generic external adapter is initially used for:

- `managed_auth_invitation`.

The schema and RPC deliberately support additional external services and the
device dimension without a service-specific table. Add a new policy row and
server-side reservation at the provider boundary; never call a paid provider
from browser code.

Device feature policies remain independently enforced for heartbeat, manifest,
inventory read/write, and run-summary operations. Environment switches remain
an outer fail-closed deployment guard for invitations, catalog sync, device
inventory writes, and snapshot downloads.

## Operator procedure

Platform administrators use `/app/admin/operations` to:

- inspect bounded policy values and current daily external aggregates;
- disable or enable application, external, and device controls;
- review the most recent sanitized audit events.

Every toggle uses optimistic concurrency and records
`operational.control.toggled` with a correlation ID. The audit table excludes
request bodies, email addresses, credentials, digests, signed URLs, tokens, and
provider payloads.

For an active incident:

1. disable the smallest affected database control;
2. disable the corresponding deployment environment switch when available;
3. apply the edge deny/challenge/rate rule;
4. record the UTC time and correlation IDs;
5. follow `incident-response.md`.

Re-enable only after a bounded test proves the affected operation and its
quota/audit record.
