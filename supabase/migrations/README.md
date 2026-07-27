# Migrations

Phase 1 begins the immutable migration sequence:

- `20260726010000_*` creates private/API schemas, identity and workspace tables,
  the minimal collection prerequisite, constraints, indexes, and the MTG game;
- `20260726011000_*` creates the Auth hook, admission/admin RPCs, authorization
  helpers, finalization, and owner/default-resource invariant triggers;
- `20260726012000_*` applies least-privilege grants and default-deny RLS.

Phase 2 continues it:

- `20260726020000_*` creates catalog, price, source/import provenance, active
  state, search indexes, and private staging tables;
- `20260726021000_*` creates worker lease, validation, failure, cleanup,
  dependency-validated queued no-op replay, in-flight sync-switch enforcement,
  and transactional-promotion functions;
- `20260726022000_*` creates bounded browse/detail/status and admin queue RPCs;
- `20260726023000_*` applies catalog least-privilege grants and default-deny
  RLS.

Phase 3 adds collection and inventory state:

- `20260726030000_*` creates collection lifecycle, immutable ledger, exact
  balance, import staging, idempotency-request, and supporting enum/index
  structures;
- `20260726031000_*` creates atomic apply, transfer, and compensating-reversal
  functions with exact replay and conflict handling;
- `20260726032000_*` creates bounded collection, inventory, valuation,
  analytics, history, line-detail, and export reads;
- `20260726033000_*` creates resumable CSV staging, deterministic resolution,
  atomic import commit/cancel, stale-job expiry, and retention coordination;
- `20260726034000_*` applies least-privilege grants, default-deny RLS, immutable
  ledger guards, deferred pair/reversal invariants, and exact private Storage
  policies.

Phase 4 adds deck construction and analysis:

- `20260726040000_*` creates append-only format rules, workspace-scoped decks,
  entries, ordered inventory sources, immutable revisions/validation runs, and
  lifecycle/preservation invariants;
- `20260726041000_*` creates optimistic-revision mutations, canonical content
  hashing, bounded snapshots, exact inactive-pin preservation, canonical
  multi-source lock ordering, and deck-before-catalog generation locks that
  serialize catalog-backed writes with promotion;
- `20260726042000_*` creates finite oracle/preferred-printing ownership,
  set-based list summaries, version-bound catalog/printing reads, bounded
  import resolution, coherent locked ownership reads, history, and
  deterministic exports;
- `20260726042100_*` creates persisted, version-pinned advisory validation,
  exact pre-truncation legality totals, and coherent detail composition;
- `20260726043000_*` applies least-privilege grants, workspace RLS, and
  collection/deck-source deletion coordination.

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
npx supabase db reset --local --no-seed
npm run db:lint
npm run test:supabase
npm run test:supabase:phase3-integration
npm run test:supabase:phase4-concurrency
```
