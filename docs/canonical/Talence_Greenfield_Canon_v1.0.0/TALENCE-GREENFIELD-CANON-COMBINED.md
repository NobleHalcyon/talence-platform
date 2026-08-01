# Talence Greenfield Canon — Combined Reading Copy

Version: 1.0.0  
Generated: 2026-07-26  

> The numbered source files remain the editing authority. This file is generated for convenient review and Codex context loading.


---

<!-- SOURCE: 00 - Canonical Authority.md -->

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

---

<!-- SOURCE: 01 - Product Charter.md -->

# 01 — Product Charter

Version: 1.0.0  
Status: Locked

## 1. Product statement

Talence is an invite-only, mobile-first Magic: The Gathering collection and deck-management platform. It maintains a searchable catalog and current price estimates, records auditable inventory changes, helps users build decks from cards they own, and accepts updates from Talence robots and approved third-party machines.

The cloud product must remain useful without a robot. The robot is a high-value client, not the organizing principle of the platform.

## 2. Immediate audience

### Personal collectors

They need to:

- browse the complete Talence MTG catalog;
- distinguish oracle identity from exact printings;
- track printing, finish, condition, and quantity;
- see source and freshness for price estimates;
- import and export inventory;
- build decks and understand owned versus missing cards;
- connect a personal sorter or scanner later.

### The product owner and invited testers

The first release is a controlled private beta. Admission is intentionally manual so traffic, support load, and metered-service usage remain bounded.

## 3. Near-term product goal

Deliver a production-shaped web application that is genuinely usable on a phone and supports this end-to-end path:

1. An administrator invites a user.
2. The user accepts the invite and creates their account.
3. Talence provisions a personal workspace and default collection.
4. The user browses the MTG catalog and sees price freshness.
5. The user adds or imports cards into a collection.
6. The user creates a deck and sees owned and missing quantities.
7. A registered machine can post an idempotent inventory update to a granted collection.
8. A robot can download a versioned SQLite catalog snapshot derived from the same cloud catalog.

## 4. Long-term audiences

### Independent sellers and show vendors

Future needs include portable inventory subsets, rapid intake, locations, price review, sales, and margin.

### Local game stores

Future needs include multiple employees, multiple locations, acquisition lots, cost basis, trade-in intake, storefront publication, event promotion, and broader non-TCG inventory.

### Hardware ecosystem

Future clients may include full sorters, countertop scanners, kiosks, mobile scanners, labeling systems, and certified third-party machines.

## 5. Product principles

### Cloud truth and edge truth are distinct

The cloud owns accounts, workspaces, catalog, collection inventory, decks, devices, and accepted run summaries. A robot owns motion, local sensing, local execution recovery, and its temporary operational state.

### Exact identity matters

Inventory references a printing. Deck construction and copy rules generally reference an oracle card. A physical robot may create temporary per-copy instance IDs without forcing the cloud to create a permanent row for every physical card.

### Inventory is auditable

Current quantity alone is insufficient. Every change is represented by an immutable transaction with one or more quantity deltas.

### Prices are estimates with provenance

Every user-visible price must state provider and observation time. Missing price is unknown, never zero.

### Mobile is a primary platform

A workflow that only works on desktop is incomplete. Drag-and-drop may enhance desktop use but may never be the only way to perform an action.

### Cost is a design constraint

External services are called through controlled server adapters with quotas, caching, rate limits, and kill switches. The private beta has no anonymous dynamic catalog or user-data access.

## 6. Initial-release capabilities

- invite-only human authentication;
- personal workspaces;
- mobile-first application shell;
- catalog browsing, search, filters, card detail, printings, faces, and price freshness;
- collection creation and inventory tracking;
- immutable inventory transaction history;
- CSV import and export;
- deck creation, editing, zones, ownership, missing cards, valuation, and baseline validation;
- device registration, credential rotation/revocation, and collection grants;
- idempotent device inventory batches;
- versioned robot catalog manifests and SQLite snapshots;
- narrow administrative screens for invitations, catalog sync, devices, and cost/usage health.

## 7. Explicit initial-release non-goals

- public self-registration;
- anonymous catalog browsing;
- remote initiation of robot motion;
- live cloud control of hardware;
- marketplace transactions;
- payment processing;
- subscription billing;
- store accounting or cost basis;
- public collection/deck publishing;
- social features or in-app trading;
- AI deck recommendations;
- EDHREC scraping or unofficial integrations;
- other trading card games;
- native mobile applications.

## 8. Commercial and legal gate

Talence may eventually sell hardware or subscriptions. Before public commercialization, the product owner must review licensing and usage rights for Magic names, rules text, card art, symbols, and provider data. Scryfall price estimates must not be represented as storefront-grade pricing without a suitable provider and license.

---

<!-- SOURCE: 02 - Domain Glossary and Invariants.md -->

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

---

<!-- SOURCE: 03 - Feature Specification.md -->

# 03 — Feature Specification

Version: 1.0.0  
Status: Locked for the private-beta build unless marked Deferred

## 1. Release framing

The initial implementation is a **private beta**, not a public launch. Every dynamic application route requires an admitted user. The only anonymous surfaces are the branded sign-in landing/legal pages, login, and the invite/auth callback flow.

Features are prioritized as:

- **P0** — required for the first usable private-beta release;
- **P1** — required before the platform is considered robot-integration ready;
- **Deferred** — remembered in architecture but not implemented now.

## 2. Admission, authentication, and account lifecycle

### 2.1 Administrative invitation — P0

An authorized platform administrator can:

- enter an email address;
- choose an expiration date;
- add an optional note;
- issue the invite through Supabase Auth;
- see invite status: draft, sent, accepted, revoked, expired, or failed;
- resend when technically valid;
- revoke an unaccepted invitation.

The invitation action must first create or activate the corresponding `invited_users` record. A Supabase auth hook must reject creation of users whose normalized email does not have a valid invitation.

### 2.2 Invite acceptance — P0

The recipient can:

- follow the invite link;
- set a password through the managed auth flow;
- complete a minimal profile;
- enter the app only after admission finalization succeeds.

Admission finalization atomically:

- marks the invited-user record accepted;
- links it to the auth user;
- creates an active profile;
- creates a personal workspace;
- creates the owner's membership;
- creates a default MTG collection.

Repeated finalization must be safe and return the existing resources.

### 2.3 Login, logout, recovery — P0

- Username-or-email/password login. Handle-to-email resolution is trusted-server-only; Supabase Auth remains the credential and session authority, and failures do not disclose whether a handle exists.
- Logout from the current session.
- Password recovery for admitted users.
- Authenticated requests with inactive/suspended profiles are denied.
- There is no registration screen or public sign-up call.

### 2.4 Account settings — P1

- Display name.
- Unique handle.
- Avatar.
- Default workspace and collection.
- Preferred currency.
- Collection display preference.
- Deck display preference.

### 2.5 Account deletion — P1

The user may request account deletion only after ownership obligations are resolved. The final owner of a shared workspace cannot be deleted until ownership is transferred or the workspace is deleted.

## 3. Application shell and navigation

### 3.1 Shared shell — P0

Desktop/tablet primary navigation:

- Catalog
- Collections
- Decks

The canonical Talence emblem links to the dashboard, so Dashboard is not duplicated as a text link. The profile control opens an account submenu ordered as workspace selector, Devices, Admin for platform administrators, Settings, and Log Out.

Mobile primary navigation must keep the highest-frequency destinations reachable without horizontal scrolling. Contextual filters move into a drawer/sheet.
The compact bottom navigation contains Catalog, Collections, and Decks; account and administrative destinations remain in the shared profile submenu.

### 3.2 Workspace context — P0 foundation, P1 UI

All resource queries operate in an active workspace. The first UI may default directly to the personal workspace while still using workspace-scoped routes and data internally.

Workspace switching appears first in the profile submenu and lists every workspace accessible to the user.

### 3.3 Required page states — P0

Every data-driven route has explicit:

- loading;
- empty;
- error;
- success;
- permission denied;
- stale-data/freshness messaging where relevant.

## 4. Dashboard

### 4.1 Personal dashboard — P0

Show:

- total physical cards across the active workspace's default collection scope;
- unique printings;
- unique oracle cards;
- estimated current value;
- unpriced card count;
- collection last changed time;
- price observation freshness;
- recent inventory transactions;
- recent decks;
- connected device health summary when devices exist.

Dashboard cards link to the underlying detail route. Expensive aggregates use database functions or maintained summaries rather than repeated client joins.

## 5. MTG catalog

### 5.1 Catalog browse — P0

Admitted users can browse the Oracle-card catalog and may explicitly expand results to all eligible printings ingested by Talence.

Default browse scope emphasizes physical, non-digital printings while allowing an explicit switch to broader catalog records.
Oracle mode is the default and returns one deterministic representative printing per Oracle card after applying the active filters. A selected set therefore chooses that card's representative from the selected set.
Selecting **Return all variants** disables Oracle grouping and returns every eligible individual printing.
The initial browse is populated without requiring a search term.

View modes:

- card grid, the default whenever the browse route has no explicit view parameter;
- dense table/list.

The table remains an explicit URL-addressable view, but it does not replace the grid default for a later bare-route visit.
Grid requests use bounded responsive page sizes aligned to the active column count so a full page contains complete rows without requesting the full catalog.
Browse query parameters and results use a short-lived, admitted-user-scoped cache, and the browser preserves catalog scroll position so detail navigation and browser Back restore the recent browse state.

### 5.2 Search — P0

Search by card name with:

- normalized matching;
- prefix and fuzzy/trigram support;
- minimum useful query length;
- debounced requests;
- pagination;
- deterministic ordering.

No browser request may query Scryfall directly for ordinary search.

### 5.3 Filters — P0

Catalog and collection browsing share one validated filter-tree contract. Search is followed by compact quick filters for color identity, card type, set, rarity, and mana value; every active rule appears as an individually removable chip. Advanced filters open in a wide desktop panel or full-screen mobile sheet, with collapsible card, printing, and collection sections, a sticky apply footer, and Sort remaining in the results toolbar.

Categorical controls are searchable multi-selectors with explicit include/exclude and any/all/exact states where meaningful. Set options display symbol, full name, and code; language options display human-readable names; card color and color identity use accessible mana symbols. Type line is normalized into separate supertype, card-type, and subtype filters. Numeric controls cover mana value, power, toughness, and loyalty; nonnumeric P/T/L values are included only by an explicit option. Legality, artist, keyword, rules-text, rarity, finish, release date, digital/default-object scope, and supported ownership fields are available. Price-availability, currency, price-range, flavor-text, and raw query-language controls are not browse filters.

Normal mode compiles separate fields into an AND group. Logic mode supports AND/OR groups plus NOT on rules or groups, with at most two nested group levels. The server validates the same typed model and compiles it without interpolating values into raw SQL. The serialized tree is URL-addressable so refresh, sharing, and browser navigation preserve state. Quick and advanced controls edit the same state.

The advanced panel includes an unchecked **Return all variants** checkbox with the tooltip: "Select this to return all individual printings of a card. Leave this unchecked to only return one result per card."

Grid presentation is image-first. The browse surface omits import/freshness metadata and the explanatory Oracle-mode sentence. Hover and keyboard focus reveal the Oracle name above the image, compact nonfoil/foil prices below it, and folder-plus/list-plus actions for collection and deck entry. The image area links to card detail. Touch layouts keep the same information and actions available without hover.

Oracle-mode grid prices are the least expensive current nonfoil and foil observations across eligible printings after language and set filters. All-variants mode uses the exact printing's market observations. A selected set constrains both Oracle representatives and price floors to that set.

### 5.4 Oracle-card detail — P0

Show:

- name;
- mana cost;
- type line;
- oracle text;
- colors and color identity;
- legalities;
- keywords;
- related faces;
- printing selector;
- collection ownership summary across selected collection sources.

### 5.5 Printing detail — P0

Show:

- image(s);
- set and collector number;
- language;
- rarity;
- release date;
- finish availability;
- external source link;
- current price estimates by finish/currency;
- price provider;
- provider observation time;
- catalog ingestion time.

### 5.6 Price-display rules — P0

- Never render null as zero.
- Always label estimates.
- Always expose provider and observed time.
- If the latest observation is beyond the configured freshness threshold, show a stale indicator.
- Condition multipliers are not applied in the first release.

The compact browse-grid hover/focus summary is the deliberate exception to the provider/time presentation rule: it uses only the minimal Nonfoil/Foil labels and current amount. Full provenance and freshness remain on detail surfaces.

## 6. Collections and inventory

### 6.1 Collection management — P0

Users with appropriate workspace permission can:

- create a collection;
- rename it;
- edit description;
- choose a default cover printing;
- archive and restore it;
- soft-delete it;
- select it as a deck inventory source.

Private beta collections are private regardless of any future-facing visibility field.

### 6.2 Inventory views — P0

Provide:

- **Structured view** — compact rows optimized for editing;
- **Gallery view** — images with concise quantities and price;
- **Analytical view** — grouped totals by set, color, rarity, finish, condition, and value tier.

Every view uses the same underlying balances and filters.

### 6.3 Add inventory — P0

From catalog search or printing detail, the user can add:

- exact printing;
- finish;
- condition;
- quantity;
- optional note on the transaction.

The action creates an inventory transaction; it never mutates a balance without history.

### 6.4 Edit and remove — P0

Quantity changes create delta transactions. Removing a balance means applying a negative delta to zero, not deleting audit history.

The UI must prevent a quantity below zero and explain conflicts caused by stale client state.

### 6.5 Bulk actions — P1

- Multi-select rows/cards.
- Change condition.
- Change finish only when the target printing supports it.
- Move to another collection within the workspace using an atomic transfer transaction.
- Remove selected quantity.

### 6.6 Collection summary — P0

At minimum:

- total quantity;
- unique printing count;
- unique oracle-card count;
- estimated value by currency;
- unpriced quantity;
- finish and condition breakdown;
- latest inventory transaction time;
- latest price observation used.

### 6.7 Transaction history — P0

Show immutable history with:

- source;
- actor user or device;
- timestamp;
- line count;
- quantity deltas;
- idempotency/reference information where safe;
- reversal relationship.

Authorized users may create a reversal; they may not edit committed history.

### 6.8 CSV import — P1

Workflow:

1. upload a bounded CSV;
2. parse in a staged job;
3. resolve by Scryfall ID when present;
4. otherwise resolve by set code + collector number + language;
5. use name matching only for review suggestions;
6. show a preview with matched, ambiguous, and rejected rows;
7. require confirmation;
8. commit one idempotent inventory transaction;
9. provide a downloadable error report.

Ambiguous rows must never silently select a printing.

### 6.9 Export — P1

Export balances with stable identifiers and enough metadata to re-import:

- Scryfall printing ID;
- oracle ID;
- name;
- set code;
- collector number;
- language;
- finish;
- condition;
- quantity.

## 7. Deck building

### 7.1 Deck management — P0

Users can:

- create, rename, duplicate, archive, restore, and delete decks;
- choose a format;
- choose one or more collection inventory sources;
- choose a cover/preferred commander image;
- add notes and tags.

### 7.2 Deck editor — P0

The editor supports:

- catalog search within the editor;
- adding an oracle card to a zone;
- quantity changes;
- moving entries between zones;
- optional preferred printing;
- removal;
- compact list and visual grouping;
- immediate ownership and validation feedback.

Desktop drag-and-drop may be implemented, but every operation also has a click/tap control.

### 7.3 Ownership analysis — P0

For each entry show:

- required quantity;
- owned quantity across selected collection sources and all printings of the oracle card;
- missing quantity;
- preferred-printing quantity owned;
- estimated preferred-printing cost when priced.

### 7.4 Deck valuation — P0

Show:

- value of selected preferred printings;
- estimated acquisition value of missing preferred printings;
- unpriced entry count;
- price provider/freshness context.

### 7.5 Baseline validation — P0

Implement deterministic validation for supported formats using ingested legalities and configured format rules:

- card-count limits;
- copy limits;
- banned/not-legal cards;
- commander count;
- commander color identity;
- sideboard constraints where applicable.

Validation results are explanatory and advisory; the user may continue editing an invalid deck.

### 7.6 Import/export — P1

- Plain-text decklist import with review for unresolved cards.
- Plain-text export.
- Stable JSON export for future integrations.

### 7.7 Recommendations — Deferred

No EDHREC scraping, AI recommendations, automated optimization, synergy scoring, or meta analysis in the initial build.

## 8. Devices and third-party machines

### 8.1 Device registry — P1

Authorized workspace members can:

- register a device;
- name it;
- classify its type;
- view last-seen time and catalog version;
- rotate credentials;
- revoke credentials;
- suspend the device;
- delete it after revocation.

### 8.2 Credential issuance — P1

The raw credential is displayed exactly once. The UI requires explicit confirmation that the user has stored it.

### 8.3 Collection grants — P1

Grant per collection:

- inventory read;
- inventory write;
- run-summary write.

No implicit workspace-wide device access.

### 8.4 Inventory batch — P1

A device can post an atomic batch of printing-level deltas with:

- idempotency key;
- catalog snapshot version;
- collection ID;
- occurred time;
- line items;
- optional run reference.

The API returns the stored result. Replaying the identical request returns the same result. Reusing the key with a different body returns conflict.

### 8.5 Run summaries — P1

A device may post counts and result metadata. Cloud storage of motion plans, moves, sensor readings, and camera frames is prohibited by default.

### 8.6 Catalog distribution — P1

A device can fetch the latest compatible manifest and a short-lived download URL for an immutable SQLite snapshot.

## 9. Narrow administration

### 9.1 Invite administration — P0

Required as described above.

### 9.2 Catalog operations — P0/P1

Show:

- latest source-file metadata;
- latest successful import;
- active/failed import status;
- row counts;
- current snapshot version;
- manual sync trigger for platform administrators;
- failure summaries.

### 9.3 Security and usage health — P1

Show:

- recent denied device requests;
- external-service guard status;
- current feature kill switches;
- quota/budget counters;
- deployment links/instructions, not raw secrets.

## 10. Deferred product expansion

### Multi-user workspaces

Member invitation UI, ownership transfer, and activity feeds. The data model and RLS exist from the beginning.

### Store inventory operations

Locations, acquisition lots, cost basis, buylist intake, stock states, transfers, sales, fees, taxes, repricing, listing channels, and margin.

### Marketplace and trading

Inventory reservations, listings, orders, payments, shipping, trades, reputation, and disputes.

### Events and storefronts

Store pages, event advertising, tournament discovery, and registration.

### Mobile scanning

Phone camera capture uses the same catalog identity and inventory transaction contracts.

### Subscription and hardware entitlements

Plans, features, seats, hardware-bundled premium periods, and annual renewals.

### Other games and non-TCG inventory

Require a separate catalog/identity mapping rather than adding arbitrary game-specific columns to MTG tables.

---

<!-- SOURCE: 04 - Greenfield System Architecture.md -->

# 04 — Greenfield System Architecture

Version: 1.0.0  
Status: Locked

## 1. Selected stack

### Web application

- Next.js App Router, current stable release at implementation time
- React and TypeScript
- Vercel deployment and preview environments
- CSS Modules plus shared token/global class files
- Supabase SSR client integration
- Server Components for initial reads where appropriate
- Server Actions for authenticated human mutations
- Versioned Route Handlers for machine/external API endpoints

### Data and identity

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage for private imports and immutable catalog artifacts
- PostgreSQL Row Level Security
- PostgreSQL functions for atomic multi-row invariants

### Catalog pipeline

- Python 3.13 worker/CLI
- `pyproject.toml` with locked dependencies
- streaming JSON parsing
- direct PostgreSQL connection or trusted Supabase service client
- GitHub Actions as the initial scheduler/executor

### Robot

- Separate repository and deployable system
- the platform repository must never delete, rewrite, or absorb active robot implementation work
- local SQLite runtime database
- read-only/versioned catalog SQLite snapshot
- offline outbox for cloud updates
- device credential and versioned API client

## 2. Architecture diagram

```text
Anonymous browser
  └─ static landing / login / invite callback only

Admitted browser
  └─ Next.js on Vercel
       ├─ Server Components and Server Actions
       ├─ Supabase Auth session cookies
       ├─ RLS-bound Supabase server client
       └─ /api/v1 device and integration routes

Supabase
  ├─ Auth: human identity and sessions
  ├─ Postgres: admission, workspaces, catalog, inventory, decks, devices
  ├─ RLS: tenant/resource isolation
  ├─ Functions: atomic inventory, admission, ownership calculations
  └─ Storage: private imports and immutable robot catalog artifacts

Catalog worker
  ├─ Scryfall bulk and set metadata
  ├─ staging + validation + promotion
  ├─ current price observations
  └─ SQLite snapshot generation

Robot / approved machine
  ├─ local identification and execution
  ├─ snapshot download and atomic swap
  ├─ offline queue
  └─ idempotent inventory and run-summary uploads
```

## 3. Why this architecture

### Next.js instead of a standalone SPA

The App Router supplies layouts, server rendering, server-side session handling, and co-located route handlers without requiring a separate browser API for every feature. Vercel is the intended host, so this is the lowest-friction greenfield path.

### No custom always-on cloud API in the first build

The stable external contract is more important than the first implementation language. Route Handlers implement `/api/v1` while PostgreSQL functions own transactional behavior. A future FastAPI service can replace those handlers without changing device payloads or database invariants.

### PostgreSQL instead of MongoDB

Talence has strong relational identities and invariants: workspaces, memberships, printing-based balances, immutable transaction lines, decks, device grants, and idempotency. PostgreSQL constraints, transactions, indexes, and RLS are a natural fit.

### Separate Python catalog worker

Large Scryfall files should not be downloaded or transformed in a user request. A deployment-neutral worker can run in CI initially and move to a durable job host later without changing the web app.

### Robot separation

Hardware execution has different reliability, safety, offline, and deployment requirements. Sharing a database or lifecycle with the web app would couple unrelated failure modes.

## 4. Repository layout

The new platform repository should be:

```text
/
├─ apps/
│  └─ web/
│     ├─ app/
│     ├─ components/
│     ├─ features/
│     ├─ lib/
│     ├─ styles/
│     ├─ tests/
│     └─ package.json
├─ packages/
│  ├─ domain/                 # shared TypeScript domain types and validators
│  ├─ ui/                     # reusable Talence primitives
│  └─ contracts/              # OpenAPI/JSON Schema and generated clients
├─ services/
│  └─ catalog-worker/
│     ├─ src/
│     ├─ tests/
│     ├─ fixtures/
│     └─ pyproject.toml
├─ supabase/
│  ├─ migrations/
│  ├─ tests/
│  ├─ seed.sql
│  └─ config.toml
├─ docs/
│  ├─ canonical/
│  └─ dev-logs/
├─ scripts/
│  ├─ invite-user.ts
│  ├─ revoke-invite.ts
│  └─ bootstrap-admin.ts
├─ .github/workflows/
│  ├─ ci.yml
│  ├─ preview.yml
│  └─ catalog-sync.yml
├─ AGENTS.md
├─ package.json               # npm workspaces and orchestration scripts
├─ package-lock.json
└─ README.md
```

Do not add Turborepo, Nx, or another orchestration layer until build performance proves it necessary.

## 5. Application boundaries

### Browser-safe code

May contain:

- Supabase project URL;
- publishable key;
- public static configuration;
- user session access through approved helpers.

May not contain:

- Supabase secret/service key;
- direct database password;
- device credential digest logic requiring a server secret;
- catalog worker secrets;
- third-party provider secrets.

### Trusted web server code

Owns:

- invite issuance;
- admin operations;
- device credential creation and verification;
- versioned device API routes;
- external-service adapters;
- signed artifact URLs;
- operations requiring elevated database access.

### PostgreSQL functions

Own atomic operations such as:

- finalizing admission;
- applying inventory transactions;
- transferring inventory;
- reversing a transaction;
- calculating deck ownership;
- validating idempotent device batches.

Security-definer functions must use a fixed search path, minimal grants, and explicit authorization.

### Catalog worker

Owns:

- provider downloads;
- file integrity;
- staging and normalization;
- catalog promotion;
- price observation replacement;
- search-vector refresh;
- snapshot generation and upload.

## 6. Data-access standard

- Server Components perform initial reads with the authenticated user's RLS-bound Supabase client.
- Client Components are used only for interactive behavior that requires browser state.
- Human mutations use Server Actions or same-origin route handlers and user-bound authorization.
- Client code does not use a privileged Supabase client.
- Device routes use explicit credential authorization and call narrowly scoped database functions.
- Direct table access is avoided when a multi-row invariant is involved.

## 7. State management

- URL search parameters are canonical for catalog filters, sorting, and pagination.
- Server state is fetched and invalidated through Next.js server mechanisms and a small query layer where interactive screens need it.
- Local component state handles transient UI.
- A global client-state library is not required initially.
- Do not introduce Redux, Zustand, or equivalent merely for convenience.

## 8. Styling architecture

- `styles/tokens.css` defines colors, spacing, typography, radii, and breakpoints.
- `styles/globals.css` defines reset and application shell behavior.
- Shared primitives own reusable CSS Modules.
- Feature components use co-located CSS Modules.
- Reusable semantic classes are preferred over repeated declarations.
- Inline styles are prohibited except for genuinely dynamic CSS custom properties that cannot be represented by a class.
- Tailwind and utility-class walls are prohibited.

## 9. Deployment model

### Vercel

- One project for `apps/web`.
- Preview deployment for every pull request.
- Function region selected close to the Supabase database region.
- WAF rate limits on auth-adjacent and `/api/v1` routes.
- Spend Management configured before public exposure.

### Supabase

- Separate development and production projects when practical.
- Local Supabase CLI stack for migrations and RLS tests.
- Spend Cap enabled on supported paid-plan usage items.
- No exposed table without explicit RLS review.

### Catalog worker

Initial execution:

- manual workflow dispatch;
- scheduled GitHub Action after the pipeline is proven;
- no catalog import inside a web request.

## 10. Failure behavior

- Failed catalog import leaves the previous successful catalog active.
- Failed snapshot generation leaves the previous compatible snapshot downloadable.
- Device retry does not duplicate inventory.
- Browser mutation errors return a normalized error code and actionable message.
- External metered-service failure degrades the feature without corrupting canonical data.
- The web app may be unavailable without affecting an active robot run.

---

<!-- SOURCE: 05 - Identity Invites Workspaces and Authorization.md -->

# 05 — Identity, Invites, Workspaces, and Authorization

Version: 1.0.0  
Status: Locked

## 1. Authentication decision

Supabase Auth manages human credentials, email confirmation, password recovery, session issuance, refresh, and revocation.

Talence does not implement:

- password hashing;
- password storage;
- email verification tokens;
- refresh-token rotation;
- OAuth callback cryptography;
- MFA internals.

Talence does implement admission, profile state, workspace membership, resource authorization, and device credentials.

## 2. Private-beta admission gate

### 2.1 Public signup is disabled

There is no `/register` page and application code must never call a public sign-up method. Production sign-in and password-recovery forms use configured CAPTCHA/bot protection; invitation issuance is the only account-creation path.

New humans are created only through a trusted administrative invite flow.

### 2.2 Private invited-user ledger

The table `app_private.invited_users` is the canonical admission list.

Required fields:

- `id`
- `email` as case-insensitive normalized email
- `status`: `draft | sent | accepted | revoked | expired | failed`
- `invited_by_user_id`
- `auth_user_id` nullable until Supabase returns/links it
- `expires_at`
- `sent_at`
- `accepted_at`
- `revoked_at`
- `last_error_code`
- `note`
- timestamps

It is not exposed through the Supabase Data API. Only narrow trusted functions and server code may access it.

### 2.3 Before-user-created auth hook

A PostgreSQL Supabase **Before User Created** hook must:

1. read the incoming normalized email;
2. find one matching invited-user row in `draft` or `sent` state;
3. require `expires_at > now()` and `revoked_at is null`;
4. allow creation only when the invitation is valid;
5. reject all other user creation attempts;
6. record no secrets in logs.

The hook function is executable by `supabase_auth_admin` only and is revoked from `anon`, `authenticated`, and `public`.

### 2.4 Invite issuance sequence

Trusted server action or CLI:

1. normalize and validate the email;
2. create or reactivate the invited-user row;
3. call Supabase Auth Admin `inviteUserByEmail` with:
   - redirect to the Talence auth callback;
   - `invited_user_id` in server-controlled user metadata;
4. store the returned auth-user ID;
5. mark the invitation `sent`;
6. on failure, mark `failed` with a safe error code.

The Supabase secret key is never sent to the browser.

### 2.5 Invite acceptance and admission finalization

After the invitation link establishes a valid Supabase session, the auth callback calls one idempotent database function, `finalize_admitted_user()`.

The function must:

1. derive `auth.uid()` and verified email from the session, not client input;
2. lock the matching invited-user row;
3. verify email, metadata linkage, status, expiration, and revocation;
4. mark the invitation `accepted` and link `auth_user_id`;
5. create or reactivate the profile;
6. create a personal workspace if none exists;
7. create an owner membership;
8. create a default MTG collection;
9. return the canonical profile/workspace/collection IDs;
10. commit all changes atomically.

If called again by the same valid user, it returns the existing resources without duplication.

### 2.6 Ongoing admission check

An authenticated Supabase session alone is insufficient.

Application middleware/server guards and RLS helper functions require:

- active profile;
- accepted invited-user record linked to the auth user;
- no profile suspension or platform ban.

A revoked unaccepted invite prevents account creation. Suspending an accepted user disables application access without deleting audit history.

## 3. Profiles

Profiles contain application-facing state only:

- auth user ID;
- admission invite ID;
- unique handle;
- display name;
- avatar path;
- preferred currency;
- status: `active | suspended | deletion_requested | deleted`;
- timestamps.

Email remains authoritative in Supabase Auth and is not treated as a public profile field.

## 4. Workspaces

### 4.1 Ownership model

Every mutable product resource references `workspace_id`.

A personal workspace is created for each admitted user. The initial UI may make it feel like “my account” while preserving the workspace boundary.

### 4.2 Fixed initial roles

| Capability | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| Read workspace resources | Yes | Yes | Yes | Yes |
| Create/edit collections and decks | Yes | Yes | Yes | No |
| Apply inventory changes | Yes | Yes | Yes | No |
| Manage devices and grants | Yes | Yes | No | No |
| Invite/remove ordinary members | Yes | Yes | No | No |
| Change member roles | Yes | Yes, except owner | No | No |
| Transfer/delete workspace | Yes | No | No | No |

Do not implement user-defined roles in the first release.

### 4.3 Membership invariants

- One membership per user/workspace.
- At least one active owner per active workspace.
- The final owner cannot leave or be removed.
- Suspended memberships have no resource access.
- Resource ownership is the workspace, not the creating user.

## 5. Workspace invitations

`workspace_invitations` is separate from global admission.

Fields include:

- workspace;
- invited email;
- intended role;
- inviter;
- status;
- expiration;
- accepted user;
- timestamps.

For an email without an admitted Talence account, accepting a workspace invitation also requires a valid global `invited_users` record. Administrative tooling may create both records in one workflow, but the concepts remain separate.

## 6. Row Level Security

### 6.1 Default deny

RLS is enabled on every table in an exposed schema. No policy means no access.

### 6.2 Catalog

Admitted authenticated users may read active catalog, set, face, legality, and current-price rows. Human users cannot insert, update, or delete catalog rows.

### 6.3 Workspace resources

Policies use indexed membership checks. The user's role must allow the operation and the row's `workspace_id` must match the membership.

### 6.4 Inventory history

- Viewers may read balances and transactions.
- Editors may call approved inventory functions.
- No client may directly update immutable transaction rows.
- Direct balance writes are denied; balances change only through functions.

### 6.5 Devices

Human device administration follows workspace roles. Device requests do not use human RLS sessions; trusted server routes validate the device and invoke narrow functions.

### 6.6 Private/admin tables

`app_private.invited_users`, credential digests, internal usage guard data, and raw operational details are not exposed to ordinary Data API roles.

## 7. Server-side authorization

RLS is necessary but not sufficient for privileged workflows.

Server code must explicitly verify:

- active admission;
- workspace membership and role;
- resource-workspace relationship;
- device grant;
- idempotency body hash;
- feature/quota availability.

The Supabase secret key bypasses ordinary RLS and therefore may be used only after these checks or through a function that performs them.

## 8. Platform administration

Platform administration is separate from workspace ownership.

Use a small `platform_user_roles` table with initial role `platform_admin`. Do not rely on user-editable metadata.

Platform administrators may:

- issue/revoke global invitations;
- view catalog operation status;
- suspend users;
- inspect safe operational failures;
- manage global feature guardrails.

They do not automatically become members of every workspace. Emergency support access, if ever introduced, requires explicit audited impersonation/support design.

## 9. Account and workspace deletion

- Deleting an auth identity is not the first step.
- Shared workspace ownership must be transferred or the workspace deliberately deleted.
- Immutable audit records retain a stable actor ID or anonymized reference as required.
- Personal workspace data may enter a deletion-request state and be purged after a documented retention period.
- Device credentials are revoked before workspace purge.

---

<!-- SOURCE: 06 - Database Domain Model.md -->

# 06 — Database Domain Model

Version: 1.0.0  
Status: Locked logical contract

## 1. Database standard

- PostgreSQL through Supabase.
- UUID primary keys unless a provider supplies a stable UUID used directly by canon.
- `timestamptz` in UTC for all instants.
- `citext` or an equivalent normalized-email strategy for email uniqueness.
- Money/price amounts use `numeric`, never binary floating point.
- Mutable rows have `created_at` and `updated_at`.
- Foreign keys and uniqueness constraints enforce domain identity.
- Every foreign-key column used in authorization or joins is indexed.
- Exposed tables use RLS with default deny.
- Immutable event/history rows are append-only to ordinary clients.

## 2. Schema boundaries

### `public`

RLS-protected application and catalog data intended for authenticated application access.

### `app_private`

Not exposed through the Data API. Contains:

- invited-user admission ledger;
- device credential digests;
- internal idempotency payload hashes;
- metered-service policy/counter internals;
- worker coordination details where exposure is unnecessary.

### `app_api`

Optional non-exposed schema for narrowly granted security-definer functions and stable views/RPC functions.

## 3. Enumerated domains

Implementation may use PostgreSQL enums or checked text types. Values are canonical.

- `invite_status`: `draft`, `sent`, `accepted`, `revoked`, `expired`, `failed`
- `profile_status`: `active`, `suspended`, `deletion_requested`, `deleted`
- `workspace_type`: `personal`, `team`, `store`
- `membership_role`: `owner`, `admin`, `editor`, `viewer`
- `membership_status`: `active`, `suspended`
- `resource_status`: `active`, `archived`, `deleted`
- `visibility`: `private`, `unlisted`, `public`
- `card_finish`: `unknown`, `nonfoil`, `foil`, `etched`
- `card_condition`: `unknown`, `near_mint`, `lightly_played`, `moderately_played`, `heavily_played`, `damaged`
- `inventory_source`: `manual`, `csv_import`, `device`, `transfer`, `reversal`, `admin_correction`
- `deck_zone`: `mainboard`, `sideboard`, `commander`, `companion`, `maybeboard`
- `device_status`: `active`, `suspended`, `revoked`
- `device_type`: `talence_sorter`, `scanner`, `kiosk`, `third_party`
- `grant_permission`: `inventory_read`, `inventory_write`, `run_summary_write`
- `job_status`: `queued`, `running`, `succeeded`, `failed`, `cancelled`

Private beta does not create anonymous policies for `unlisted` or `public`; those values are reserved for later activation.

## 4. Admission and identity tables

### `app_private.invited_users`

Purpose: global private-beta admission ledger.

Fields:

- `id uuid primary key`
- `email citext not null`
- `status invite_status not null`
- `invited_by_user_id uuid null references auth.users`
- `auth_user_id uuid null references auth.users`
- `expires_at timestamptz not null`
- `sent_at timestamptz null`
- `accepted_at timestamptz null`
- `revoked_at timestamptz null`
- `last_error_code text null`
- `note text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints/indexes:

- one non-terminal invitation per normalized email;
- accepted row must have `auth_user_id` and `accepted_at`;
- revoked row must have `revoked_at`;
- index on `email` and `auth_user_id`.

### `profiles`

Purpose: application-facing human record.

Fields:

- `user_id uuid primary key references auth.users on delete restrict`
- `admission_invite_id uuid unique not null`
- `handle citext unique null` until acceptance completion
- `display_name text null`
- `avatar_path text null`
- `preferred_currency text not null default 'USD'`
- `status profile_status not null default 'active'`
- `default_workspace_id uuid null`
- `default_collection_id uuid null`
- timestamps

Rules:

- admission invite must be accepted and linked to the same auth user;
- profile is created only through admission finalization;
- ordinary clients cannot change `status`, admission linkage, or defaults to inaccessible resources.

### `platform_user_roles`

Fields:

- `user_id uuid`
- `role text` initially only `platform_admin`
- `granted_by_user_id uuid null`
- `created_at`

Primary key: `(user_id, role)`.

## 5. Workspace tables

### `workspaces`

Fields:

- `id uuid primary key`
- `type workspace_type not null`
- `name text not null`
- `slug citext not null`
- `status resource_status not null default 'active'`
- `created_by_user_id uuid not null`
- `archived_at timestamptz null`
- `deleted_at timestamptz null`
- timestamps

Constraints:

- unique active slug within the owner's namespace or globally according to implementation route design; initial recommendation is global unique slug for simpler workspace routes;
- a personal workspace may not be reassigned to another primary user without an explicit migration.

### `workspace_memberships`

Fields:

- `workspace_id uuid`
- `user_id uuid`
- `role membership_role`
- `status membership_status`
- `joined_at timestamptz`
- `created_by_user_id uuid`
- timestamps

Primary key: `(workspace_id, user_id)`.

Rules:

- at least one active owner per active workspace;
- only owners may transfer owner role;
- final-owner removal blocked transactionally.

### `workspace_invitations`

Fields:

- `id uuid primary key`
- `workspace_id uuid not null`
- `email citext not null`
- `role membership_role not null` excluding owner by default
- `status invite_status not null`
- `invited_by_user_id uuid not null`
- `accepted_by_user_id uuid null`
- `expires_at timestamptz not null`
- `accepted_at`, `revoked_at`, timestamps

Unique one active invitation per workspace/email.

### `user_preferences`

Fields:

- `user_id uuid primary key`
- `catalog_view text` defaulting to `grid` for new preference rows
- `collection_view text`
- `deck_view text`
- `compact_mode boolean`
- `preferences jsonb not null default '{}'`
- timestamps

JSON is limited to low-risk presentation preferences, not authorization or canonical business state.

## 6. Catalog tables

### `games`

Fields:

- `id uuid primary key`
- `code citext unique not null` (`mtg` initially)
- `name text not null`
- `publisher text null`
- `active boolean not null`
- `metadata jsonb not null default '{}'`
- timestamps

### `catalog_sets`

Fields:

- `id uuid primary key` (Scryfall set UUID for MTG)
- `game_id uuid not null`
- `source_provider text not null`
- `source_id text not null`
- `code citext not null`
- `name text not null`
- `set_type text null`
- `released_at date null`
- `parent_set_id uuid null`
- `card_count integer null`
- `digital boolean not null`
- `foil_only boolean not null default false`
- `nonfoil_only boolean not null default false`
- `icon_svg_uri text null`
- `source_updated_at timestamptz null`
- `active boolean not null default true`
- timestamps

Unique:

- `(source_provider, source_id)`
- `(game_id, code)`

### `catalog_cards`

Purpose: oracle-level identity.

Fields:

- `id uuid primary key` (Scryfall oracle UUID when present)
- `game_id uuid not null`
- `source_provider text not null`
- `source_id text not null`
- `name text not null`
- `normalized_name text not null`
- `mana_cost text null`
- `mana_value numeric null`
- `type_line text null`
- `oracle_text text null`
- `colors text[] not null default '{}'`
- `color_identity text[] not null default '{}'`
- `keywords text[] not null default '{}'`
- `supertypes text[] not null default '{}'`
- `card_types text[] not null default '{}'`
- `subtypes text[] not null default '{}'`
- `reserved boolean not null default false`
- `search_document tsvector`
- `active boolean not null default true`
- `source_updated_at timestamptz null`
- timestamps

Indexes:

- GIN on `search_document`;
- trigram index on normalized name;
- GIN on colors/color identity/keywords where useful;
- mana value and type filters.

### `catalog_printings`

Fields:

- `id uuid primary key` (Scryfall card UUID for MTG)
- `game_id uuid not null`
- `card_id uuid null` for non-oracle objects where required
- `set_id uuid not null`
- `source_provider text not null`
- `source_id text not null`
- `collector_number text not null`
- `language text not null`
- `printed_name text null`
- `rarity text null`
- `layout text null`
- `released_at date null`
- `digital boolean not null`
- `promo boolean not null default false`
- `oversized boolean not null default false`
- `variation boolean not null default false`
- `finishes card_finish[] not null`
- `frame_effects text[] not null default '{}'`
- `border_color text null`
- `artist text null`
- `artists text[] not null default '{}'` (distinct printing and face artists)
- `scryfall_uri text null`
- `image_status text null`
- `is_default_browse boolean not null`
- `active boolean not null default true`
- `source_updated_at timestamptz null`
- timestamps

Unique/indexes:

- `(source_provider, source_id)`;
- `(set_id, collector_number, language, source_id)`;
- indexes on card, set, language, rarity, release date, digital/default browse.

### `catalog_faces`

Fields:

- `id uuid primary key`
- `printing_id uuid not null`
- `face_index smallint not null`
- `name text not null`
- `mana_cost text null`
- `type_line text null`
- `oracle_text text null`
- `colors text[] not null default '{}'`
- `power text null`
- `power_numeric numeric null`
- `toughness text null`
- `toughness_numeric numeric null`
- `loyalty text null`
- `loyalty_numeric numeric null`
- `supertypes text[] not null default '{}'`
- `card_types text[] not null default '{}'`
- `subtypes text[] not null default '{}'`
- `defense text null`
- `artist text null`
- `image_small_uri text null`
- `image_normal_uri text null`
- `image_large_uri text null`
- `image_png_uri text null`
- `art_crop_uri text null`
- `border_crop_uri text null`
- timestamps

Unique `(printing_id, face_index)`.

### `catalog_legalities`

Fields:

- `card_id uuid`
- `format_code text`
- `legality text` (`legal`, `not_legal`, `restricted`, `banned`)
- `source_updated_at`

Primary key `(card_id, format_code)`.

### `catalog_external_ids`

Fields:

- `entity_type text` (`card`, `printing`, `set`)
- `entity_id uuid`
- `provider text`
- `identifier_type text`
- `identifier_value text`

Unique `(provider, identifier_type, identifier_value)` where identifiers are globally unique.

## 7. Price tables

### `current_prices`

Fields:

- `printing_id uuid`
- `provider text`
- `currency text`
- `finish card_finish`
- `amount numeric(14,4) null`
- `observed_at timestamptz not null`
- `ingested_at timestamptz not null`
- `source_file_id uuid null`
- `stale_after timestamptz null`

Primary key `(printing_id, provider, currency, finish)`.

Rules:

- null prices are not inserted as zero;
- replacing current observation is worker-only;
- first release does not maintain full price history;
- price-history extension is separate.

### `price_refresh_summaries`

Optional maintained summaries by provider/currency for operational freshness display.

## 8. Catalog operations tables

### `catalog_source_files`

Fields:

- `id uuid primary key`
- `provider text`
- `source_type text`
- `provider_object_id text`
- `provider_updated_at timestamptz`
- `download_uri text`
- `content_type text`
- `content_encoding text null`
- `compressed_size bigint null`
- `downloaded_size bigint null`
- `sha256 text null`
- `downloaded_at timestamptz null`
- `status job_status`
- timestamps

### `catalog_import_runs`

Fields:

- `id uuid primary key`
- `source_file_id uuid`
- `status job_status`
- `trigger_type text`
- `started_at`, `completed_at`
- `records_seen`, `records_written`, `records_rejected`
- `sets_written`, `cards_written`, `printings_written`, `faces_written`, `prices_written`
- `error_code`, `error_summary`
- `worker_version`
- timestamps

### `catalog_state`

Singleton/keyed state:

- active import ID;
- active catalog version;
- last successful source observation time;
- current search index version;
- current robot snapshot ID.

### Staging tables

The worker may use unexposed staging tables keyed by import run. Staging rows are never treated as current catalog truth until promotion succeeds.

## 9. Collection and inventory tables

### `collections`

Fields:

- `id uuid primary key`
- `workspace_id uuid not null`
- `game_id uuid not null`
- `name text not null`
- `slug citext not null`
- `description text null`
- `cover_printing_id uuid null`
- `visibility visibility not null default 'private'`
- `status resource_status not null default 'active'`
- `created_by_user_id uuid not null`
- `archived_at`, `deleted_at`
- timestamps

Unique `(workspace_id, slug)` for non-deleted rows.

### `inventory_balances`

Fields:

- `collection_id uuid`
- `printing_id uuid`
- `finish card_finish`
- `condition card_condition`
- `quantity integer not null`
- `updated_at timestamptz not null`
- `last_transaction_id uuid not null`

Primary key `(collection_id, printing_id, finish, condition)`.

Checks:

- quantity >= 0;
- finish must be supported by printing unless `unknown` is allowed for unresolved legacy import.

Ordinary clients cannot write this table directly.

### `inventory_transactions`

Fields:

- `id uuid primary key`
- `workspace_id uuid not null`
- `collection_id uuid not null`
- `source inventory_source not null`
- `actor_user_id uuid null`
- `device_id uuid null`
- `import_job_id uuid null`
- `idempotency_key text null`
- `request_hash text null` stored privately or server-only
- `external_reference text null`
- `reverses_transaction_id uuid null`
- `occurred_at timestamptz not null`
- `committed_at timestamptz not null`
- `note text null`
- `metadata jsonb not null default '{}'`

Rules:

- exactly one appropriate actor/source relationship;
- unique `(source scope, idempotency_key)` when key supplied;
- immutable after commit;
- a reversal points to an earlier transaction and has opposite deltas.

### `inventory_transaction_lines`

Fields:

- `id uuid primary key`
- `transaction_id uuid not null`
- `line_number integer not null`
- `printing_id uuid not null`
- `finish card_finish not null`
- `condition card_condition not null`
- `quantity_delta integer not null`
- `quantity_before integer not null`
- `quantity_after integer not null`

Unique `(transaction_id, line_number)`.

Checks:

- delta != 0;
- after = before + delta;
- after >= 0.

### `inventory_import_jobs`

Fields:

- `id uuid primary key`
- `workspace_id`, `collection_id`
- `created_by_user_id`
- `storage_path`
- `original_filename`
- `parser_version`
- `status job_status`
- row counts by matched/ambiguous/rejected/committed
- `committed_transaction_id uuid null`
- `error_report_path text null`
- timestamps

### `inventory_import_rows`

Staged bounded rows with:

- raw source row number/data;
- proposed printing ID;
- resolution strategy;
- status;
- normalized finish/condition/quantity;
- error code/message.

Rows are purged according to retention policy after commit or cancellation.

## 10. Deck tables

### `deck_formats`

System-written format configuration:

- `code primary key`
- name;
- minimum/maximum main deck;
- sideboard maximum;
- default copy limit;
- commander count rules;
- color-identity enforcement;
- active;
- rules version and metadata.

### `decks`

Fields:

- `id uuid primary key`
- `workspace_id uuid not null`
- `game_id uuid not null`
- `format_code text not null`
- `name text not null`
- `slug citext not null`
- `description text null`
- `cover_printing_id uuid null`
- `visibility visibility not null default 'private'`
- `status resource_status not null default 'active'`
- `created_by_user_id uuid not null`
- timestamps and archive/delete instants

Unique `(workspace_id, slug)` for non-deleted rows.

### `deck_entries`

Fields:

- `id uuid primary key`
- `deck_id uuid not null`
- `card_id uuid not null`
- `zone deck_zone not null`
- `quantity integer not null`
- `preferred_printing_id uuid null`
- `sort_order integer not null default 0`
- `notes text null`
- timestamps

Unique recommended `(deck_id, card_id, zone)`.

Checks quantity > 0.

### `deck_inventory_sources`

Fields:

- `deck_id uuid`
- `collection_id uuid`
- `priority smallint`

Primary key `(deck_id, collection_id)`.

Both resources must belong to the same workspace.

### `deck_validation_runs` — optional cache

Store latest result by deck content hash and rules version, or calculate on demand. Validation results are derived and may be replaced.

## 11. Device and integration tables

### `devices`

Fields:

- `id uuid primary key`
- `workspace_id uuid not null`
- `name text not null`
- `type device_type not null`
- `manufacturer text null`
- `model text null`
- `serial_number text null`
- `status device_status not null`
- `last_seen_at timestamptz null`
- `last_catalog_snapshot_id uuid null`
- `created_by_user_id uuid not null`
- timestamps

Unique serial within manufacturer when supplied.

### `app_private.device_credentials`

Fields:

- `id uuid primary key`
- `device_id uuid not null`
- `prefix text unique not null`
- `secret_digest text not null`
- `created_by_user_id uuid not null`
- `created_at`
- `expires_at null`
- `last_used_at null`
- `revoked_at null`

Raw secrets are never stored.

### `device_collection_grants`

Fields:

- `device_id uuid`
- `collection_id uuid`
- `permission grant_permission`
- `granted_by_user_id uuid`
- `created_at`

Primary key `(device_id, collection_id, permission)`.

Device and collection must share workspace.

### `device_sync_batches`

Fields:

- `id uuid primary key`
- `device_id uuid not null`
- `collection_id uuid not null`
- `idempotency_key text not null`
- `request_hash text not null`
- `catalog_snapshot_version text null`
- `occurred_at timestamptz not null`
- `received_at timestamptz not null`
- `status text not null`
- `inventory_transaction_id uuid null`
- `run_external_id text null`
- `response_code text null`

Unique `(device_id, idempotency_key)`.

### `device_run_summaries`

Fields:

- `id uuid primary key`
- `device_id`, `collection_id`
- `external_run_id text`
- `status text`
- `catalog_snapshot_version text null`
- counts: total, recognized, unrecognized, posted
- `started_at`, `completed_at`, `received_at`
- `diagnostic_code text null`
- `metadata jsonb` bounded and validated

Unique `(device_id, external_run_id)`.

## 12. Robot catalog artifact tables

### `catalog_snapshots`

Fields:

- `id uuid primary key`
- `version text unique not null`
- `catalog_import_id uuid not null`
- `schema_version integer not null`
- `status job_status not null`
- `storage_path text null`
- `sha256 text null`
- `byte_size bigint null`
- `record_counts jsonb not null`
- `minimum_client_version text null`
- `generated_at timestamptz null`
- `published_at timestamptz null`
- `superseded_at timestamptz null`
- timestamps

Published snapshots are immutable.

## 13. Cost-control and operational tables

### `app_private.external_service_policies`

Fields:

- `service_key text primary key`
- `enabled boolean`
- `global_daily_units integer null`
- `per_user_daily_units integer null`
- `per_workspace_daily_units integer null`
- `per_device_daily_units integer null`
- `updated_by_user_id uuid null`
- timestamps

### `app_private.external_service_usage_daily`

Aggregated key:

- usage date;
- service key;
- user/workspace/device nullable dimensions;
- units consumed;
- request count.

An atomic function must check policy and increment before a metered external call.

### `audit_events`

Safe application audit events for admin/security operations:

- actor;
- event type;
- workspace/resource references;
- correlation ID;
- safe metadata;
- timestamp.

No raw secrets, auth headers, card-image payloads, or full import files.

## 14. Required database functions

Exact SQL is implementation-owned, but behavior is canonical.

- `finalize_admitted_user()`
- `is_admitted_user(user_id)`
- `has_workspace_role(workspace_id, minimum_role)` or explicit capability helpers
- `apply_inventory_transaction(...)`
- `transfer_inventory(...)`
- `reverse_inventory_transaction(transaction_id, ...)`
- `apply_device_inventory_batch(...)`
- `calculate_collection_summary(collection_id)`
- `calculate_deck_ownership(deck_id)`
- `validate_deck(deck_id)`
- `consume_external_service_quota(...)`
- owner-transfer/final-owner-safe membership functions

## 15. Required integrity tests

- uninvited auth user cannot provision/access;
- admission finalization is idempotent;
- cross-workspace access denied;
- final owner cannot be removed;
- inventory cannot become negative;
- identical idempotency replay returns existing transaction;
- conflicting replay is rejected;
- direct balance/history writes denied;
- deck source collection must share workspace;
- device grant cannot cross workspace;
- catalog writes denied to human roles;
- failed catalog promotion does not alter active state;
- published snapshot metadata is immutable.

---

<!-- SOURCE: 07 - Catalog Pricing and Robot Snapshot Pipeline.md -->

# 07 — Catalog, Pricing, and Robot Snapshot Pipeline

Version: 1.0.0  
Status: Locked

## 1. Provider and ownership

Scryfall is the initial source for MTG catalog metadata, legalities, image references, and general price estimates.

Talence owns its normalized database representation and import/snapshot history. Talence does not claim ownership of Magic intellectual property or provider data.

All provider access is server/worker-side. Ordinary catalog search and card detail read Talence's database, not the live Scryfall API.

## 2. Source selection

### Primary bulk source

Use Scryfall `all_cards` to preserve every language-specific printing available in the provider catalog. This best supports complete collection tracking and physical-card identification.

The web's default browse predicate emphasizes:

- `digital = false`;
- active records;
- ordinary physical-size printings where applicable;
- English or the user's selected language.

Users may explicitly broaden filters to tokens, emblems, oversized objects, funny cards, or digital printings when those records exist.

### Set metadata

Use the Scryfall sets endpoint/source to retain authoritative set metadata and symbol URI references.

### Optional supporting sources

Rulings may be added later. They are not required for the first build.

## 3. Provider-request rules

The worker must:

- use HTTPS;
- send a descriptive `User-Agent` containing Talence and a contact/reference URL;
- send an appropriate `Accept` header;
- use bulk downloads for catalog-scale work;
- remain below Scryfall API request guidance for metadata requests;
- use bounded exponential backoff for transient failures;
- never retry a permanent provider rejection in a tight loop;
- record provider metadata and update timestamps.

## 4. Import lifecycle

### 4.1 Discover

1. Fetch bulk metadata.
2. Select the required source type.
3. Compare provider object ID/update timestamp/checksum metadata with the latest successful import.
4. Exit successfully without work when the source is unchanged unless a forced import is requested.

### 4.2 Download

1. Download to a temporary file outside web-request execution.
2. Stream bytes to disk while calculating SHA-256.
3. Enforce a configurable maximum expected size.
4. Record size, content type, encoding, provider update time, and checksum.
5. Never load the entire source into memory.

### 4.3 Parse and normalize

Use streaming JSON parsing and bounded batches.

For each card object:

- upsert set identity;
- resolve or create oracle-card identity;
- upsert printing identity;
- replace ordered face rows;
- replace legalities for the oracle card;
- replace external identifiers;
- derive normalized search fields;
- map current price observations by currency and finish;
- retain only bounded raw/provider metadata needed for diagnostics.

Provider-specific fields that do not deserve first-class columns may live in a bounded `source_metadata` JSON object. Authorization and critical invariants may not depend on that object.

### 4.4 Stage

Writes land in import-scoped staging tables or an equivalent isolated namespace.

The active catalog remains readable throughout staging.

### 4.5 Validate

Before promotion, require:

- nonzero set/card/printing counts;
- required ID uniqueness;
- valid printing-to-set relationships;
- valid printing-to-card relationships where oracle identity exists;
- deterministic face ordering;
- accepted enum/value mappings;
- price rows with valid currency/finish keys;
- rejection counts below a configured threshold;
- search-index generation success;
- fixture and smoke queries returning expected shapes.

### 4.6 Promote

Promotion is transactional or uses an equivalent version-pointer swap:

- merge normalized staged rows;
- deactivate records absent from the latest complete provider source where appropriate rather than hard-deleting referenced history;
- replace current prices from the source;
- update `catalog_state.active_import_id` and version;
- commit only after validation passes.

A failure before commit leaves the previous active catalog untouched.

### 4.7 Publish snapshot

After catalog promotion:

1. build a deterministic SQLite file;
2. integrity-check it;
3. calculate checksum and record counts;
4. upload under an immutable versioned path;
5. insert the snapshot record;
6. publish the manifest pointer only after upload succeeds.

A snapshot failure does not roll back the cloud catalog and does not invalidate the last good snapshot.

## 5. Catalog versioning

Canonical catalog version format:

`mtg-<provider-observed-utc>-<source-sha-prefix>-s<snapshot-schema-version>`

Example:

`mtg-20260726T120000Z-a1b2c3d4-s1`

The exact string must be immutable and included in:

- catalog state;
- snapshot manifest;
- device heartbeat;
- device inventory batch;
- run summary.

## 6. Search model

### 6.1 Normalization

At minimum normalize:

- lower/casefolded card name;
- punctuation-insensitive search name;
- combined oracle text/type/name search vector;
- set code and name;
- color/color-identity arrays;
- normalized supertypes, card types, and subtypes at Oracle and face level;
- numeric P/T/L projections while preserving raw variable or expression values;
- distinct printing/face artist identities, canonical keywords, and format legalities;
- rarity, language, mana value, date, digital/default-browse flags.

### 6.2 PostgreSQL indexes

Use:

- full-text GIN index;
- trigram name index;
- B-tree indexes for common equality/range filters;
- array GIN indexes only where query plans demonstrate value.

### 6.3 Search API behavior

- minimum query length for fuzzy search;
- deterministic tie-breaking by name, release date, set code, collector number, printing ID;
- cursor or keyset pagination;
- bounded page size;
- no unbounded “return everything” request;
- one server-validated typed filter tree shared by catalog and owned-printing collection queries;
- bounded searchable facet reads for sets, languages, types, subtypes, artists, keywords, formats, rarities, and finishes;
- Oracle mode groups eligible results by Oracle-card identity after applying every search filter;
- the Oracle representative prefers default-browse printings, then the newest release, with deterministic variation, promo, and printing-ID tie-breakers;
- all-variants mode returns every eligible printing and is part of cursor scope so cursors cannot cross modes;
- the visual Oracle grid obtains bounded, admitted-user-only foil and nonfoil floors for the result card IDs; set and language filters constrain the eligible printings, while all-variants results use each exact printing's current observations;
- query plan/performance tests on representative catalog size.

Printing-level rules (set, language, rarity, finish, artist, and release date) filter eligible printings before Oracle representative ranking. Oracle-level rules match canonical card data or normalized face data. Separate face-level numeric rules use existential face matching; multiple rules may be satisfied by different faces of the same Oracle card. A numeric P/T/L range excludes variable values such as `*`, `X`, and expressions unless the rule explicitly includes them.

## 7. Price model

### 7.1 Meaning

Scryfall-derived values are general market estimates. They are suitable for:

- collection estimates;
- relative value sorting;
- rough missing-card cost;
- value-tier logic.

They are not storefront sale prices, buylist offers, condition-adjusted accounting values, or guaranteed realizable values.

### 7.2 Mapping

Create a current-price row only for a non-null provider price.

Map provider fields to normalized tuples, initially:

- USD nonfoil;
- USD foil;
- USD etched;
- EUR nonfoil;
- EUR foil when supplied;
- TIX where relevant to digital data.

### 7.3 Timestamps

Store:

- `observed_at` from the bulk source metadata/version;
- `ingested_at` when Talence accepted the observation;
- `stale_after` from policy.

The UI emphasizes `observed_at`.

### 7.4 Refresh schedule

Initial recommendation:

- catalog/price import once daily during private beta;
- manual workflow dispatch available;
- skip unchanged provider source;
- consider twice-daily only after observing need and cost.

### 7.5 Price freshness UI

Examples:

- `Scryfall estimate · observed 4 hours ago`
- `Scryfall estimate · observed Jul 26, 2026 12:00 UTC`
- `Price unavailable`
- `Estimate may be stale · observed 2 days ago`

The image-first catalog grid intentionally compresses this to `Nonfoil <amount>` and `Foil <amount>` on hover/focus (and persistently on touch). It omits timestamps and provider labels only on that compact browse surface; detail pages retain full source and freshness context.

## 8. Image strategy

### Web

- Store provider image URIs and face dimensions/metadata.
- Render provider CDN images directly with lazy loading.
- Do not proxy every card image through a Vercel Function.
- Do not enable paid per-origin image transformation by default.
- Use responsive dimensions and browser/CDN caching.
- Provide text/layout fallbacks when an image is unavailable.
- Serve set and mana-symbol SVGs through allowlisted same-origin Talence routes backed by the framework data cache; source them from Scryfall, reject non-SVG or untrusted upstreams, and provide the Talence emblem when a set symbol is missing.

The implementation must review provider and IP terms before public/commercial use.

### Robot

The SQLite snapshot contains image URIs and stable face identity. Robots may cache required images locally using a content-addressed cache and may generate recognition features locally or through a separately authorized pipeline.

The cloud does not eagerly mirror the full image corpus in the first release.

## 9. Robot SQLite snapshot

### 9.1 Purpose

Provide fast, offline, deterministic lookup derived from the same active catalog as the web.

### 9.2 Required tables

The first snapshot schema includes:

- `snapshot_meta`
- `sets`
- `oracle_cards`
- `printings`
- `faces`
- `legalities` where useful
- `current_prices`
- `external_ids`
- search indexes/FTS tables appropriate to SQLite

### 9.3 Required metadata

`snapshot_meta` contains:

- catalog version;
- snapshot schema version;
- generated time;
- provider observed time;
- source SHA-256;
- compatible API contract version;
- record counts;
- minimum robot client version;
- game code.

### 9.4 Determinism

Given the same normalized active catalog and snapshot schema version, generation must produce semantically identical rows and stable ordering. Byte-for-byte determinism is preferred but not required if SQLite build metadata prevents it; the content checksum remains authoritative per produced artifact.

### 9.5 Publication

- immutable storage path;
- private bucket or unguessable artifact path;
- short-lived signed download URL for an authorized device;
- manifest available through authenticated API;
- old compatible snapshots retained for a bounded rollback window.

## 10. Device snapshot update protocol

1. Device authenticates.
2. Device requests latest compatible manifest with current version and client version.
3. Server returns `up_to_date` or a signed download description.
4. Device downloads to a temporary path.
5. Device verifies byte size and SHA-256.
6. Device opens SQLite and runs integrity/schema checks.
7. Device swaps the catalog atomically only while no unsafe run transition is active.
8. Device retains the prior snapshot for rollback.
9. Device reports the installed version on next heartbeat or batch.

## 11. Testing requirements

- no test requires live Scryfall access;
- representative single-face and multi-face fixtures;
- foreign-language printing fixture;
- token/emblem/non-oracle fixture;
- null and multi-finish price fixtures;
- duplicate replay fixture;
- interrupted download/import fixture;
- promotion failure preserves old catalog;
- snapshot checksum and SQLite integrity;
- web and snapshot IDs match for sampled printings;
- catalog search performance on generated representative volume.

---

<!-- SOURCE: 08 - API and Device Integration Contract.md -->

# 08 — API and Device Integration Contract

Version: 1.0.0  
Status: Locked

## 1. API purpose

The API serves:

- approved machines;
- future mobile scanners;
- controlled administrative tooling;
- future third-party integrations.

The browser may use the same route handlers where useful, but human UI implementation details do not redefine the external contract.

## 2. Base path and versioning

Base path:

`/api/v1`

Breaking payload or semantic changes require a new major path. Additive optional fields may be introduced within v1 when old clients remain valid.

Every response includes or echoes a correlation/request ID.

## 3. Response shape

Success:

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid"
  }
}
```

Error:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "human-readable summary",
    "details": {}
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

`details` never contains secrets, stack traces, SQL, or unrelated tenant data.

## 4. Device credential format

Recommended raw format:

`tlc_dev_<credential-id-prefix>_<base64url-random-secret>`

Properties:

- at least 256 bits of random secret material;
- prefix identifies a candidate credential row without being sufficient for auth;
- raw secret shown once;
- SHA-256 digest of the full secret, or HMAC-SHA-256 with a server-held pepper, stored in `app_private`;
- constant-time digest comparison;
- independently revocable and rotatable;
- no human refresh token on a device.

Transport:

`Authorization: Bearer <device-credential>`

All requests require HTTPS.

## 5. Device authorization sequence

For every device request:

1. apply Vercel/firewall route limits;
2. parse credential prefix and secret;
3. find active credential by prefix;
4. compare digest in constant time;
5. require credential not expired/revoked;
6. require device active;
7. update last-used/last-seen using a bounded write strategy;
8. verify requested collection grant and permission;
9. verify workspace consistency;
10. verify feature/quota guard;
11. perform the operation through an atomic database function.

A failed check returns the least revealing stable error appropriate to the client.

## 6. Idempotency

Mutation endpoints require:

`Idempotency-Key: <client-generated-unique-key>`

Rules:

- scope is device plus endpoint/resource;
- server canonicalizes and hashes the validated request body;
- first accepted request stores key, hash, and result;
- identical replay returns the stored result and an idempotent-replay indicator;
- same key with a different body returns `409 idempotency_conflict`;
- in-progress duplicate may return the original result when available or `409 request_in_progress`;
- retention must exceed the expected device offline/retry window.

## 7. Pagination

- keyset/cursor pagination;
- default limit 50;
- maximum limit 200 unless an endpoint states otherwise;
- opaque cursor;
- stable deterministic ordering;
- no page-number contract for large catalogs.

## 8. Human/admin endpoints

The exact web UI may use Server Actions, but these stable operations are required:

### Admission administration

- `POST /api/v1/admin/invited-users`
- `GET /api/v1/admin/invited-users`
- `POST /api/v1/admin/invited-users/{id}/send`
- `POST /api/v1/admin/invited-users/{id}/revoke`

Platform-admin only.

### Catalog operations

- `GET /api/v1/admin/catalog/status`
- `POST /api/v1/admin/catalog/sync`
- `GET /api/v1/admin/catalog/imports/{id}`

The sync endpoint queues/triggers work; it does not perform a bulk import inside the request.

## 9. Catalog endpoints for admitted humans

At minimum:

- `GET /api/v1/catalog/search`
- `GET /api/v1/catalog/cards/{card_id}`
- `GET /api/v1/catalog/cards/{card_id}/printings`
- `GET /api/v1/catalog/printings/{printing_id}`
- `GET /api/v1/catalog/sets`
- `GET /api/v1/catalog/sets/{set_id_or_code}`
- `GET /api/v1/catalog/status`

Anonymous access is denied during private beta.

## 10. Collection and deck operations

Human operations may be exposed through Server Actions or routes, but their semantics are canonical:

- create/archive/restore collections;
- list/search balances;
- apply inventory transaction;
- transfer inventory;
- reverse transaction;
- stage/preview/commit import;
- create/edit/archive decks;
- calculate ownership and validation.

Direct update of inventory balances or immutable transaction rows is never an API operation.

## 11. Device endpoints

### `GET /api/v1/device/me`

Returns:

- device ID/name/type/status;
- workspace ID;
- granted collection IDs and permissions;
- server time;
- API version.

### `POST /api/v1/device/heartbeat`

Request:

- client software version;
- firmware version optional;
- installed catalog snapshot version;
- bounded health/status fields.

Does not accept motion state as cloud authority.

### `GET /api/v1/device/catalog/manifest`

Query/headers include:

- current snapshot version optional;
- client version;
- supported snapshot schema versions.

Returns either:

- `up_to_date: true`, or
- immutable snapshot metadata and short-lived signed download URL.

### `POST /api/v1/device/collections/{collection_id}/inventory-batches`

Required permission: `inventory_write`.

Headers:

- device credential;
- idempotency key.

Body:

- schema version;
- catalog snapshot version;
- occurred time;
- optional external run ID;
- array of printing-level quantity deltas;
- bounded metadata.

Validation:

- collection grant;
- maximum line count and body size;
- known active printing IDs;
- valid finish and condition;
- nonzero bounded deltas;
- resulting quantities nonnegative;
- body hash/idempotency;
- optional snapshot compatibility warning/error policy.

Commit:

- one device-sync batch;
- one inventory transaction;
- all transaction lines;
- all materialized balance changes;
- atomic success or no change.

### `POST /api/v1/device/runs`

Required permission: `run_summary_write`.

Body includes:

- external run ID;
- collection ID;
- status;
- snapshot version;
- start/end times;
- total/recognized/unrecognized/posted counts;
- optional safe diagnostic code.

Idempotent by device + external run ID.

### `GET /api/v1/device/collections/{collection_id}/inventory`

Optional P1 endpoint, permission `inventory_read`.

Returns bounded/current balances for synchronization or collection-aware robot rules. Pagination required.

## 12. Device inventory line contract

Canonical line:

```json
{
  "line_id": "client-stable-line-id",
  "printing_id": "uuid",
  "finish": "nonfoil",
  "condition": "near_mint",
  "quantity_delta": 1
}
```

Rules:

- `line_id` unique within the batch;
- printing ID is the Talence/Scryfall-compatible printing UUID from the snapshot;
- quantity delta is signed, nonzero, and within configured bounds;
- finish and condition use canonical values;
- exact physical instance IDs may appear only in bounded metadata until per-copy provenance is ratified.

## 13. Unknown or stale catalog behavior

If a device submits an unknown printing:

- reject the batch atomically with `catalog_printing_unknown`;
- include the unknown IDs in bounded details;
- include latest compatible snapshot version when available;
- do not silently create catalog rows;
- allow the device to update catalog and retry with the same semantic operation but a new idempotency key unless no transaction was stored. The implementation must document exact retry behavior.

If snapshot is old but IDs remain valid, accept or warn according to a configurable minimum-compatible version. Do not reject solely because a newer snapshot exists.

## 14. Rate and size controls

Initial configurable bounds:

- heartbeat: low per-minute limit per device;
- inventory batches: bounded per minute and per day;
- maximum request body;
- maximum 500 lines per batch initially;
- maximum absolute delta per line;
- signed URL duration;
- catalog downloads per device/day;
- failed credential attempts per source.

The exact values are operations configuration, not hardcoded in components.

## 15. API observability

Log:

- request/correlation ID;
- route and API version;
- result code;
- device ID after successful auth;
- collection/resource ID where safe;
- duration;
- line count/body size category;
- idempotent replay indicator.

Never log:

- raw credential;
- authorization header;
- secret digest;
- entire inventory body by default;
- user auth token;
- signed artifact URL.

## 16. Prohibited device operations

No device endpoint may:

- start physical motion remotely;
- upload arbitrary SQL/catalog rows;
- patch current prices;
- grant itself collection access;
- create human users;
- mutate workspace membership;
- alter an accepted inventory transaction;
- treat cloud run status as the robot execution checkpoint.

## 17. Contract artifacts

The machine-readable OpenAPI and JSON Schema files in `contracts/` are part of canon. Generated clients must be derived from them rather than hand-maintained incompatible payload types.

---

<!-- SOURCE: 09 - Web UX and Design System.md -->

# 09 — Web UX and Design System

Version: 1.0.0  
Status: Locked

## 1. Experience goal

Talence should feel like a precise collection instrument with restrained arcane identity: structured, composed, data-capable, and slightly elevated without becoming fantasy decoration.

The UI prioritizes clarity, speed, and trustworthy state over spectacle.

## 2. Responsive standard

Mobile is a primary target, not a compressed desktop afterthought.

Reference breakpoints:

- compact: below 640px;
- medium: 640px–1023px;
- wide: 1024px and above.

Components own responsive behavior through shared media-query tokens. No page may require horizontal viewport scrolling for its primary workflow.

## 3. Route map

### Anonymous

- `/` — branded private-beta sign-in landing; an authenticated visitor redirects directly to `/app`
- `/login` — the same sign-in surface for callback and recovery statuses
- `/auth/callback`
- `/invite/complete`
- `/forgot-password`
- `/reset-password`
- legal/status pages as needed

There is no `/register` route.

### Authenticated application

- `/app`
- `/app/catalog`
- `/app/catalog/cards/[cardId]`
- `/app/catalog/printings/[printingId]`
- `/app/catalog/sets/[setCode]`
- `/app/collections`
- `/app/collections/[collectionId]`
- `/app/collections/[collectionId]/history`
- `/app/collections/[collectionId]/import`
- `/app/decks`
- `/app/decks/[deckId]`
- `/app/devices`
- `/app/devices/[deviceId]`
- `/app/settings`

### Platform administration

- `/app/admin/invites`
- `/app/admin/catalog`
- `/app/admin/operations`

Admin routes remain invisible and denied to ordinary users.

## 4. Global shell

### Wide layout

- sticky deep-navy top navigation, approximately 64px, using the canonical gold Talence emblem at a proportionally enlarged size;
- the emblem is the dashboard/home control; the visible primary links are Catalog, Collections, and Decks;
- no persistent active-workspace rail; the enlarged profile control opens a deep-navy submenu ordered as workspace selector, Devices, Admin when authorized, Settings, and Log Out with its icon;
- independently scrolling main content;
- page header with title, context, and primary action;
- main content may be constrained or full-width.

### Compact layout

- compact 64px top bar with the enlarged Talence mark and the same account submenu;
- bottom primary navigation for Catalog, Collections, and Decks;
- contextual sidebars become sheets/drawers;
- primary create/add actions remain reachable near the thumb zone;
- tables become semantic stacked rows/cards when columns cannot remain readable.

## 5. Content width modes

### Constrained

Forms, prose, settings, and focused detail sections.

- maximum width approximately 960–1200px depending on content;
- centered;
- 16px compact / 24px wide horizontal padding.
- settings fields share one responsive grid, with controls in the same horizontal row bottom-aligned independently of label or hint height.

### Full width

Catalog results, collection tables, deck editor, and analytical views.

- fills available main region;
- preserves outer padding;
- internal grids adapt responsively.

## 6. Visual identity

### Personality

- Arcane-Tech, disciplined;
- Precision Tool foundation;
- geometric and restrained;
- identity never competes with data.

### Core palette

- Navy: `#1F2F5A`
- Entry navy: `#071827`
- Gold: `#C29A3A`
- Entry gray: `#DFE5EA`
- Gray 50: `#F4F6FA`
- Gray 100: `#E9EDF5`
- Gray 200: `#D7DDEA`
- Gray 600: `#5E6A85`
- Gray 800: `#2C3448`
- White: `#FFFFFF`

Status tokens:

- success: `#2F6B4F`
- warning: `#8A641D`
- danger: `#943F46`
- information: `#356A8A`

All combinations must meet accessible contrast for their use.

### Color rules

- neutral surfaces dominate;
- navy is functional for primary actions/navigation;
- gold is rare signal/selection/identity, not a primary button fill;
- color never carries meaning alone;
- the anonymous sign-in entrance may use one restrained entry-navy-to-entry-gray transition and a subtle, complex gold geometric field;
- application surfaces use no gradients, glassmorphism, neon effects, or large gold backgrounds.

### Brand entrance

- the canonical emblem asset is the gold Talence emblem stored under the web app's local `public/brand` directory;
- the authenticated shell references that same emblem file rather than maintaining a duplicate logo asset;
- the authenticated header and page canvas reuse the same celestial SVG at one viewport-anchored size and position, rendering the continuous linework in gold over the deep-navy header and subtle dark gray over the page;
- the anonymous entrance is a focused two-row sign-in surface rather than a marketing or SaaS feature page;
- the identity row centers the emblem, Talence wordmark, and `Private Beta Underway` over entry navy;
- the form row sits on entry gray and contains username-or-email, password, sign-in, and an underlined recovery link;
- authenticated visits to the root or login surface redirect directly to the dashboard.

### Shape and depth

- consistent modest radius, recommended 6px;
- borders and spacing create structure;
- shadows only for overlays and subtle elevation;
- no bubbly cards or floating-dashboard clutter.

### Typography

- one sans-serif family, recommended Inter through `next/font` or a system fallback, for application UI;
- weights 400, 500, 600, optional 700 only for limited emphasis;
- scale: 12, 14, 16, 20, 24, 32px;
- default UI text 14px;
- numeric columns use tabular numbers;
- no decorative display fonts outside the restrained Talence wordmark and sign-in heading on the anonymous brand entrance.

### Motion

- under roughly 200ms;
- communicates state/continuity;
- reduced-motion preference honored;
- no bounce or decorative ambient animation.

## 7. Spacing and sizing

Base spacing unit: 4px.

Allowed common scale:

- 4
- 8
- 12
- 16
- 24
- 32
- 48
- 64px for major layout separation only

Standard controls:

- input/button height: 36–40px;
- touch target: at least 44px on compact layouts;
- standard table row: 40px;
- dense table row: 32px only on wide screens and by user choice.

## 8. Styling implementation

Required:

- CSS custom-property tokens;
- global reset/base classes;
- CSS Modules for component/feature styles;
- shared primitive components;
- semantic class names;
- media queries using shared breakpoint variables/conventions.

Prohibited:

- Tailwind;
- long utility-class strings;
- CSS-in-JS runtime styling for ordinary layout;
- repeated ad hoc values;
- inline style objects except genuinely dynamic CSS custom properties;
- full visual component frameworks that override Talence identity.

Headless accessibility primitives such as Radix may be used for dialogs, menus, popovers, and select behavior, but all visual styling remains Talence-owned.

## 9. Shared primitives

At minimum:

- Button
- IconButton
- TextInput
- NumberInput
- SearchInput
- Select/Combobox
- Checkbox/Radio/Switch
- FormField and validation message
- Badge/StatusBadge
- Panel/Section
- Dialog/ConfirmDialog
- Drawer/Sheet
- DropdownMenu
- Tabs
- Tooltip
- Toast/InlineAlert
- Skeleton
- EmptyState
- ErrorState
- Pagination/CursorControls
- DataTable responsive wrapper
- CardImage with face handling and fallback

Single-line text inputs and selects use the same explicit control height. Labels and supporting text remain outside that control-height measurement.
- PriceDisplay with provider/freshness
- QuantityStepper
- FilterBar/FilterDrawer

Feature code composes these primitives instead of recreating controls.

## 10. Catalog UX

### Browse

- the page opens directly on a populated result set without a redundant catalog introduction;
- search remains visible above a compact, horizontally scrollable quick-filter row;
- color identity, card type, set, rarity, and mana value open compact quick-filter popovers without opening the advanced panel;
- active filters are visible as individually removable chips, with a global Clear all action;
- advanced filters use a 520-600 px desktop side panel and a full-screen mobile sheet with collapsible sections and a sticky footer;
- normal mode combines fields with AND; Logic mode exposes AND/OR groups and explicit NOT states up to two nested group levels;
- searchable multi-selectors stay open for repeated selection, display selected-value pills, and provide keyboard navigation and visible focus/selected states;
- Sort remains in the results toolbar beside Grid/Table controls rather than inside filtering;
- the filter drawer exposes an unchecked **Return all variants** checkbox; its tooltip reads "Select this to return all individual printings of a card. Leave this unchecked to only return one result per card.";
- unchecked Oracle mode shows one representative per card, while checking it shows individual printings; a set filter constrains the Oracle representative to that set;
- the grid-first table/grid toggle always defaults a bare catalog route to grid; table remains an explicit URL-addressable view and does not become the later default;
- the grid uses one through five media-query-aligned columns and requests 6, 12, 18, 24, or 30 results respectively, yielding six complete rows when at least that many matches exist;
- the browse header shows the result count without ingestion metadata or a redundant Oracle-mode explanation;
- grid results remove the information panel and use the image itself as the detail link;
- hover and keyboard focus reveal the Oracle name above the image, compact Nonfoil/Foil prices below it, and folder-plus/list-plus quick actions near the image's upper-right corner; touch layouts expose the same controls without hover;
- Oracle-mode prices are the least expensive current nonfoil and foil observations across eligible printings, selected-set mode constrains those floors to that set, and all-variants mode shows exact-printing observations;
- URL query state, admitted-user-scoped short-lived result caching, and session scroll restoration make browser Back return to the recent browse instead of resetting it.

### Detail

- face-aware image viewer;
- oracle information separate from printing information;
- printing selector optimized for set, collector number, language, finish, and price;
- add-to-collection action always chooses exact printing/finish/condition/quantity;
- back navigation preserves browse filters.

## 11. Collection UX

### Structured view

Columns/fields as space allows:

- image/identity;
- name;
- set/collector;
- language;
- finish;
- condition;
- quantity;
- unit estimate;
- total estimate;
- updated time;
- selection/actions.

On mobile, each row becomes a compact inventory card with quantity controls and an overflow action menu.

### Gallery view

- responsive card grid;
- quantity and finish badges;
- total value/condition accessible without hover;
- multi-select mode.

### Analytical view

- summary cards and grouped tables/charts;
- charts are subordinate to readable values;
- no chart-only information.

### Mutation feedback

- optimistic UI only when rollback is reliable;
- committed result reconciles from server;
- stale quantity conflicts show current quantity and an explicit retry action;
- destructive changes require confirmation when more than one item or large quantities are affected.

## 12. Deck-builder UX

### Wide

Three-region layout:

1. catalog/search rail;
2. deck zones and entries;
3. ownership/validation/summary inspector.

Regions may collapse based on width.

### Compact

- tabbed or stacked Catalog / Deck / Analysis surfaces;
- persistent deck quantity and validation summary;
- add and zone controls available without drag;
- preferred-printing sheet;
- no hidden hover-only actions.

### Entry presentation

Show:

- name;
- quantity;
- zone;
- owned/required/missing;
- preferred printing/price when selected;
- validation indicators;
- action menu.

## 13. Accessibility

- semantic landmarks and headings;
- complete keyboard navigation on wide layouts;
- visible focus rings;
- labels never replaced solely by placeholders;
- screen-reader labels for icon controls;
- dialog focus trapping/restoration;
- status not conveyed by color alone;
- image alt text uses card/face identity;
- reduced motion respected;
- target WCAG 2.2 AA for implemented surfaces.

## 14. Error and empty-state language

Errors should state:

- what failed;
- whether anything changed;
- the safe next action;
- request ID for support when useful.

Empty states should offer one relevant action, such as Browse Catalog, Add Card, Import CSV, or Create Deck.

## 15. Branding constraints

- Talence uses its own emblem/name, not Wizards or Magic logos as product branding.
- Card images are displayed unmodified when used.
- Required unofficial/provider attribution and legal notices are placed in an appropriate footer/about surface after legal review.

---

<!-- SOURCE: 10 - Robot Cloud Boundary.md -->

# 10 — Robot–Cloud Boundary

Version: 1.0.0  
Status: Locked integration boundary

## 1. Purpose

Allow the web platform and physical robot to evolve concurrently without sharing runtime code, databases, or deployment assumptions.

## 2. Cloud authority

The cloud is authoritative for:

- admitted human accounts;
- workspaces and memberships;
- global catalog and current price estimates;
- collection balances and transaction history;
- decks;
- device registration, credentials, and grants;
- accepted device sync batches;
- thin run summaries;
- published catalog snapshots.

## 3. Robot authority

The robot is authoritative for:

- local hardware configuration;
- homing and calibration;
- camera and sensor operation;
- image capture and identification execution;
- scan sequencing;
- local bin occupancy during a run;
- deterministic sort/provisioning/movement plans;
- move execution and reconciliation;
- local failure/restart recovery;
- immutable run price snapshots used for planning;
- offline outbound queue.

## 4. Shared identities

The integration contract shares:

- game code;
- oracle-card UUID;
- printing UUID;
- finish;
- condition;
- catalog snapshot version;
- collection UUID;
- device UUID;
- external run ID;
- idempotency key.

The cloud does not need the robot's per-run physical `instance_id` to maintain quantity inventory. A future provenance feature may add per-copy identity through a separate ratified contract.

## 5. Catalog direction

Direction: cloud to robot.

- Cloud worker generates an immutable SQLite snapshot.
- Device downloads and verifies it.
- Device never writes catalog or current prices to the cloud.
- A robot may maintain local image/feature caches derived from snapshot URIs.

## 6. Inventory direction

Primary direction: robot to cloud after local work is safely committed.

- Robot records results locally first.
- Robot queues one idempotent inventory batch.
- Network failure does not roll back physical work.
- Retry continues until cloud accepts or an operator resolves a permanent validation error.
- Cloud applies the batch atomically.
- Successful receipt is stored in the robot outbox state.

## 7. Offline-first behavior

The robot must be able to:

- identify and sort with its installed snapshot;
- complete/recover an active run without cloud connectivity;
- persist all run and outbox state locally;
- retry uploads after restart;
- retain the prior catalog during failed snapshot updates.

The web platform being unavailable must not create an unsafe robot transition.

## 8. Run summaries

Cloud run summaries may include:

- device and collection;
- external run ID;
- catalog snapshot version;
- status: completed, failed, cancelled, partially_posted;
- start/end time;
- total, recognized, unrecognized, and posted quantities;
- safe diagnostic code;
- bounded operator/sort-profile reference if useful.

Cloud run summaries exclude by default:

- movement plans;
- individual move events;
- coordinates;
- motor commands;
- camera frames;
- sensor telemetry;
- live bin occupancy;
- physical restart checkpoints;
- remote motion commands.

## 9. No remote start

The cloud may prepare configuration or show readiness, but it may not command the robot to begin physical motion in the initial architecture.

Any future remote-motion capability requires a separate safety design covering:

- local physical enablement;
- presence/interlock checks;
- command signing and expiry;
- operator identity;
- emergency stop behavior;
- network-loss behavior;
- replay protection;
- hardware certification.

## 10. Collection-aware sorting

A robot may request inventory-read access to a granted collection to support future rules such as copy limits or collection-aware purge behavior.

The cloud response is collection balance data only. Robot sort policy, bin provisioning, and physical decisions remain local.

## 11. Historical robot requirements retained as robot-domain context

The following concepts remain relevant to the separate robot project but do not reshape the cloud schema:

- bins are LIFO stacks;
- scan all cards before final planning/execution;
- correctness outranks bin utilization and move count;
- input and unrecognized bins are system roles;
- unrecognized bin is excluded from normal provisioning;
- sorting uses an ordered composite key;
- local user/run settings may include value tiers, copy handling, and pinned-bin rules;
- local run state must be restart-safe.

Cloud storage may eventually distribute user robot profiles, but the robot must snapshot them locally before use.

## 12. Compatibility policy

- Device API major version and snapshot schema version are independent.
- Manifest states minimum client version and supported schema.
- Server supports a documented compatibility window.
- Device reports its installed versions.
- Unknown fields are ignored only where JSON Schema marks extensibility.
- Breaking snapshot changes publish alongside updated robot code; old compatible snapshot remains available during rollout.

## 13. Integration test suite

Maintain a reference client or fixture suite proving:

- credential auth;
- manifest check/download response;
- checksum verification;
- idempotent inventory upload;
- conflicting replay rejection;
- unknown printing behavior;
- offline retry after simulated restart;
- grant denial;
- revoked credential denial;
- run summary replay;
- no cloud dependency for local execution fixtures.

---

<!-- SOURCE: 11 - Security Cost Controls and Operations.md -->

# 11 — Security, Cost Controls, and Operations

Version: 1.0.0  
Status: Locked

## 1. Threat and cost posture

Talence begins as a private beta operated by a small team. The primary operational risks are:

- unauthorized account creation;
- cross-workspace data access;
- leaked server or device credentials;
- duplicate machine updates;
- automated traffic causing database/function/external-service costs;
- expensive image proxying or transformation;
- unsafe catalog ingestion;
- accidental public exposure through permissive RLS;
- destructive schema/import mistakes;
- future paid-provider calls without quotas.

Security and spend protection are product requirements, not post-launch polish.

## 2. Anonymous surface minimization

Anonymous access is limited to:

- static landing/about/legal content;
- login form;
- password recovery form;
- Supabase invite/auth callback endpoints.

Anonymous users cannot:

- search the catalog;
- read prices;
- read profiles/workspaces;
- create accounts;
- call device APIs;
- trigger catalog jobs;
- invoke metered provider adapters.

Static pages must not perform database queries on every request when static generation/caching is possible.

## 3. Admission defenses

- public sign-up UI absent;
- public signup disabled in Supabase configuration;
- Before User Created hook checks private invited-user ledger;
- invitation creation is platform-admin only;
- invitation expiration and revocation;
- Supabase Auth rate limits reviewed/configured, including project-wide email-send limits;
- CAPTCHA/bot protection enabled for sign-in and password-recovery forms in production;
- WAF rate limits on login/recovery/callback-adjacent routes;
- generic responses avoid account enumeration;
- no public “request invite” form initially.

## 4. Row Level Security baseline

- RLS on every exposed table;
- no blanket authenticated-all policy for workspace data;
- policy tests use at least two users and two workspaces;
- indexed membership predicates;
- private schemas excluded from API exposure;
- catalog human role is read-only;
- inventory balances writable only through approved functions;
- immutable history insert/update/delete denied except trusted functions;
- no authorization based on `user_metadata` controlled by the user.

## 5. Secret management

### Browser-safe only

- Supabase URL;
- publishable key;
- non-secret app configuration.

### Server/worker secrets

- Supabase secret/service key;
- direct database URL;
- device credential pepper if used;
- future provider API keys;
- signing or SMTP credentials.

Rules:

- `.env.example` lists names only;
- secrets never committed;
- logs redact auth headers, cookies, signed URLs, and payload secrets;
- preview and production secrets are separate;
- rotate after suspected disclosure;
- no secret-bearing data in client bundles or `NEXT_PUBLIC_*` variables.

## 6. Device security

- high-entropy credentials shown once;
- digest only at rest;
- independent rotation/revocation;
- explicit collection grants;
- request size and rate bounds;
- idempotency body hashing;
- timestamp validation with reasonable clock skew for high-risk operations;
- no remote-motion command endpoint;
- failed auth attempts do not reveal whether a prefix exists;
- device last-seen updates are throttled to avoid a write per request when unnecessary.

## 7. External-service cost guard

Any feature that calls a service billed per request, token, image, transformation, or compute unit must use a server adapter implementing:

1. feature-enabled check;
2. authenticated admitted principal;
3. workspace/device authorization;
4. per-request validation and maximum size;
5. atomic quota reservation;
6. cache lookup;
7. bounded timeout;
8. bounded retry policy;
9. circuit breaker/global kill switch;
10. usage and cost-unit recording;
11. sanitized error mapping.

No component may instantiate a paid-provider SDK directly.

## 8. Initial cost-avoidance decisions

- catalog search runs in PostgreSQL, not a paid search SaaS;
- catalog ingestion uses bulk files, not per-card live requests;
- full image corpus is not mirrored eagerly;
- card images are not proxied through serverless functions;
- paid image transformations are disabled by default;
- no Realtime subscription is required for the initial app;
- no anonymous dynamic catalog;
- no AI/provider integration in the initial release;
- large catalog work never runs in a user request;
- dashboards use aggregate functions/summaries instead of repeated N+1 reads.

## 9. Platform controls

### Vercel

Before production:

- enable WAF rate-limit/challenge rules for sensitive and machine routes;
- configure Spend Management notifications and, when appropriate, automatic production pause behavior;
- monitor function invocations, duration, memory, transfer, and image usage;
- set deployment/function region close to Supabase;
- avoid broad function bundles.

### Supabase

Before production:

- enable Spend Cap where supported;
- review auth rate limits and enable CAPTCHA/bot protection;
- verify database/Storage/Function usage dashboards;
- set storage upload limits and MIME restrictions;
- verify backups;
- review every exposed table and policy;
- disable unused Auth providers, anonymous users, Realtime, and extensions;
- use a custom SMTP provider only when needed and configured safely.

## 10. Application rate limits

Layer limits:

1. WAF/source-rate limit before function execution where possible.
2. Principal/device limits in application code.
3. External-service unit quotas in PostgreSQL.
4. Provider-specific limits in adapter code.

Limit categories:

- login/recovery attempts;
- admin invite issuance;
- catalog search rate/page size;
- CSV file size and rows;
- device heartbeat;
- device batches and lines;
- snapshot downloads;
- catalog sync trigger;
- future metered providers.

Return `429` with safe retry guidance. Do not retry internally in a way that multiplies costs.

## 11. Input and file safety

- validate all request bodies with generated/runtime schemas;
- enforce content type and byte size before parsing;
- CSV uploads private, bounded, and malware/content scanned where appropriate before broader release;
- formula-injection-safe CSV export;
- no user-controlled storage paths;
- signed URLs short-lived;
- normalize filenames and retain original name only as display metadata;
- sanitize Markdown/HTML; initial notes should be plain text unless a safe renderer is selected.

## 12. Web security baseline

- secure, HTTP-only auth cookies through Supabase SSR flow;
- CSRF-safe same-origin mutations and framework protections;
- strict Content Security Policy compatible with card-image hosts;
- security headers: HSTS in production, nosniff, frame restrictions, referrer policy, permissions policy;
- no dangerous HTML injection;
- dependency update/scanning workflow;
- server-side validation for every mutation;
- stable generic errors for auth.

## 13. Observability

Every server/device request has a correlation ID.

Record:

- route/action;
- result code;
- duration;
- admitted user/device ID after auth;
- workspace/resource reference where safe;
- idempotent replay;
- rate/quota denial category;
- catalog import/snapshot stage and counts.

Do not record:

- credentials/tokens/cookies;
- full card image data;
- raw CSV content by default;
- full device batch payload by default;
- database connection strings;
- signed download URLs.

## 14. Backups and recovery

- user inventory, transactions, decks, membership, and device data require tested backups;
- catalog is reproducible but active source/snapshot metadata should still be backed up;
- storage imports and catalog artifacts need retention/recovery policy;
- every migration applies from an empty database;
- destructive migrations include rollback/restore plan;
- snapshot artifacts retain at least the current and previous compatible version;
- quarterly private-beta restore rehearsal is recommended after real user data exists.

## 15. Retention defaults

Initial recommendations:

- immutable inventory transactions: retain;
- device sync batch identity/result: retain at least 12 months, review later;
- safe run summaries: retain according to workspace setting later, default 100 most recent or 12 months;
- raw CSV upload: purge after 30 days or sooner after successful commit;
- import staging rows/error reports: purge after 30 days unless user downloads;
- catalog import logs: retain 90 days plus last successful records;
- revoked credential metadata: retain for audit without secret;
- application logs: bounded by provider/plan and sensitivity.

## 16. Security test matrix

### Admission

- unknown email blocked by hook;
- expired/revoked invite blocked;
- valid invite accepted;
- callback email/metadata mismatch blocked;
- finalization replay safe;
- suspended profile denied.

### RLS

For each workspace resource:

- anonymous denied;
- admitted non-member denied;
- viewer read/write denied as appropriate;
- editor mutation allowed/member management denied;
- admin device/member operations allowed;
- owner destructive/transfer rules;
- cross-workspace foreign-key attempts rejected.

### Inventory

- negative result rejected;
- history immutable;
- transaction atomicity;
- reversal correctness;
- stale concurrent edits resolve correctly.

### Device

- valid/invalid/revoked credential;
- grant denied;
- oversized body;
- duplicate replay;
- conflicting replay;
- unknown printing;
- rate/quota denial;
- no secret in logs.

### Catalog

- malformed source;
- failed validation;
- old catalog preserved;
- snapshot integrity;
- source timestamps/price null behavior;
- import idempotency.

## 17. Incident switches

The system must support rapid server-side disablement of:

- all new invitations;
- device inventory writes;
- snapshot downloads;
- catalog sync;
- each future external metered provider;
- selected high-cost routes.

Disabling a feature must fail closed and return a stable maintenance code.

---

<!-- SOURCE: 12 - Roadmap and Acceptance Criteria.md -->

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

---

<!-- SOURCE: 13 - Decision Ledger.md -->

# 13 — Decision Ledger

Version: 1.0.0  
Status: Locked record

## A. Locked decisions

### Product and scope

- Greenfield rebuild; existing code is not preserved.
- Initial product is invite-only private beta.
- Product is useful without robot hardware.
- First game is MTG.
- Mobile-friendly collection tracking and deck building are core.
- Third-party machines post collection updates through a stable API.
- Cloud and robot are separate projects/systems and separate repositories/deployments.

### Web stack

- Next.js App Router + React + TypeScript.
- Vercel hosting.
- CSS Modules and shared token/class CSS.
- No Tailwind or utility-class-wall styling.
- Supabase SSR session integration.
- Route Handlers implement initial external API.

### Backend/data

- Supabase PostgreSQL, Auth, and Storage.
- RLS on exposed tables.
- PostgreSQL functions own atomic inventory/admission behavior.
- No custom human password/session implementation.
- No MongoDB cloud architecture.

### Admission and tenancy

- Public signup disabled.
- Production sign-in and password recovery use CAPTCHA/bot protection plus provider/WAF rate limits.
- `app_private.invited_users` is in the auth creation chain.
- Supabase Before User Created hook rejects uninvited emails.
- Acceptance finalization creates profile, personal workspace, owner membership, and default collection atomically.
- Workspace is the ownership root.
- Fixed roles: owner/admin/editor/viewer.
- Global admission invite and workspace membership invite are separate concepts.

### Catalog and pricing

- Scryfall initial provider.
- Bulk-worker ingestion, not browser/live per-card lookup.
- `all_cards` source for complete language-specific catalog.
- Current price keyed by printing/provider/currency/finish.
- Price source and observation time shown.
- Missing price is unknown.
- Scryfall estimate not storefront/accounting truth.
- Python 3.13 catalog worker.
- PostgreSQL search initially; no paid search provider.

### Inventory and decks

- Inventory balance key: collection + printing + finish + condition.
- Immutable transaction ledger plus materialized balances.
- All mutations atomic and auditable.
- Deck entries reference oracle cards with optional preferred printing.
- Deck ownership aggregates across selected collection sources.

### Devices and robot

- Machine credentials distinct from human auth.
- Raw credential shown once and not stored.
- Explicit collection grants.
- Idempotency required for machine mutations.
- Robot downloads immutable SQLite catalog snapshots.
- Robot works offline.
- No remote motion start.
- Cloud stores thin run summaries only.

### Cost/security

- Anonymous dynamic app data denied.
- Metered services server-only through quotas/circuit breakers.
- Images not proxied/transformed by paid infrastructure by default.
- Vercel WAF/Spend Management and Supabase Spend Cap/configuration are production gates.

## B. Deferred decisions/features

- Public catalog and public/unlisted collection/deck pages.
- Workspace membership UI beyond foundation.
- Social login and MFA beyond provider-ready architecture.
- Native mobile app.
- Mobile camera scanning.
- Multiple pricing providers and price history.
- Store locations, cost basis, acquisition lots, sales, margin, tax.
- Marketplace, trading, storefront, event advertising.
- Subscription billing and hardware entitlements.
- AI/EDHREC-style recommendations.
- Other TCGs and non-TCG inventory.
- Cloud robot monitoring/configuration/fleet management.
- Dedicated FastAPI service; may replace Route Handlers behind same contract later.
- Durable hosted job platform beyond initial GitHub Actions worker.

## C. Prohibited without canonical revision

- Public self-registration.
- Custom storage of human passwords or refresh tokens.
- Device using a human auth session.
- Direct browser calls to paid/metered external providers.
- Direct client updates to balances or immutable history.
- Catalog mutation by ordinary users/devices.
- Tailwind as styling architecture.
- Cloud motion commands.
- Cloud storage of robot execution checkpoints as authority.
- Silent ambiguous CSV/card matching.
- Treating missing price as zero.
- Claiming Scryfall estimates are storefront-grade.
- Scraping EDHREC or relying on unofficial private endpoints.

## D. Open but non-blocking

- Production domain names.
- Exact Supabase and Vercel regions; choose co-located regions.
- Custom SMTP provider and email branding.
- Final Talence logo asset and favicon package.
- Exact daily catalog-sync time.
- Private-beta invitation expiry default (recommended 7 days).
- Hard-purge retention periods after private-beta observation.
- Commercial licensing path and future store-grade pricing provider.

Codex must expose these as configuration or documentation, not invent business commitments.

---

<!-- SOURCE: 14 - Historical Source Reconciliation.md -->

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

---

<!-- SOURCE: 15 - Official References.md -->

# 15 — Official References

Version: 1.0.0  
Status: Informational; verify again before production changes

These references informed the greenfield decisions. Product canon remains in the numbered documents.

## Supabase

- Documentation: https://supabase.com/docs
- Auth users and admin invitations: https://supabase.com/docs/guides/auth/users
- Before User Created hook: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- Custom Access Token hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- CAPTCHA/bot protection: https://supabase.com/docs/guides/auth/auth-captcha
- Production email/custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Next.js/Supabase SSR guide: https://supabase.com/nextjs
- Cost control / Spend Cap: https://supabase.com/docs/guides/platform/cost-control
- Storage bandwidth/egress: https://supabase.com/docs/guides/storage/serving/bandwidth
- Storage image transformations: https://supabase.com/docs/guides/storage/serving/image-transformations

## Next.js and Vercel

- Next.js App Router: https://nextjs.org/docs/app
- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Vercel Functions: https://vercel.com/docs/functions
- Vercel Firewall and DDoS controls: https://vercel.com/docs/vercel-firewall
- Vercel WAF rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Spend Management: https://vercel.com/docs/spend-management
- Vercel limits: https://vercel.com/docs/limits
- FastAPI on Vercel, for a possible future API extraction: https://vercel.com/docs/frameworks/backend/fastapi

## Scryfall

- API access/rate-limit guidance: https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
- Bulk data reference: https://scryfall.com/docs/api/bulk-data
- API base: https://api.scryfall.com

## Wizards of the Coast

- Fan Content Policy: https://company.wizards.com/en/legal/fancontentpolicy
- Terms: https://company.wizards.com/en/legal/terms

Commercial launch requires current legal review; these links do not substitute for legal advice.

---

# Machine-Readable Companions

- `contracts/README.md`
- `contracts/catalog-snapshot-manifest.schema.json`
- `contracts/device-api.openapi.yaml`
- `contracts/device-inventory-batch.schema.json`
- `contracts/device-run-summary.schema.json`
- `contracts/edge-catalog-schema.sql`

# Diagrams

- `diagrams/auth-invite-flow.mmd`
- `diagrams/catalog-flow.mmd`
- `diagrams/domain-erd.mmd`
- `diagrams/inventory-ledger-flow.mmd`
- `diagrams/system-context.mmd`
