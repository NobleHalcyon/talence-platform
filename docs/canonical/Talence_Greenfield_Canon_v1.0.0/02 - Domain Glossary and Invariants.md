# 02 — Domain Glossary and Invariants

Version: 1.0.0  
Status: Locked

## 1. Identity and tenancy

### Auth user

A human identity managed by Supabase Auth. Talence does not store human passwords.

### Invited user

A record in the private `invited_users` admission table authorizing one normalized email address to enter the private beta. It exists before or alongside the Supabase Auth user and remains as an admission audit record after acceptance.

### Profile

Talence-facing data associated one-to-one with an admitted auth user, such as handle, display name, avatar, status, and preferences.

### Workspace

The tenancy root for mutable product data. Collections, decks, devices, transactions, and future store resources belong to a workspace rather than directly to one person.

Initial workspace types:

- `personal`
- `team`
- `store`

Only personal workspaces must be exposed in the first UI.

### Workspace membership

Connects a user to a workspace with one fixed initial role:

- `owner`
- `admin`
- `editor`
- `viewer`

Owners are represented as memberships so authorization follows one path.

### Workspace invitation

An invitation to join an existing workspace. This is distinct from global product admission. A workspace invitation does not bypass the `invited_users` gate; for a new person, both admission and membership must be satisfied.

## 2. Catalog identity

### Game

A supported trading-card game. The first and only implemented game is Magic: The Gathering. The game boundary exists so future games are not forced into Scryfall-specific assumptions.

### Oracle card

The rules-level identity of a card. For MTG, the canonical ID is Scryfall `oracle_id` when present.

### Printing

A specific published card object, normally identified for MTG by Scryfall card `id`. It includes set, collector number, language, layout, rarity, available finishes, image references, and printing-specific metadata.

### Card face

One display or recognition face of a printing. Multi-faced layouts have ordered face records.

### Set

A release/product grouping with code, name, release date, type, and symbol references.

### External identifier

A provider identifier associated with a card or printing, such as Scryfall, TCGplayer, Cardmarket, MTGO, Arena, or Multiverse IDs.

## 3. Price identity

### Current price observation

The latest accepted estimate for a tuple of:

- printing;
- finish;
- currency;
- provider.

It records amount, provider observation time, and Talence ingestion time.

### Price freshness

How old a provider observation is. The UI shows the observation time or a derived age plus the exact timestamp.

### Run price snapshot

A robot-local immutable copy of the values used for value-sensitive planning. It never replaces or mutates the cloud current-price observation.

## 4. Inventory

### Collection

A named inventory container inside a workspace. Examples include Main Collection, Trade Binder, Unsorted Intake, Store Singles, and Show Inventory.

### Inventory balance

The current materialized quantity for:

`(collection, printing, finish, condition)`

### Finish

Initial values:

- `nonfoil`
- `foil`
- `etched`
- `unknown`

### Condition

Initial values:

- `unknown`
- `near_mint`
- `lightly_played`
- `moderately_played`
- `heavily_played`
- `damaged`

### Inventory transaction

An immutable header describing why inventory changed, who or what caused it, when it occurred, and its idempotency identity.

### Inventory transaction line

A printing-level quantity delta within an inventory transaction. Applying all lines atomically updates materialized balances.

### Reversal

A new compensating inventory transaction. Existing transaction history is never edited to pretend a committed change did not happen.

### Import job

A staged CSV ingestion with source file, parser version, row-level resolution state, preview, commit status, and error report.

## 5. Decks

### Deck

A workspace-owned deck with game, format, name, visibility, and selected inventory sources.

### Deck entry

An oracle-card requirement with quantity, zone, optional preferred printing, and notes.

Initial zones:

- `mainboard`
- `sideboard`
- `commander`
- `companion`
- `maybeboard`

### Preferred printing

The exact printing a user wants to display, value, or acquire. It does not change oracle-level ownership unless the user explicitly requests exact-printing analysis in a later feature.

### Ownership result

Owned quantity, required quantity, missing quantity, and preferred-printing availability calculated across the deck's selected collection sources.

## 6. Devices and runs

### Device

A robot, scanner, kiosk, or approved third-party machine registered to a workspace.

### Device credential

A high-entropy secret authenticating one device. The raw secret is shown once; only its non-secret prefix and cryptographic digest are stored.

### Device collection grant

Explicit permission for one device to read and/or post inventory changes to one collection.

### Device sync batch

An idempotent machine-originated inventory transaction request and its stored result.

### Run summary

A thin cloud record of a machine run: device, collection, counts, result, catalog version, timestamps, and optional diagnostic code. It excludes motion plans, bin occupancy, camera frames, motor state, and restart checkpoints.

### Catalog snapshot

An immutable, checksummed SQLite artifact containing the subset of catalog data needed by edge clients for offline identification and planning.

## 7. Global invariants

1. No auth user may access the application unless linked to an accepted, non-revoked invited-user record and an active profile.
2. Mutable product resources belong to exactly one workspace.
3. Catalog resources are global and system-written.
4. Inventory references printing identity; deck entries reference oracle identity.
5. Inventory balances may not become negative.
6. One idempotency key may represent exactly one request body and one result.
7. Replaying an identical request must not apply inventory twice.
8. A device may access only explicitly granted collections in its workspace.
9. A device never authenticates with a human session.
10. Every displayed price includes source and observation time.
11. Missing price remains null/unknown.
12. Cloud run records never become the robot's execution-state authority.
13. No public or anonymous policy may expose private-beta catalog or user data.
14. Metered external-service calls must pass server-side quota and feature-enable checks.
15. Historical implementation details cannot override these invariants.
