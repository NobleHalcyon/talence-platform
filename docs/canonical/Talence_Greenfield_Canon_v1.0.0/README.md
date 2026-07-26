# Talence Greenfield Canon

Version: 1.0.0  
Status: Canonical baseline for greenfield implementation  
Date: 2026-07-26

## Purpose

This package is the complete domain and architecture authority for rebuilding the Talence cloud platform from an empty repository state.

It is intentionally **not** a migration plan. Existing Talence code, schemas, endpoints, and prior canonical files are historical evidence only. Codex must not preserve an earlier implementation unless this package explicitly retains a product rule.

## Product in one sentence

Talence is an invite-only, mobile-first Magic: The Gathering catalog, collection, and deck-management platform that accepts secure, idempotent inventory updates from Talence robots and approved third-party machines.

## Canonical document order

1. `00 - Canonical Authority.md`
2. `01 - Product Charter.md`
3. `02 - Domain Glossary and Invariants.md`
4. `03 - Feature Specification.md`
5. `04 - Greenfield System Architecture.md`
6. `05 - Identity Invites Workspaces and Authorization.md`
7. `06 - Database Domain Model.md`
8. `07 - Catalog Pricing and Robot Snapshot Pipeline.md`
9. `08 - API and Device Integration Contract.md`
10. `09 - Web UX and Design System.md`
11. `10 - Robot Cloud Boundary.md`
12. `11 - Security Cost Controls and Operations.md`
13. `12 - Roadmap and Acceptance Criteria.md`
14. `13 - Decision Ledger.md`
15. `14 - Historical Source Reconciliation.md`
16. `15 - Official References.md`

Machine-readable companion contracts live under `contracts/`. Architecture, admission, catalog, inventory, and domain diagrams live under `diagrams/`. `TALENCE-GREENFIELD-CANON-COMBINED.md` provides a convenient single-file reading copy; the numbered documents remain the editing authority.

## Source-of-truth hierarchy

1. Numbered documents in this package
2. Machine-readable contracts in this package
3. Database migrations and generated OpenAPI committed by the implementation
4. Application code and tests
5. Historical files and prior conversations

When implementation changes behavior, the relevant canonical document and contract must change in the same pull request.

## How Codex should consume this package

Copy this package into a new dedicated platform repository at `docs/canonical/`. Keep the active robot implementation in its own repository so both systems can advance concurrently. Put `AGENTS.md` at repository root as well. Codex must read the entire package before scaffolding application code.

The separate implementation-prompt package contains a master build prompt and phase prompts. The canon should remain steady-state; prompts may evolve as implementation progresses.

## Clean-sheet declaration

The following are not binding merely because they existed before:

- MongoDB
- custom password or refresh-token storage
- Vue, FastAPI, SQLite, or any other prior cloud stack choice
- old endpoint names
- old milestone numbering
- old table names
- old robot lifecycle code
- old authorization policies

The selected greenfield stack is defined in `04 - Greenfield System Architecture.md`.

## Package integrity

`MANIFEST.json` records SHA-256 hashes for every packaged file. `VALIDATION_REPORT.md` records structural validation performed before delivery.
