-- Phase 2: canonical catalog, current pricing, import operations, and isolated
-- worker staging. Catalog rows are globally shared and system-written.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.card_finish as enum (
  'unknown',
  'nonfoil',
  'foil',
  'etched'
);

create type public.job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled'
);

create function app_private.normalize_catalog_search_text(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(p_value), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$$;

revoke all on function app_private.normalize_catalog_search_text(text)
  from public, anon, authenticated;

create table public.catalog_sets (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete restrict,
  source_provider text not null,
  source_id text not null,
  code text not null,
  name text not null,
  set_type text null,
  released_at date null,
  parent_set_id uuid null,
  card_count integer null,
  digital boolean not null,
  foil_only boolean not null default false,
  nonfoil_only boolean not null default false,
  icon_svg_uri text null,
  source_updated_at timestamptz null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_sets_source_provider_shape check (
    source_provider = lower(btrim(source_provider))
    and char_length(source_provider) between 1 and 64
  ),
  constraint catalog_sets_source_id_bounded check (
    char_length(btrim(source_id)) between 1 and 256
  ),
  constraint catalog_sets_code_shape check (
    code = lower(btrim(code))
    and code ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  ),
  constraint catalog_sets_name_bounded check (
    char_length(btrim(name)) between 1 and 256
  ),
  constraint catalog_sets_set_type_bounded check (
    set_type is null or char_length(btrim(set_type)) between 1 and 64
  ),
  constraint catalog_sets_card_count_nonnegative check (
    card_count is null or card_count >= 0
  ),
  constraint catalog_sets_foil_shape check (
    not (foil_only and nonfoil_only)
  ),
  constraint catalog_sets_icon_uri_bounded check (
    icon_svg_uri is null or char_length(icon_svg_uri) <= 2048
  ),
  constraint catalog_sets_parent_fk
    foreign key (parent_set_id)
    references public.catalog_sets (id)
    on delete restrict
    deferrable initially deferred
);

create unique index catalog_sets_provider_source_idx
  on public.catalog_sets (source_provider, source_id);
create unique index catalog_sets_game_code_idx
  on public.catalog_sets (game_id, lower(code));
create index catalog_sets_game_active_release_idx
  on public.catalog_sets (game_id, active, released_at desc, id);
create index catalog_sets_parent_idx
  on public.catalog_sets (parent_set_id)
  where parent_set_id is not null;

create trigger catalog_sets_set_updated_at
before update on public.catalog_sets
for each row execute function app_private.set_updated_at();

create table public.catalog_cards (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete restrict,
  source_provider text not null,
  source_id text not null,
  name text not null,
  normalized_name text not null,
  mana_cost text null,
  mana_value numeric(10, 3) null,
  type_line text null,
  oracle_text text null,
  colors text[] not null default '{}'::text[],
  color_identity text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  reserved boolean not null default false,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(name, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(type_line, '')), 'B')
    || setweight(to_tsvector('english'::regconfig, coalesce(oracle_text, '')), 'C')
  ) stored,
  active boolean not null default true,
  source_updated_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_cards_source_provider_shape check (
    source_provider = lower(btrim(source_provider))
    and char_length(source_provider) between 1 and 64
  ),
  constraint catalog_cards_source_id_bounded check (
    char_length(btrim(source_id)) between 1 and 256
  ),
  constraint catalog_cards_name_bounded check (
    char_length(btrim(name)) between 1 and 512
  ),
  constraint catalog_cards_normalized_name_shape check (
    normalized_name = app_private.normalize_catalog_search_text(name)
    and char_length(normalized_name) between 1 and 512
  ),
  constraint catalog_cards_mana_value_nonnegative check (
    mana_value is null or mana_value >= 0
  ),
  constraint catalog_cards_colors_known check (
    colors <@ array['W', 'U', 'B', 'R', 'G']::text[]
    and color_identity <@ array['W', 'U', 'B', 'R', 'G']::text[]
  )
);

create unique index catalog_cards_provider_source_idx
  on public.catalog_cards (source_provider, source_id);
create index catalog_cards_game_active_name_idx
  on public.catalog_cards (game_id, active, normalized_name, id);
create index catalog_cards_search_document_idx
  on public.catalog_cards using gin (search_document);
create index catalog_cards_normalized_name_trgm_idx
  on public.catalog_cards
  using gin (normalized_name extensions.gin_trgm_ops);
create index catalog_cards_colors_idx
  on public.catalog_cards using gin (colors);
create index catalog_cards_color_identity_idx
  on public.catalog_cards using gin (color_identity);
create index catalog_cards_keywords_idx
  on public.catalog_cards using gin (keywords);
create index catalog_cards_mana_value_idx
  on public.catalog_cards (mana_value);
create index catalog_cards_type_line_idx
  on public.catalog_cards (lower(type_line) text_pattern_ops)
  where type_line is not null;

create trigger catalog_cards_set_updated_at
before update on public.catalog_cards
for each row execute function app_private.set_updated_at();

create table public.catalog_printings (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete restrict,
  card_id uuid null references public.catalog_cards (id) on delete restrict,
  set_id uuid not null references public.catalog_sets (id) on delete restrict,
  source_provider text not null,
  source_id text not null,
  collector_number text not null,
  language text not null,
  printed_name text null,
  normalized_name text generated always as (
    app_private.normalize_catalog_search_text(
      coalesce(printed_name, collector_number)
    )
  ) stored,
  rarity text null,
  layout text null,
  released_at date null,
  digital boolean not null,
  promo boolean not null default false,
  oversized boolean not null default false,
  variation boolean not null default false,
  finishes public.card_finish[] not null,
  color_identity text[] not null default '{}'::text[],
  frame_effects text[] not null default '{}'::text[],
  border_color text null,
  artist text null,
  scryfall_uri text null,
  image_status text null,
  is_default_browse boolean not null,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(printed_name, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(artist, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, coalesce(collector_number, '')), 'D')
  ) stored,
  active boolean not null default true,
  source_updated_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_printings_source_provider_shape check (
    source_provider = lower(btrim(source_provider))
    and char_length(source_provider) between 1 and 64
  ),
  constraint catalog_printings_source_id_bounded check (
    char_length(btrim(source_id)) between 1 and 256
  ),
  constraint catalog_printings_collector_number_bounded check (
    char_length(btrim(collector_number)) between 1 and 64
  ),
  constraint catalog_printings_language_shape check (
    language = lower(btrim(language))
    and language ~ '^[a-z][a-z0-9_-]{1,15}$'
  ),
  constraint catalog_printings_rarity_bounded check (
    rarity is null or char_length(btrim(rarity)) between 1 and 64
  ),
  constraint catalog_printings_layout_bounded check (
    layout is null or char_length(btrim(layout)) between 1 and 64
  ),
  constraint catalog_printings_finishes_known check (
    cardinality(finishes) between 1 and 3
    and finishes <@ array[
      'nonfoil'::public.card_finish,
      'foil'::public.card_finish,
      'etched'::public.card_finish
    ]
  ),
  constraint catalog_printings_color_identity_known check (
    color_identity <@ array['W', 'U', 'B', 'R', 'G']::text[]
  ),
  constraint catalog_printings_uri_bounded check (
    scryfall_uri is null or char_length(scryfall_uri) <= 2048
  )
);

create unique index catalog_printings_provider_source_idx
  on public.catalog_printings (source_provider, source_id);
create unique index catalog_printings_set_collector_language_source_idx
  on public.catalog_printings (
    set_id,
    collector_number,
    language,
    source_id
  );
create index catalog_printings_card_idx
  on public.catalog_printings (card_id, active, released_at desc, id);
create index catalog_printings_set_idx
  on public.catalog_printings (
    set_id,
    active,
    collector_number,
    language,
    id
  );
create index catalog_printings_game_browse_idx
  on public.catalog_printings (
    game_id,
    active,
    is_default_browse,
    digital,
    language,
    released_at desc,
    id
  );
create index catalog_printings_language_idx
  on public.catalog_printings (language, active, id);
create index catalog_printings_rarity_idx
  on public.catalog_printings (rarity, active, id);
create index catalog_printings_release_idx
  on public.catalog_printings (released_at desc, id);
create index catalog_printings_finishes_idx
  on public.catalog_printings using gin (finishes);
create index catalog_printings_color_identity_idx
  on public.catalog_printings using gin (color_identity);
create index catalog_printings_search_document_idx
  on public.catalog_printings using gin (search_document);
create index catalog_printings_normalized_name_trgm_idx
  on public.catalog_printings
  using gin (normalized_name extensions.gin_trgm_ops);

create trigger catalog_printings_set_updated_at
before update on public.catalog_printings
for each row execute function app_private.set_updated_at();

create table public.catalog_faces (
  id uuid primary key,
  printing_id uuid not null
    references public.catalog_printings (id) on delete cascade,
  face_index smallint not null,
  name text not null,
  normalized_name text generated always as (
    app_private.normalize_catalog_search_text(name)
  ) stored,
  mana_cost text null,
  type_line text null,
  oracle_text text null,
  colors text[] not null default '{}'::text[],
  power text null,
  toughness text null,
  loyalty text null,
  defense text null,
  artist text null,
  image_small_uri text null,
  image_normal_uri text null,
  image_large_uri text null,
  image_png_uri text null,
  art_crop_uri text null,
  border_crop_uri text null,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(name, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(type_line, '')), 'B')
    || setweight(to_tsvector('english'::regconfig, coalesce(oracle_text, '')), 'C')
  ) stored,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_faces_index_nonnegative check (face_index >= 0),
  constraint catalog_faces_name_bounded check (
    char_length(btrim(name)) between 1 and 512
  ),
  constraint catalog_faces_colors_known check (
    colors <@ array['W', 'U', 'B', 'R', 'G']::text[]
  ),
  constraint catalog_faces_image_uris_bounded check (
    (image_small_uri is null or char_length(image_small_uri) <= 2048)
    and (image_normal_uri is null or char_length(image_normal_uri) <= 2048)
    and (image_large_uri is null or char_length(image_large_uri) <= 2048)
    and (image_png_uri is null or char_length(image_png_uri) <= 2048)
    and (art_crop_uri is null or char_length(art_crop_uri) <= 2048)
    and (border_crop_uri is null or char_length(border_crop_uri) <= 2048)
  ),
  unique (printing_id, face_index)
);

create index catalog_faces_printing_idx
  on public.catalog_faces (printing_id, face_index);
create index catalog_faces_search_document_idx
  on public.catalog_faces using gin (search_document);
create index catalog_faces_normalized_name_trgm_idx
  on public.catalog_faces
  using gin (normalized_name extensions.gin_trgm_ops);

create trigger catalog_faces_set_updated_at
before update on public.catalog_faces
for each row execute function app_private.set_updated_at();

create table public.catalog_legalities (
  card_id uuid not null references public.catalog_cards (id) on delete cascade,
  format_code text not null,
  legality text not null,
  source_updated_at timestamptz null,
  primary key (card_id, format_code),
  constraint catalog_legalities_format_shape check (
    format_code = lower(btrim(format_code))
    and format_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint catalog_legalities_value_known check (
    legality in ('legal', 'not_legal', 'restricted', 'banned')
  )
);

create index catalog_legalities_format_idx
  on public.catalog_legalities (format_code, legality, card_id);

create table public.catalog_external_ids (
  entity_type text not null,
  entity_id uuid not null,
  provider text not null,
  identifier_type text not null,
  identifier_value text not null,
  constraint catalog_external_ids_entity_type_known check (
    entity_type in ('card', 'printing', 'set')
  ),
  constraint catalog_external_ids_provider_shape check (
    provider = lower(btrim(provider))
    and char_length(provider) between 1 and 64
  ),
  constraint catalog_external_ids_identifier_type_shape check (
    identifier_type = lower(btrim(identifier_type))
    and char_length(identifier_type) between 1 and 64
  ),
  constraint catalog_external_ids_identifier_value_bounded check (
    char_length(btrim(identifier_value)) between 1 and 512
  ),
  unique (provider, identifier_type, identifier_value)
);

create index catalog_external_ids_entity_idx
  on public.catalog_external_ids (entity_type, entity_id);

create table public.catalog_source_files (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_type text not null,
  provider_object_id text not null,
  provider_updated_at timestamptz not null,
  download_uri text not null,
  content_type text null,
  content_encoding text null,
  compressed_size bigint null,
  downloaded_size bigint null,
  sha256 text null,
  dependency_sha256 text null,
  catalog_identity_sha256 text generated always as (
    case
      when sha256 is null then null
      when dependency_sha256 is null then sha256
      else encode(
        extensions.digest(
          decode(sha256, 'hex') || decode(dependency_sha256, 'hex'),
          'sha256'
        ),
        'hex'
      )
    end
  ) stored,
  downloaded_at timestamptz null,
  status public.job_status not null default 'queued',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_source_files_provider_shape check (
    provider = lower(btrim(provider))
    and char_length(provider) between 1 and 64
  ),
  constraint catalog_source_files_source_type_shape check (
    source_type = lower(btrim(source_type))
    and char_length(source_type) between 1 and 64
  ),
  constraint catalog_source_files_object_id_bounded check (
    char_length(btrim(provider_object_id)) between 1 and 256
  ),
  constraint catalog_source_files_uri_bounded check (
    char_length(btrim(download_uri)) between 1 and 4096
  ),
  constraint catalog_source_files_content_type_bounded check (
    content_type is null or char_length(btrim(content_type)) between 1 and 256
  ),
  constraint catalog_source_files_encoding_bounded check (
    content_encoding is null
    or char_length(btrim(content_encoding)) between 1 and 64
  ),
  constraint catalog_source_files_sizes_nonnegative check (
    (compressed_size is null or compressed_size >= 0)
    and (downloaded_size is null or downloaded_size >= 0)
  ),
  constraint catalog_source_files_sha256_shape check (
    sha256 is null or sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint catalog_source_files_dependency_sha256_shape check (
    dependency_sha256 is null
    or dependency_sha256 ~ '^[a-f0-9]{64}$'
  )
);

create unique index catalog_source_files_provider_identity_idx
  on public.catalog_source_files (
    provider,
    source_type,
    provider_object_id,
    provider_updated_at,
    coalesce(dependency_sha256, '')
  );
create index catalog_source_files_latest_idx
  on public.catalog_source_files (
    provider,
    source_type,
    provider_updated_at desc,
    created_at desc
  );
create index catalog_source_files_sha256_idx
  on public.catalog_source_files (sha256)
  where sha256 is not null;

create trigger catalog_source_files_set_updated_at
before update on public.catalog_source_files
for each row execute function app_private.set_updated_at();

create table public.catalog_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid null
    references public.catalog_source_files (id) on delete restrict,
  status public.job_status not null default 'queued',
  trigger_type text not null,
  requested_force boolean not null default false,
  requested_by_user_id uuid null references auth.users (id) on delete set null,
  started_at timestamptz null,
  completed_at timestamptz null,
  records_seen bigint not null default 0,
  records_written bigint not null default 0,
  records_rejected bigint not null default 0,
  sets_written bigint not null default 0,
  cards_written bigint not null default 0,
  printings_written bigint not null default 0,
  faces_written bigint not null default 0,
  prices_written bigint not null default 0,
  error_code text null,
  error_summary text null,
  worker_version text null,
  catalog_version text null,
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_import_runs_trigger_type_shape check (
    trigger_type = lower(btrim(trigger_type))
    and trigger_type in ('manual', 'scheduled', 'fixture', 'live')
  ),
  constraint catalog_import_runs_counts_nonnegative check (
    records_seen >= 0
    and records_written >= 0
    and records_rejected >= 0
    and sets_written >= 0
    and cards_written >= 0
    and printings_written >= 0
    and faces_written >= 0
    and prices_written >= 0
  ),
  constraint catalog_import_runs_error_code_bounded check (
    error_code is null or char_length(error_code) between 1 and 128
  ),
  constraint catalog_import_runs_error_summary_bounded check (
    error_summary is null or char_length(error_summary) <= 4000
  ),
  constraint catalog_import_runs_worker_version_bounded check (
    worker_version is null
    or char_length(worker_version) between 1 and 128
  ),
  constraint catalog_import_runs_version_bounded check (
    catalog_version is null
    or char_length(catalog_version) between 1 and 160
  ),
  constraint catalog_import_runs_validation_object check (
    jsonb_typeof(validation_summary) = 'object'
    and pg_column_size(validation_summary) <= 32768
  ),
  constraint catalog_import_runs_status_timestamps check (
    (
      status = 'queued'::public.job_status
      and started_at is null
      and completed_at is null
    )
    or (
      status = 'running'::public.job_status
      and started_at is not null
      and completed_at is null
    )
    or (
      status in (
        'succeeded'::public.job_status,
        'failed'::public.job_status,
        'cancelled'::public.job_status
      )
      and completed_at is not null
    )
  )
);

create index catalog_import_runs_source_idx
  on public.catalog_import_runs (source_file_id, created_at desc)
  where source_file_id is not null;
create index catalog_import_runs_status_idx
  on public.catalog_import_runs (status, created_at desc, id);
create index catalog_import_runs_requested_by_idx
  on public.catalog_import_runs (requested_by_user_id, created_at desc)
  where requested_by_user_id is not null;
create unique index catalog_import_runs_one_active_worker_idx
  on public.catalog_import_runs ((true))
  where status = 'running';

create trigger catalog_import_runs_set_updated_at
before update on public.catalog_import_runs
for each row execute function app_private.set_updated_at();

create table public.catalog_state (
  singleton_id smallint primary key default 1,
  active_import_id uuid null
    references public.catalog_import_runs (id) on delete restrict,
  active_catalog_version text null,
  last_successful_source_observed_at timestamptz null,
  current_search_index_version text null,
  current_robot_snapshot_id uuid null,
  sync_enabled boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_state_singleton check (singleton_id = 1),
  constraint catalog_state_version_bounded check (
    active_catalog_version is null
    or char_length(active_catalog_version) between 1 and 160
  ),
  constraint catalog_state_search_version_bounded check (
    current_search_index_version is null
    or char_length(current_search_index_version) between 1 and 160
  ),
  constraint catalog_state_active_pair check (
    (active_import_id is null) = (active_catalog_version is null)
  )
);

insert into public.catalog_state (singleton_id)
values (1);

create trigger catalog_state_set_updated_at
before update on public.catalog_state
for each row execute function app_private.set_updated_at();

create table public.current_prices (
  printing_id uuid not null
    references public.catalog_printings (id) on delete cascade,
  provider text not null,
  currency text not null,
  finish public.card_finish not null,
  amount numeric(14, 4) not null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null,
  source_file_id uuid null
    references public.catalog_source_files (id) on delete set null,
  stale_after timestamptz null,
  primary key (printing_id, provider, currency, finish),
  constraint current_prices_provider_shape check (
    provider = lower(btrim(provider))
    and char_length(provider) between 1 and 64
  ),
  constraint current_prices_currency_shape check (
    currency = upper(btrim(currency))
    and currency ~ '^[A-Z]{3}$'
  ),
  constraint current_prices_finish_known check (
    finish <> 'unknown'::public.card_finish
  ),
  constraint current_prices_amount_nonnegative check (amount >= 0),
  constraint current_prices_temporal_order check (
    ingested_at >= observed_at
    and (stale_after is null or stale_after > observed_at)
  )
);

create index current_prices_printing_idx
  on public.current_prices (printing_id, currency, finish, provider);
create index current_prices_currency_amount_idx
  on public.current_prices (currency, amount, printing_id);
create index current_prices_freshness_idx
  on public.current_prices (provider, currency, observed_at desc);
create index current_prices_source_file_idx
  on public.current_prices (source_file_id)
  where source_file_id is not null;

-- Import-scoped staging is deliberately outside the Data API. Relationships
-- among staged objects are checked before promotion rather than enforced by
-- foreign keys that would make bounded batch order significant.

create table app_private.catalog_stage_sets (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  set_id uuid not null,
  code text not null,
  name text not null,
  set_type text null,
  released_at date null,
  parent_set_id uuid null,
  card_count integer null,
  digital boolean not null,
  foil_only boolean not null,
  nonfoil_only boolean not null,
  icon_svg_uri text null,
  primary key (import_run_id, set_id)
);

create table app_private.catalog_stage_cards (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  oracle_card_id uuid not null,
  name text not null,
  normalized_name text not null,
  mana_cost text null,
  mana_value numeric(10, 3) null,
  type_line text null,
  oracle_text text null,
  colors text[] not null default '{}'::text[],
  color_identity text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  reserved boolean not null,
  primary key (import_run_id, oracle_card_id)
);

create table app_private.catalog_stage_printings (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  printing_id uuid not null,
  oracle_card_id uuid null,
  set_id uuid not null,
  collector_number text not null,
  language text not null,
  printed_name text null,
  rarity text null,
  layout text null,
  released_at date null,
  digital boolean not null,
  promo boolean not null,
  oversized boolean not null,
  variation boolean not null,
  finishes public.card_finish[] not null,
  color_identity text[] not null default '{}'::text[],
  frame_effects text[] not null default '{}'::text[],
  border_color text null,
  artist text null,
  scryfall_uri text null,
  image_status text null,
  default_browse boolean not null,
  primary key (import_run_id, printing_id)
);

create index catalog_stage_printings_set_idx
  on app_private.catalog_stage_printings (import_run_id, set_id);
create index catalog_stage_printings_card_idx
  on app_private.catalog_stage_printings (import_run_id, oracle_card_id)
  where oracle_card_id is not null;

create table app_private.catalog_stage_faces (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  face_id uuid not null,
  printing_id uuid not null,
  face_index smallint not null,
  name text not null,
  mana_cost text null,
  type_line text null,
  oracle_text text null,
  colors text[] not null default '{}'::text[],
  power text null,
  toughness text null,
  loyalty text null,
  defense text null,
  artist text null,
  image_small_uri text null,
  image_normal_uri text null,
  image_large_uri text null,
  image_png_uri text null,
  art_crop_uri text null,
  border_crop_uri text null,
  primary key (import_run_id, printing_id, face_index),
  unique (import_run_id, face_id)
);

create index catalog_stage_faces_printing_idx
  on app_private.catalog_stage_faces (
    import_run_id,
    printing_id,
    face_index
  );

create table app_private.catalog_stage_legalities (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  oracle_card_id uuid not null,
  format_code text not null,
  legality text not null,
  primary key (import_run_id, oracle_card_id, format_code)
);

create table app_private.catalog_stage_external_ids (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  provider text not null,
  identifier_type text not null,
  identifier_value text not null,
  primary key (
    import_run_id,
    provider,
    identifier_type,
    identifier_value
  )
);

create index catalog_stage_external_ids_entity_idx
  on app_private.catalog_stage_external_ids (
    import_run_id,
    entity_type,
    entity_id
  );

create table app_private.catalog_stage_prices (
  import_run_id uuid not null
    references public.catalog_import_runs (id) on delete cascade,
  printing_id uuid not null,
  provider text not null,
  currency text not null,
  finish public.card_finish not null,
  amount numeric(14, 4) not null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null,
  stale_after timestamptz null,
  primary key (
    import_run_id,
    printing_id,
    provider,
    currency,
    finish
  ),
  constraint catalog_stage_prices_amount_nonnegative check (amount >= 0)
);

create index catalog_stage_prices_printing_idx
  on app_private.catalog_stage_prices (import_run_id, printing_id);

comment on table public.catalog_cards is
  'Global oracle-level catalog identity. Human roles are read-only.';
comment on table public.catalog_printings is
  'Global printing identity, including language-specific and non-oracle objects.';
comment on table public.current_prices is
  'Latest non-null provider price observations. Missing prices have no row.';
comment on table public.catalog_state is
  'Singleton active catalog pointer and catalog-sync incident switch.';
comment on table app_private.catalog_stage_printings is
  'Import-scoped normalized staging. Never current catalog truth before promotion.';
