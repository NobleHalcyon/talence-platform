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
- type-line tokens;
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
- Oracle mode groups eligible results by Oracle-card identity after applying every search filter;
- the Oracle representative prefers default-browse printings, then the newest release, with deterministic variation, promo, and printing-ID tie-breakers;
- all-variants mode returns every eligible printing and is part of cursor scope so cursors cannot cross modes;
- the visual Oracle grid obtains bounded, admitted-user-only foil and nonfoil floors for the result card IDs; set and language filters constrain the eligible printings, while all-variants results use each exact printing's current observations;
- query plan/performance tests on representative catalog size.

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
