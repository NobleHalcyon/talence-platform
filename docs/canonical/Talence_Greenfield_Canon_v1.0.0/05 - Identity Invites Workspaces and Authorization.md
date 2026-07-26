# 05 — Identity, Invites, Workspaces, and Authorization

Version: 1.0.0  
Status: Locked

## 1. Authentication decision

Supabase Auth manages human credentials, email confirmation, password recovery, session issuance, refresh, and revocation.

Talence does not implement:

- password hashing;
- password storage;
- email verification tokens;
- refresh-token rotation;
- OAuth callback cryptography;
- MFA internals.

Talence does implement admission, profile state, workspace membership, resource authorization, and device credentials.

## 2. Private-beta admission gate

### 2.1 Public signup is disabled

There is no `/register` page and application code must never call a public sign-up method. Production sign-in and password-recovery forms use configured CAPTCHA/bot protection; invitation issuance is the only account-creation path.

New humans are created only through a trusted administrative invite flow.

### 2.2 Private invited-user ledger

The table `app_private.invited_users` is the canonical admission list.

Required fields:

- `id`
- `email` as case-insensitive normalized email
- `status`: `draft | sent | accepted | revoked | expired | failed`
- `invited_by_user_id`
- `auth_user_id` nullable until Supabase returns/links it
- `expires_at`
- `sent_at`
- `accepted_at`
- `revoked_at`
- `last_error_code`
- `note`
- timestamps

It is not exposed through the Supabase Data API. Only narrow trusted functions and server code may access it.

### 2.3 Before-user-created auth hook

A PostgreSQL Supabase **Before User Created** hook must:

1. read the incoming normalized email;
2. find one matching invited-user row in `draft` or `sent` state;
3. require `expires_at > now()` and `revoked_at is null`;
4. allow creation only when the invitation is valid;
5. reject all other user creation attempts;
6. record no secrets in logs.

The hook function is executable by `supabase_auth_admin` only and is revoked from `anon`, `authenticated`, and `public`.

### 2.4 Invite issuance sequence

Trusted server action or CLI:

1. normalize and validate the email;
2. create or reactivate the invited-user row;
3. call Supabase Auth Admin `inviteUserByEmail` with:
   - redirect to the Talence auth callback;
   - `invited_user_id` in server-controlled user metadata;
4. store the returned auth-user ID;
5. mark the invitation `sent`;
6. on failure, mark `failed` with a safe error code.

The Supabase secret key is never sent to the browser.

### 2.5 Invite acceptance and admission finalization

After the invitation link establishes a valid Supabase session, the auth callback calls one idempotent database function, `finalize_admitted_user()`.

The function must:

1. derive `auth.uid()` and verified email from the session, not client input;
2. lock the matching invited-user row;
3. verify email, metadata linkage, status, expiration, and revocation;
4. mark the invitation `accepted` and link `auth_user_id`;
5. create or reactivate the profile;
6. create a personal workspace if none exists;
7. create an owner membership;
8. create a default MTG collection;
9. return the canonical profile/workspace/collection IDs;
10. commit all changes atomically.

If called again by the same valid user, it returns the existing resources without duplication.

### 2.6 Ongoing admission check

An authenticated Supabase session alone is insufficient.

Application middleware/server guards and RLS helper functions require:

- active profile;
- accepted invited-user record linked to the auth user;
- no profile suspension or platform ban.

A revoked unaccepted invite prevents account creation. Suspending an accepted user disables application access without deleting audit history.

## 3. Profiles

Profiles contain application-facing state only:

- auth user ID;
- admission invite ID;
- unique handle;
- display name;
- avatar path;
- preferred currency;
- status: `active | suspended | deletion_requested | deleted`;
- timestamps.

Email remains authoritative in Supabase Auth and is not treated as a public profile field.

## 4. Workspaces

### 4.1 Ownership model

Every mutable product resource references `workspace_id`.

A personal workspace is created for each admitted user. The initial UI may make it feel like “my account” while preserving the workspace boundary.

### 4.2 Fixed initial roles

| Capability | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| Read workspace resources | Yes | Yes | Yes | Yes |
| Create/edit collections and decks | Yes | Yes | Yes | No |
| Apply inventory changes | Yes | Yes | Yes | No |
| Manage devices and grants | Yes | Yes | No | No |
| Invite/remove ordinary members | Yes | Yes | No | No |
| Change member roles | Yes | Yes, except owner | No | No |
| Transfer/delete workspace | Yes | No | No | No |

Do not implement user-defined roles in the first release.

### 4.3 Membership invariants

- One membership per user/workspace.
- At least one active owner per active workspace.
- The final owner cannot leave or be removed.
- Suspended memberships have no resource access.
- Resource ownership is the workspace, not the creating user.

## 5. Workspace invitations

`workspace_invitations` is separate from global admission.

Fields include:

- workspace;
- invited email;
- intended role;
- inviter;
- status;
- expiration;
- accepted user;
- timestamps.

For an email without an admitted Talence account, accepting a workspace invitation also requires a valid global `invited_users` record. Administrative tooling may create both records in one workflow, but the concepts remain separate.

## 6. Row Level Security

### 6.1 Default deny

RLS is enabled on every table in an exposed schema. No policy means no access.

### 6.2 Catalog

Admitted authenticated users may read active catalog, set, face, legality, and current-price rows. Human users cannot insert, update, or delete catalog rows.

### 6.3 Workspace resources

Policies use indexed membership checks. The user's role must allow the operation and the row's `workspace_id` must match the membership.

### 6.4 Inventory history

- Viewers may read balances and transactions.
- Editors may call approved inventory functions.
- No client may directly update immutable transaction rows.
- Direct balance writes are denied; balances change only through functions.

### 6.5 Devices

Human device administration follows workspace roles. Device requests do not use human RLS sessions; trusted server routes validate the device and invoke narrow functions.

### 6.6 Private/admin tables

`app_private.invited_users`, credential digests, internal usage guard data, and raw operational details are not exposed to ordinary Data API roles.

## 7. Server-side authorization

RLS is necessary but not sufficient for privileged workflows.

Server code must explicitly verify:

- active admission;
- workspace membership and role;
- resource-workspace relationship;
- device grant;
- idempotency body hash;
- feature/quota availability.

The Supabase secret key bypasses ordinary RLS and therefore may be used only after these checks or through a function that performs them.

## 8. Platform administration

Platform administration is separate from workspace ownership.

Use a small `platform_user_roles` table with initial role `platform_admin`. Do not rely on user-editable metadata.

Platform administrators may:

- issue/revoke global invitations;
- view catalog operation status;
- suspend users;
- inspect safe operational failures;
- manage global feature guardrails.

They do not automatically become members of every workspace. Emergency support access, if ever introduced, requires explicit audited impersonation/support design.

## 9. Account and workspace deletion

- Deleting an auth identity is not the first step.
- Shared workspace ownership must be transferred or the workspace deliberately deleted.
- Immutable audit records retain a stable actor ID or anonymized reference as required.
- Personal workspace data may enter a deletion-request state and be purged after a documented retention period.
- Device credentials are revoked before workspace purge.
