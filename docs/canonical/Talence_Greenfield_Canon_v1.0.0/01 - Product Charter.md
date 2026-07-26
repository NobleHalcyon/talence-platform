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
