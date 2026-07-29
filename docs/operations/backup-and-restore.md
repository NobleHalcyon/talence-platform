# Backup and restore runbook

Last reviewed: 2026-07-27

This runbook covers the hosted Supabase PostgreSQL database and Talence’s two
private Storage buckets. A database backup does not include Storage object
bytes, so both layers must be protected and rehearsed.

## Recovery objectives and ownership

Before opening the beta, name a primary and secondary operator and approve:

- database recovery-point objective: no more than 24 hours without PITR, or
  the configured PITR interval when enabled;
- service recovery-time objective: four hours for the private beta;
- monthly restore rehearsal and an additional rehearsal before a schema or
  retention change;
- a protected destination for bucket inventory/checksum records and required
  retained objects.

Supabase documents plan-specific daily backups and point-in-time recovery in
[Database backups](https://supabase.com/docs/guides/platform/backups). Its
[production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
should be reviewed whenever the project plan or availability target changes.

## Protected data

Database recovery must preserve:

- invite/admission records, profiles, workspace membership, and preferences;
- active catalog identity and current provider observations;
- collections, immutable inventory transactions/lines, balances, imports,
  decks/revisions, devices/grants, snapshot manifests, quotas, and audit events;
- private credential digests and idempotency records.

Storage recovery is separate:

- `inventory-imports` contains bounded private source files retained for the
  configured import-retention period;
- `catalog-snapshots` contains immutable SQLite artifacts referenced by
  `catalog_snapshots`.

Expired import sources are intentionally purgeable only through the retention
workflow. Active/current and previous catalog snapshots must remain available
or be deterministically regenerated from a verified matching catalog source.

## Routine verification

At least daily:

1. confirm the latest database backup/PITR state and alert delivery;
2. export a metadata-only inventory of both private buckets: bucket, exact
   object path, byte size, creation time, and SHA-256 where recorded;
3. compare active import/snapshot database references with Storage objects;
4. investigate missing referenced objects, unexpected public access, or
   changed bytes immediately;
5. keep all exports outside the repository and outside browser-accessible
   storage.

Do not copy raw device credentials—they are intentionally unavailable after
issuance. A restored credential digest remains valid; rotate the credential if
its surrounding backup custody is in doubt.

## Restore rehearsal

Use an isolated non-production project:

1. Record source backup identity, UTC time, operator, expected RPO, and expected
   row/object counts.
2. Keep invitations, catalog sync, device writes, and snapshot downloads off.
3. Restore the database backup/PITR point using the Supabase-supported process.
4. Restore or reconcile private Storage objects without changing immutable
   object paths.
5. Apply only migrations newer than the restored schema, in order.
6. Run database lint and the complete RLS matrix.
7. Verify:
   - no anonymous application-data policy or direct grant;
   - two users remain isolated across workspace, inventory, deck, and device
     data;
   - immutable transaction totals reconcile with balances;
   - active catalog and snapshot pointers reference valid generations;
   - each referenced snapshot matches recorded size and SHA-256;
   - a signed snapshot URL expires and anonymous public access stays denied;
   - invitation and device credentials fail closed when their controls are
     disabled.
8. Run the Phase 6 browser journey against the isolated project or an
   equivalent disposable local restoration.
9. Record elapsed time, achieved recovery point, discrepancies, and cleanup.

Never use a rehearsal to overwrite the production project.

## Production recovery

1. Declare an incident and start the incident timeline.
2. Disable risky application controls and Vercel deployment switches. Apply a
   maintenance/deny rule if continued writes could worsen the incident.
3. Preserve logs, audit correlation IDs, affected deployment ID, database
   backup identity, and bucket listings. Do not place secrets in the timeline.
4. Choose the restore point by the last known-good immutable transaction,
   catalog promotion, and security event—not only by wall-clock convenience.
5. Restore the database through the supported Supabase workflow. Expect
   downtime; do not assume the project remains writable during restoration.
6. Reconcile Storage separately. Never silently repoint a database manifest to
   different bytes.
7. Run the rehearsal verification list against the restored project.
8. Rotate potentially exposed user sessions, server secrets, device
   credentials, or worker credentials before reopening.
9. Re-enable read paths first, then one write surface at a time while watching
   structured logs, audit events, quotas, and provider usage.
10. Close with a post-incident review and a fresh restore rehearsal.

## Rehearsal record

Record this evidence outside the public repository:

```text
Date/time (UTC):
Primary / secondary operator:
Source backup or PITR point:
Database rows and Storage objects expected:
Database rows and Storage objects recovered:
RPO achieved:
RTO achieved:
RLS and critical journey result:
Snapshot checksum result:
Discrepancies and remediation:
Next rehearsal date:
```
