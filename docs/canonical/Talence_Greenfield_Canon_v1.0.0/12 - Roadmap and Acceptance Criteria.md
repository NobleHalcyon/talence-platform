# 12 — Roadmap and Acceptance Criteria

Version: 1.0.0  
Status: Locked implementation sequence

## 1. Delivery strategy

The web platform is built concurrently with the robot. The cloud milestones therefore prioritize a usable independent vertical slice and stable robot contracts early.

Codex may execute the entire roadmap from one master prompt, but implementation must still preserve phase checkpoints, tests, and reviewable commits.

## 2. Phase 0 — Greenfield repository and tooling

Deliver:

- a dedicated clean platform repository (preferred), or an archive branch/tag before resetting a deliberately selected legacy platform repository;
- no deletion or rewrite of the separate active robot repository;
- clean platform branch with historical platform implementation removed when applicable;
- repository layout from architecture canon;
- Next.js/TypeScript web scaffold;
- CSS token and primitive foundation;
- Supabase local project scaffold;
- Python catalog-worker scaffold;
- contracts package;
- lint, type-check, unit-test, Playwright, Python test, and migration scripts;
- CI from a clean checkout;
- canonical docs copied into repo.

Acceptance:

- no old runtime code is imported;
- `npm install` and documented Python setup work on Windows;
- clean build/test scripts pass;
- app renders responsive Talence shell and static landing;
- no Tailwind or privileged secret in client code.

## 3. Phase 1 — Invite-only identity and workspace foundation

Deliver:

- admission/private schemas and migrations;
- invited-user hook/function;
- admin invite CLI and admin page;
- Supabase invite callback flow;
- admission finalization function;
- login/logout/recovery;
- profiles, workspaces, memberships, preferences;
- personal workspace/default collection provisioning;
- RLS helpers and test suite;
- app route guards and workspace context.

Acceptance:

- unknown email cannot become an application user;
- valid invite works end to end;
- finalization is atomic/idempotent;
- no registration route;
- production sign-in/recovery bot protection and auth rate-limit setup are documented and wired;
- cross-workspace isolation tests pass;
- inactive profile denied;
- first bootstrap administrator procedure documented.

## 4. Phase 2 — Catalog, pricing, and browse vertical slice

Deliver:

- catalog and operation migrations;
- fixture-driven Python importer;
- live bulk metadata/download mode;
- staging, validation, promotion;
- search indexes/functions;
- daily/manual workflow scaffold;
- catalog list/search/filter/detail UI;
- multi-face printing UI;
- source/freshness display;
- admin catalog status.

Acceptance:

- tests do not require live network;
- import handles representative layouts/languages;
- failed import preserves old active catalog;
- null price is never zero;
- ordinary users cannot write catalog;
- catalog pages are usable on phone;
- search is bounded and indexed.

## 5. Phase 3 — Collection inventory and audit

Deliver:

- collection, balance, transaction, line, and import migrations;
- atomic inventory functions;
- collection list/detail views;
- structured/gallery/analytical modes;
- add/edit/remove and transaction history;
- collection summary and valuation;
- CSV stage/preview/commit/export;
- archive/restore/delete behavior;
- concurrency/idempotency tests.

Acceptance:

- no direct balance mutation;
- negative quantity impossible;
- transaction and balances commit atomically;
- reversal produces compensating transaction;
- imported ambiguity requires review;
- mobile editing is complete;
- totals use finish-specific price and show unpriced quantity.

## 6. Phase 4 — Deck builder

Deliver:

- format/deck/entry/source migrations;
- deck list and editor;
- search/add/edit/zone controls;
- preferred printing;
- ownership/missing calculations;
- valuation;
- baseline format validation;
- text import/export where scoped;
- compact and wide layouts.

Acceptance:

- deck entry is oracle-level;
- ownership sums across printings in selected collections;
- exact preferred-printing ownership shown separately;
- validation explanations are deterministic;
- all actions work without drag-and-drop;
- editor usable on phone.

## 7. Phase 5 — Device API and robot snapshot

Deliver:

- device, private credential, grants, sync batch, run summary, snapshot migrations;
- device registration/credential/grant UI;
- `/api/v1/device` auth and endpoints;
- OpenAPI/JSON Schema validation;
- atomic inventory batch integration;
- catalog SQLite generator;
- immutable artifact upload/manifest;
- reference client/fixture tests.

Acceptance:

- raw credential never stored;
- revoked/suspended device denied;
- collection grant enforced;
- replay safe and conflict detected;
- unknown printing returns actionable catalog error;
- SQLite passes integrity and checksum;
- cloud catalog and snapshot sampled IDs match;
- no robot movement state in cloud schema.

## 8. Phase 6 — Hardening and deployment

Deliver:

- complete RLS regression suite;
- Playwright critical-flow suite;
- WAF/spend-cap operational checklist;
- security headers/CSP;
- rate/size/quota enforcement;
- logging/correlation IDs;
- backup/restore and incident docs;
- performance/accessibility pass;
- Vercel/Supabase production configuration instructions;
- canonical-to-implementation audit.

Acceptance:

- all CI checks pass from clean checkout;
- migrations apply from blank local Supabase;
- seeded test environment repeatable;
- no anonymous app data;
- no secret in client bundle/log fixture;
- key phone flows pass Playwright;
- production checklist explicit;
- deferred features absent.

## 9. Private-beta release definition

The platform is release-ready when an invited tester can:

1. accept an invitation;
2. log in on phone and desktop;
3. browse/search the catalog;
4. see exact printing and price freshness;
5. add/import a collection;
6. edit inventory with visible history;
7. create a deck and see owned/missing cards;
8. register a device and grant a collection;
9. post a fixture device inventory batch safely;
10. download/verify a catalog snapshot;
11. recover from expected errors without admin database edits.

## 10. Pull-request and commit standard

Even when Codex runs from one prompt:

- one branch for the greenfield build;
- checkpoint commits by phase;
- no merge until CI passes;
- each phase includes a dev log with files, decisions, tests, and manual checks;
- schema/API behavior changes update canon/contracts in the same commit or adjacent checkpoint;
- no generated artifacts or local secrets committed unintentionally.

## 11. Human-only setup gates

Codex can scaffold but cannot supply private production credentials. The product owner must:

- create/link Supabase and Vercel projects;
- choose regions;
- configure redirect URLs/site URL;
- activate the auth hooks after migrations;
- store secrets;
- configure email delivery;
- enable WAF and spend controls;
- bootstrap the first platform administrator;
- run/approve first live catalog import;
- review licensing before wider/commercial access.
