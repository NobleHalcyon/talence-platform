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

At minimum:

- set;
- color identity;
- color;
- type line;
- rarity;
- mana value range;
- language;
- finish availability;
- price availability;
- physical/digital;
- release date range.

Filters are URL-addressable so a result can be refreshed or shared among admitted users.
All browse filters live in a drawer opened from the search control group at every viewport width.
The drawer includes an unchecked **Return all variants** checkbox with the tooltip: "Select this to return all individual printings of a card. Leave this unchecked to only return one result per card."

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
