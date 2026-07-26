# 14 — Historical Source Reconciliation

Version: 1.0.0  
Status: Evidence record only

## 1. Purpose

Record which concepts were recovered from older Talence documents and conversations without making those documents part of the new authority chain.

## 2. Retained product intent

- catalog separates oracle cards from printings;
- collection inventory tracks printing, finish, condition, and quantity;
- price freshness is visible;
- robots are trusted/registered clients, not the backend itself;
- cloud stores thin run outcomes rather than physical execution internals;
- mobile-friendly collection and deck workflows;
- shared reusable components and disciplined styling;
- structured global shell;
- restrained Arcane-Tech / Precision Tool identity;
- navy, gold, and neutral palette;
- workspaces/multi-user/store expansion as long-term direction;
- catalog source is Scryfall;
- robot uses local SQLite and offline catalog;
- deterministic run pricing may be snapshot locally;
- machine mutations must be idempotent;
- no remote motion start in the first version.

## 3. Retained robot-domain evidence only

- LIFO bins;
- Scan → Plan → Execute;
- full composite sort ordering;
- correctness over utilization/move minimization;
- input and unrecognized system bins;
- pinned bin/value/copy settings as future robot policy concerns;
- restart-safe local execution.

These are not cloud database requirements except where the robot API needs shared identity or collection data.

## 4. Rejected/superseded architecture

### MongoDB

Rejected for the new cloud platform. Relational constraints, transactions, RLS, and audit ledgers favor PostgreSQL.

### Custom human auth

Rejected. Supabase Auth owns credentials/sessions. Talence owns admission and authorization.

### Public registration

Rejected for private beta. Admission requires invited-user ledger and admin invitation.

### Old one-owner resource model

Replaced by workspace ownership and membership from day one.

### Generic list-as-deck model

Replaced by first-class decks and oracle-level entries.

### Prices embedded directly on printing

Replaced by normalized current observations keyed by provider/currency/finish with source timestamps.

### Desktop-first UI

Rejected. Mobile is primary.

### Vue 3/Vite cloud lock

Superseded by the greenfield Next.js App Router decision for Vercel integration and server-side composition.

### Existing SQLite/robot schema as cloud truth

Rejected. SQLite remains an edge/runtime/snapshot technology only.

### Existing endpoints and milestone numbers

Not preserved. New contracts and implementation phases start from this package.

## 5. Historical-file use rule

Do not copy old files into active Codex context except as clearly labeled evidence. This package contains the retained decisions in current form.
