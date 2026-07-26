# Migrations

Phase 1 begins the immutable migration sequence:

- `20260726010000_*` creates private/API schemas, identity and workspace tables,
  the minimal collection prerequisite, constraints, indexes, and the MTG game;
- `20260726011000_*` creates the Auth hook, admission/admin RPCs, authorization
  helpers, finalization, and owner/default-resource invariant triggers;
- `20260726012000_*` applies least-privilege grants and default-deny RLS.

Create later immutable, ordered files with:

```powershell
npx supabase migration new <descriptive_name>
```

Every migration must:

- apply from an empty local database;
- use explicit constraints, indexes, grants, and RLS;
- keep private schemas out of the Data API;
- be exercised by a corresponding pgTAP test where it establishes an invariant;
- avoid production credentials or environment-specific identifiers.

Validate the full sequence locally with:

```powershell
npx supabase db reset
npx supabase db lint --local --level warning
npx supabase test db
```
