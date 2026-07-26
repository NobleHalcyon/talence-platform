# Talence Platform — Agent Instructions

Read every file under `docs/canonical/` before implementation.

## Greenfield authority

- This is a clean-sheet platform build.
- Do not preserve or import prior Talence application code.
- Historical repository state may be archived but is not a dependency.
- Numbered canon and machine-readable contracts are authoritative.

## Locked stack

- Next.js App Router + React + TypeScript
- Vercel
- Supabase PostgreSQL/Auth/Storage/RLS
- CSS Modules + shared CSS tokens/classes; no Tailwind
- Python 3.13 catalog worker
- versioned `/api/v1` device contract
- robot is a separate client using SQLite snapshot

## Non-negotiables

- No public registration route or public `signUp` call.
- User creation must be gated by `app_private.invited_users` and the Supabase Before User Created hook.
- No human password/session implementation.
- Every mutable resource is workspace-scoped.
- RLS on all exposed tables; default deny.
- Inventory changes only through immutable transaction functions.
- Device credentials are distinct, scoped, revocable, and never stored raw.
- Idempotency is mandatory for device inventory mutations.
- Missing prices are never zero and every price shows source/freshness.
- No external paid service call from browser code.
- No remote robot motion control.
- No robot execution state in cloud database.

## Engineering rules

- Use npm workspaces without additional monorepo orchestration initially.
- Keep Windows-friendly commands in README.
- Generate/validate types from database and OpenAPI/JSON Schema.
- Add tests for every RLS and transactional invariant.
- Network-dependent worker tests use fixtures/mocks.
- Use semantic shared components; no page-local duplicated primitives.
- Inline styles only for justified dynamic CSS custom properties.
- Update canon/contracts with behavior changes.
- Keep a dev log per implementation phase.

## Completion report

For each phase report:

- files changed;
- migrations/functions/policies added;
- commands/tests run;
- screenshots or route descriptions;
- manual setup still required;
- deviations or open blockers.
