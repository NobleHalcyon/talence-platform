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

Naming convention:

- `000_*` — local-stack/test harness checks;
- `100_*` — Phase 1 admission and workspace tests;
- `200_*` — catalog tests;
- `300_*` — inventory ledger tests;
- `400_*` — deck tests;
- `500_*` — device and snapshot tests.
