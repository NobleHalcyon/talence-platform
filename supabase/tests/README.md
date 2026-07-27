# Database tests

Database tests use pgTAP through the Supabase CLI. Test files live under
`tests/database`, run inside transactions, and must roll back their fixtures.

From the repository root in PowerShell:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
```

The Phase 0 smoke test verifies that the local Supabase Auth schema is available.
The Phase 1 suites cover hook admission, verified-email/metadata finalization,
replay safety, trusted invitation transitions, inactive profiles, active
defaults, final-owner constraints, and RLS with multiple users/workspaces. Tests
must not require hosted credentials, production data, or live network access.
The Phase 2 suites cover schema/grants, representative layouts and languages,
dependency-aware replay, worker lease recovery, truncation guards, promotion
rollback, bounded search/cursors/filters, freshness, admin queue shape, and
catalog RLS/write denial. They also prove the in-flight catalog-sync kill switch,
service-role-only queued no-op completion and replay, printing-level
color-identity preservation for non-oracle objects, and a 50,000-printing
generated search corpus. `240_phase_2_catalog_search_performance.test.sql`
asserts an index-backed plan and a five-second bound against the actual catalog
query function; fixture construction time is outside that measured bound.

The Phase 3 suites contain 163 pgTAP assertions: 32 for schema/API surface, 25
for ledger/idempotency invariants, 5 for maximum-import performance, 25 for
transfer/reversal/lifecycle invariants, 50 for import/read/export/retention
behavior, and 26 for two-workspace RLS. The performance suite constructs 5,000
distinct matched import rows outside the timed section, commits through
`inventory_import_commit`, forces deferred invariants, verifies all lines and
balances, and enforces a generous five-second local ceiling.

Storage authorization and true multi-session races require the local API and
are covered separately:

```powershell
npm run test:supabase:phase3-integration
```

That harness verifies exact private object access and cleanup ordering, plus
identical/conflicting idempotency races and distinct-key updates to the same
previously absent balance. It refuses non-loopback database/API targets by
default. A deliberate hosted test run requires the explicit
`TALENCE_ALLOW_HOSTED_PHASE3_INTEGRATION=1` opt-in in addition to the complete
credential set. If the Supabase CLI cannot discover Docker from the current VS
Code process after a per-user Docker Desktop install, prepend its CLI
directory for the current PowerShell process:

```powershell
$talenceDockerBin = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin"
$env:PATH = "$talenceDockerBin;$env:PATH"
npm run test:supabase
```

`run-pgtap.mjs` remains a diagnostic direct-PostgreSQL runner; the canonical
validation is the Supabase CLI command above.

Naming convention:

- `000_*` — local-stack/test harness checks;
- `100_*` — Phase 1 admission and workspace tests;
- `200_*` — catalog tests;
- `300_*` — inventory ledger tests;
- `400_*` — deck tests;
- `500_*` — device and snapshot tests.
