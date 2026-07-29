# Incident response

Last reviewed: 2026-07-27

Use this runbook for suspected authorization failure, leaked credentials,
provider-cost abuse, data corruption, or loss of availability. Safety and
workspace isolation take priority over preserving write availability.

## Roles and severity

Before launch, assign names and out-of-band contact methods for:

- incident commander;
- application/database operator;
- communications owner;
- backup operator.

| Severity | Example                                                                                     | Target response                                 |
| -------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| SEV-1    | Confirmed cross-workspace disclosure, leaked production service key, destructive corruption | Immediate containment and private-beta shutdown |
| SEV-2    | Device credential abuse, quota bypass, broken inventory writes, unavailable Auth            | Contain affected surface within 30 minutes      |
| SEV-3    | Degraded search, delayed catalog work, isolated non-sensitive error                         | Same business day                               |

## First 15 minutes

1. Open a UTC incident timeline and assign the commander.
2. Preserve the first valid `X-Request-Id`, affected user/workspace/device
   identifiers, deployment ID, and safe audit event IDs.
3. Do not copy request bodies, passwords, invite links, bearer credentials,
   signed URLs, HMAC digests, service keys, or provider payloads into tickets
   or chat.
4. Disable the narrowest affected control in `/app/admin/operations`.
5. When database access is uncertain, turn off the corresponding fail-closed
   Vercel environment switch and redeploy the known-good build.
6. Apply a Vercel Firewall deny, challenge, or rate rule when traffic is part
   of the incident.
7. For suspected isolation failure, disable all mutable surfaces and preserve
   the database for investigation.

## Containment map

| Surface                           | Immediate control                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Invitations/Auth provider calls   | Disable `managed_auth_invitation`, set `FEATURE_INVITATIONS_ENABLED=false`, tighten Auth/WAF limits                  |
| Catalog browsing/analytics        | Disable `catalog_search` or `collection_analytics`                                                                   |
| Catalog imports                   | Set `FEATURE_CATALOG_SYNC_ENABLED=false` and disable the database catalog switch                                     |
| Device inventory writes           | Set `FEATURE_DEVICE_INVENTORY_WRITES_ENABLED=false`, disable the device policy, suspend/revoke the device credential |
| Snapshot downloads                | Set `FEATURE_SNAPSHOT_DOWNLOADS_ENABLED=false`, disable manifest policy, revoke affected device credentials          |
| Device heartbeat/read/run summary | Disable the specific device feature policy                                                                           |
| Suspected user compromise         | Revoke Auth sessions, remove active access as reviewed, rotate related credentials                                   |
| Suspected server/worker secret    | Revoke and replace at the provider, then redeploy/restart trusted runtimes                                           |

No cloud control starts or stops robot motion. Follow the robot’s local safety
procedure separately; cloud incident response must not invent remote motion
commands.

## Investigation

- Correlate Vercel request logs, `X-Request-Id`, sanitized application JSON
  logs, Supabase Auth/database logs, and `public.audit_events`.
- Bound every query by UTC range and affected workspace/device. Ordinary
  workspace users cannot read platform audit events.
- Compare immutable inventory transactions and deck revisions with current
  projections; do not repair history in place.
- Check external daily usage and provider-side usage independently.
- For authorization concerns, reproduce with two non-admin users and the
  consolidated Phase 6 RLS matrix.
- Treat missing logs as unknown, not proof that access did not occur.

## Scenario procedures

### Cross-workspace access

1. Declare SEV-1 and close all mutable surfaces.
2. Preserve the deployment and database state.
3. Identify the exact table/RPC/route and principal.
4. Run the clean RLS matrix and browser denial journey against an isolated
   copy.
5. Patch policy, grant, and bounded RPC together; add a direct regression.
6. Review potentially exposed records and notification obligations before
   reopening.

### Credential exposure

1. Revoke the exact user session, device credential, Supabase key, worker
   database credential, or provider token.
2. Search safe logs by credential prefix or principal ID; never search by the
   complete secret.
3. Rotate dependent credentials. A device pepper change invalidates existing
   digests and therefore requires planned device re-enrollment.
4. Rebuild and run the browser-bundle secret scanner before deployment.

### Cost or traffic spike

1. Disable the applicable external/application control.
2. Enforce the edge rate rule and inspect current daily aggregate usage.
3. Compare provider billing/usage with database reservations.
4. Raise a quota only after identifying legitimate demand; do not bypass the
   atomic reservation function.

### Corruption or bad deployment

1. Stop writes and capture the last known-good deployment, migration, catalog
   generation, and transaction.
2. Roll back application code only when it remains schema compatible.
3. For data recovery, follow `backup-and-restore.md`; never edit immutable
   inventory history or snapshot bytes in place.

## Recovery and closure

1. Validate the fix on a disposable environment with the relevant unit,
   pgTAP, concurrency, Storage, and browser tests.
2. Re-enable one surface at a time, starting with reads.
3. Monitor errors, correlation IDs, audit events, quota consumption, and
   provider usage.
4. Record impact, timeline, root cause, detection gap, recovery evidence, and
   owners/dates for follow-up actions.
5. Rotate remaining incident credentials and rehearse the updated runbook.

Do not paste incident secrets into this repository. Keep customer-specific
impact analysis and operator contact details in the approved private incident
system.
