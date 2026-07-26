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
- `catalog_view text`
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
- `toughness text null`
- `loyalty text null`
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
