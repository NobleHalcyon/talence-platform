# 11 — Security, Cost Controls, and Operations

Version: 1.0.0  
Status: Locked

## 1. Threat and cost posture

Talence begins as a private beta operated by a small team. The primary operational risks are:

- unauthorized account creation;
- cross-workspace data access;
- leaked server or device credentials;
- duplicate machine updates;
- automated traffic causing database/function/external-service costs;
- expensive image proxying or transformation;
- unsafe catalog ingestion;
- accidental public exposure through permissive RLS;
- destructive schema/import mistakes;
- future paid-provider calls without quotas.

Security and spend protection are product requirements, not post-launch polish.

## 2. Anonymous surface minimization

Anonymous access is limited to:

- static landing/about/legal content;
- login form;
- password recovery form;
- Supabase invite/auth callback endpoints.

Anonymous users cannot:

- search the catalog;
- read prices;
- read profiles/workspaces;
- create accounts;
- call device APIs;
- trigger catalog jobs;
- invoke metered provider adapters.

Static pages must not perform database queries on every request when static generation/caching is possible.

## 3. Admission defenses

- public sign-up UI absent;
- public signup disabled in Supabase configuration;
- Before User Created hook checks private invited-user ledger;
- invitation creation is platform-admin only;
- invitation expiration and revocation;
- Supabase Auth rate limits reviewed/configured, including project-wide email-send limits;
- CAPTCHA/bot protection enabled for sign-in and password-recovery forms in production;
- WAF rate limits on login/recovery/callback-adjacent routes;
- generic responses avoid account enumeration;
- no public “request invite” form initially.

## 4. Row Level Security baseline

- RLS on every exposed table;
- no blanket authenticated-all policy for workspace data;
- policy tests use at least two users and two workspaces;
- indexed membership predicates;
- private schemas excluded from API exposure;
- catalog human role is read-only;
- inventory balances writable only through approved functions;
- immutable history insert/update/delete denied except trusted functions;
- no authorization based on `user_metadata` controlled by the user.

## 5. Secret management

### Browser-safe only

- Supabase URL;
- publishable key;
- non-secret app configuration.

### Server/worker secrets

- Supabase secret/service key;
- direct database URL;
- device credential pepper if used;
- future provider API keys;
- signing or SMTP credentials.

Rules:

- `.env.example` lists names only;
- secrets never committed;
- logs redact auth headers, cookies, signed URLs, and payload secrets;
- preview and production secrets are separate;
- rotate after suspected disclosure;
- no secret-bearing data in client bundles or `NEXT_PUBLIC_*` variables.

## 6. Device security

- high-entropy credentials shown once;
- digest only at rest;
- independent rotation/revocation;
- explicit collection grants;
- request size and rate bounds;
- idempotency body hashing;
- timestamp validation with reasonable clock skew for high-risk operations;
- no remote-motion command endpoint;
- failed auth attempts do not reveal whether a prefix exists;
- device last-seen updates are throttled to avoid a write per request when unnecessary.

## 7. External-service cost guard

Any feature that calls a service billed per request, token, image, transformation, or compute unit must use a server adapter implementing:

1. feature-enabled check;
2. authenticated admitted principal;
3. workspace/device authorization;
4. per-request validation and maximum size;
5. atomic quota reservation;
6. cache lookup;
7. bounded timeout;
8. bounded retry policy;
9. circuit breaker/global kill switch;
10. usage and cost-unit recording;
11. sanitized error mapping.

No component may instantiate a paid-provider SDK directly.

## 8. Initial cost-avoidance decisions

- catalog search runs in PostgreSQL, not a paid search SaaS;
- catalog ingestion uses bulk files, not per-card live requests;
- full image corpus is not mirrored eagerly;
- card images are not proxied through serverless functions;
- paid image transformations are disabled by default;
- no Realtime subscription is required for the initial app;
- no anonymous dynamic catalog;
- no AI/provider integration in the initial release;
- large catalog work never runs in a user request;
- dashboards use aggregate functions/summaries instead of repeated N+1 reads.

## 9. Platform controls

### Vercel

Before production:

- enable WAF rate-limit/challenge rules for sensitive and machine routes;
- configure Spend Management notifications and, when appropriate, automatic production pause behavior;
- monitor function invocations, duration, memory, transfer, and image usage;
- set deployment/function region close to Supabase;
- avoid broad function bundles.

### Supabase

Before production:

- enable Spend Cap where supported;
- review auth rate limits and enable CAPTCHA/bot protection;
- verify database/Storage/Function usage dashboards;
- set storage upload limits and MIME restrictions;
- verify backups;
- review every exposed table and policy;
- disable unused Auth providers, anonymous users, Realtime, and extensions;
- use a custom SMTP provider only when needed and configured safely.

## 10. Application rate limits

Layer limits:

1. WAF/source-rate limit before function execution where possible.
2. Principal/device limits in application code.
3. External-service unit quotas in PostgreSQL.
4. Provider-specific limits in adapter code.

Limit categories:

- login/recovery attempts;
- admin invite issuance;
- catalog search rate/page size;
- CSV file size and rows;
- device heartbeat;
- device batches and lines;
- snapshot downloads;
- catalog sync trigger;
- future metered providers.

Return `429` with safe retry guidance. Do not retry internally in a way that multiplies costs.

## 11. Input and file safety

- validate all request bodies with generated/runtime schemas;
- enforce content type and byte size before parsing;
- CSV uploads private, bounded, and malware/content scanned where appropriate before broader release;
- formula-injection-safe CSV export;
- no user-controlled storage paths;
- signed URLs short-lived;
- normalize filenames and retain original name only as display metadata;
- sanitize Markdown/HTML; initial notes should be plain text unless a safe renderer is selected.

## 12. Web security baseline

- secure, HTTP-only auth cookies through Supabase SSR flow;
- CSRF-safe same-origin mutations and framework protections;
- strict Content Security Policy compatible with card-image hosts;
- security headers: HSTS in production, nosniff, frame restrictions, referrer policy, permissions policy;
- no dangerous HTML injection;
- dependency update/scanning workflow;
- server-side validation for every mutation;
- stable generic errors for auth.

## 13. Observability

Every server/device request has a correlation ID.

Record:

- route/action;
- result code;
- duration;
- admitted user/device ID after auth;
- workspace/resource reference where safe;
- idempotent replay;
- rate/quota denial category;
- catalog import/snapshot stage and counts.

Do not record:

- credentials/tokens/cookies;
- full card image data;
- raw CSV content by default;
- full device batch payload by default;
- database connection strings;
- signed download URLs.

## 14. Backups and recovery

- user inventory, transactions, decks, membership, and device data require tested backups;
- catalog is reproducible but active source/snapshot metadata should still be backed up;
- storage imports and catalog artifacts need retention/recovery policy;
- every migration applies from an empty database;
- destructive migrations include rollback/restore plan;
- snapshot artifacts retain at least the current and previous compatible version;
- quarterly private-beta restore rehearsal is recommended after real user data exists.

## 15. Retention defaults

Initial recommendations:

- immutable inventory transactions: retain;
- device sync batch identity/result: retain at least 12 months, review later;
- safe run summaries: retain according to workspace setting later, default 100 most recent or 12 months;
- raw CSV upload: purge after 30 days or sooner after successful commit;
- import staging rows/error reports: purge after 30 days unless user downloads;
- catalog import logs: retain 90 days plus last successful records;
- revoked credential metadata: retain for audit without secret;
- application logs: bounded by provider/plan and sensitivity.

## 16. Security test matrix

### Admission

- unknown email blocked by hook;
- expired/revoked invite blocked;
- valid invite accepted;
- callback email/metadata mismatch blocked;
- finalization replay safe;
- suspended profile denied.

### RLS

For each workspace resource:

- anonymous denied;
- admitted non-member denied;
- viewer read/write denied as appropriate;
- editor mutation allowed/member management denied;
- admin device/member operations allowed;
- owner destructive/transfer rules;
- cross-workspace foreign-key attempts rejected.

### Inventory

- negative result rejected;
- history immutable;
- transaction atomicity;
- reversal correctness;
- stale concurrent edits resolve correctly.

### Device

- valid/invalid/revoked credential;
- grant denied;
- oversized body;
- duplicate replay;
- conflicting replay;
- unknown printing;
- rate/quota denial;
- no secret in logs.

### Catalog

- malformed source;
- failed validation;
- old catalog preserved;
- snapshot integrity;
- source timestamps/price null behavior;
- import idempotency.

## 17. Incident switches

The system must support rapid server-side disablement of:

- all new invitations;
- device inventory writes;
- snapshot downloads;
- catalog sync;
- each future external metered provider;
- selected high-cost routes.

Disabling a feature must fail closed and return a stable maintenance code.
