# 00 — Canonical Authority

Version: 1.0.0  
Status: Locked

## 1. Scope

This canon governs the Talence cloud platform, including:

- the web application;
- human identity and admission;
- workspaces and permissions;
- the Magic catalog and price estimates;
- collections and inventory history;
- decks and ownership analysis;
- registered machines and their cloud API;
- robot catalog artifacts;
- operational security and cost controls.

It does not govern robot motion, sensors, image-capture mechanics, deterministic movement planning, or hardware recovery. Those concerns belong to a separate robot project and consume the contracts defined here.

## 2. Greenfield rule

Talence is being rebuilt from scratch. Existing repository contents are not an implementation constraint.

Historical material may supply:

- product intent;
- vocabulary;
- user experience preferences;
- robot-domain invariants;
- long-term business goals.

Historical material may not silently supply:

- a framework;
- a database;
- a schema;
- an endpoint;
- a security model;
- a milestone boundary;
- a requirement to maintain compatibility.

## 3. Requirement states

Every material item is one of:

- **Locked** — required for the stated release or architecture.
- **Deferred** — intentionally not implemented now, but an extension point is defined.
- **Prohibited** — must not be introduced without a canonical change.
- **Open** — unresolved and non-blocking; Codex must not invent irreversible behavior.

Unlabeled normative statements in numbered canon are Locked.

## 4. Conflict resolution

When documents conflict:

1. the more specific numbered document controls within its scope;
2. machine-readable contracts control exact payload shape;
3. `13 - Decision Ledger.md` controls explicit locked/deferred/prohibited decisions;
4. unresolved conflicts stop implementation of only the affected behavior, not unrelated work.

## 5. Change discipline

A behavior change requires all of the following in one pull request:

- canonical text update;
- schema or API contract update when applicable;
- tests demonstrating the new behavior;
- a decision-ledger entry for architecture-level changes.

No version bump means no canonical architecture change.

## 6. Implementation-agent rules

Codex must:

- prefer small modules and explicit contracts;
- keep the browser, trusted server, catalog worker, and robot boundaries visible;
- use generated types where practical;
- implement authorization at the database and server layers;
- include loading, empty, error, and success states for every data-driven screen;
- preserve Windows-friendly local instructions;
- run tests without relying on production credentials;
- record assumptions in a dev log rather than hiding them in code.

Codex must not:

- preserve old code for compatibility;
- create public self-registration;
- put privileged secrets in browser code;
- let a machine authenticate as a human;
- call metered third-party services directly from the browser;
- use Tailwind or long utility-class strings as the styling system;
- put robot movement state in the cloud database;
- implement deferred marketplace, billing, store accounting, or AI recommendation systems.

## 7. Canon completion standard

This canon is implementation-ready when a competent engineer can determine:

- what the product must do;
- which system owns each datum;
- how identity and access work;
- which tables and invariants are required;
- how the catalog enters the system;
- how a robot integrates without sharing runtime state;
- which features belong in the first build;
- which decisions are intentionally deferred.
