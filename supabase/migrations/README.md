# Migrations

Phase 0 deliberately has no SQL migration. The Supabase CLI supports an empty
`migrations` directory, so an artificial no-op migration is unnecessary.

Starting in Phase 1, create immutable, ordered files with:

```powershell
npx supabase migration new <descriptive_name>
```

Every migration must:

- apply from an empty local database;
- use explicit constraints, indexes, grants, and RLS;
- keep private schemas out of the Data API;
- be exercised by a corresponding pgTAP test where it establishes an invariant;
- avoid production credentials or environment-specific identifiers.

Validate the full sequence locally with `npx supabase db reset`.
