-- Phase 4: versioned deck formats and workspace-scoped deck storage.
--
-- Format identities are stable while rule versions are append-only. A deck is
-- pinned to one exact version so validation never changes silently.

create type public.deck_zone as enum (
  'mainboard',
  'sideboard',
  'commander',
  'companion',
  'maybeboard'
);

create function app_private.valid_deck_tags(p_tags text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_tags is not null
    and cardinality(p_tags) <= 20
    and not exists (
      select 1
      from unnest(p_tags) as tag(value)
      where tag.value is null
        or tag.value <> btrim(tag.value)
        or char_length(tag.value) not between 1 and 40
    )
    and (
      select count(*) = count(distinct lower(tag.value))
      from unnest(p_tags) as tag(value)
    )
$$;

create table public.deck_formats (
  code text primary key,
  game_id uuid not null references public.games (id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint deck_formats_code_shape check (
    code = lower(btrim(code))
    and code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint deck_formats_name_bounded check (
    char_length(btrim(name)) between 1 and 120
  )
);

create index deck_formats_game_active_idx
  on public.deck_formats (game_id, active, name, code);

create trigger deck_formats_set_updated_at
before update on public.deck_formats
for each row execute function app_private.set_updated_at();

create table public.deck_format_versions (
  id uuid primary key default gen_random_uuid(),
  format_code text not null
    references public.deck_formats (code) on delete restrict,
  version integer not null,
  version_key text not null,
  effective_at timestamptz not null,
  minimum_mainboard integer not null,
  maximum_mainboard integer null,
  minimum_deck_size integer not null,
  maximum_deck_size integer null,
  sideboard_max integer not null,
  default_copy_limit integer not null,
  minimum_commander integer not null default 0,
  maximum_commander integer not null default 0,
  companion_max integer not null default 1,
  companion_consumes_sideboard boolean not null default true,
  enforce_color_identity boolean not null default false,
  legality_format_code text not null,
  restricted_copy_limit integer not null default 1,
  scope_note text not null,
  rules_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint deck_format_versions_identity_unique
    unique (format_code, version),
  constraint deck_format_versions_key_unique unique (version_key),
  constraint deck_format_versions_id_format_unique unique (id, format_code),
  constraint deck_format_versions_positive_version check (version > 0),
  constraint deck_format_versions_mainboard_bounds check (
    minimum_mainboard >= 0
    and (
      maximum_mainboard is null
      or maximum_mainboard >= minimum_mainboard
    )
    and minimum_deck_size >= 0
    and (
      maximum_deck_size is null
      or maximum_deck_size >= minimum_deck_size
    )
  ),
  constraint deck_format_versions_zone_bounds check (
    sideboard_max >= 0
    and default_copy_limit >= 1
    and minimum_commander >= 0
    and maximum_commander >= minimum_commander
    and companion_max >= 0
    and restricted_copy_limit >= 1
  ),
  constraint deck_format_versions_key_shape check (
    version_key = lower(btrim(version_key))
    and char_length(version_key) between 3 and 120
    and version_key ~ '^[a-z0-9][a-z0-9._-]+$'
  ),
  constraint deck_format_versions_legality_shape check (
    legality_format_code = lower(btrim(legality_format_code))
    and legality_format_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint deck_format_versions_scope_bounded check (
    char_length(btrim(scope_note)) between 1 and 1000
  ),
  constraint deck_format_versions_metadata_bounded check (
    jsonb_typeof(rules_metadata) = 'object'
    and pg_column_size(rules_metadata) <= 16384
  )
);

create index deck_format_versions_latest_idx
  on public.deck_format_versions (format_code, version desc, id);

create function app_private.reject_deck_format_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_deck_format_version_append_only';
end;
$$;

create trigger deck_format_versions_append_only
before update or delete on public.deck_format_versions
for each row execute function app_private.reject_deck_format_version_mutation();

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,
  game_id uuid not null references public.games (id) on delete restrict,
  format_code text not null
    references public.deck_formats (code) on delete restrict,
  format_version_id uuid not null,
  name text not null,
  slug text not null,
  description text null,
  notes text null,
  tags text[] not null default '{}'::text[],
  cover_printing_id uuid null
    references public.catalog_printings (id) on delete restrict,
  visibility public.visibility not null default 'private',
  status public.resource_status not null default 'active',
  created_by_user_id uuid not null
    references auth.users (id) on delete restrict,
  current_revision integer not null default 0,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint decks_workspace_id_id_unique unique (workspace_id, id),
  constraint decks_format_version_fk
    foreign key (format_version_id, format_code)
    references public.deck_format_versions (id, format_code)
    on delete restrict,
  constraint decks_name_bounded check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint decks_slug_shape check (
    slug = lower(slug)
    and char_length(slug) between 3 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint decks_description_bounded check (
    description is null or char_length(description) <= 4000
  ),
  constraint decks_notes_bounded check (
    notes is null or char_length(notes) <= 8000
  ),
  constraint decks_current_revision_nonnegative check (
    current_revision >= 0
  ),
  constraint decks_tags_bounded check (
    app_private.valid_deck_tags(tags)
  ),
  constraint decks_status_timestamps check (
    (
      status = 'active'
      and archived_at is null
      and deleted_at is null
    )
    or (
      status = 'archived'
      and archived_at is not null
      and deleted_at is null
    )
    or (
      status = 'deleted'
      and deleted_at is not null
    )
  )
);

create unique index decks_workspace_slug_open_idx
  on public.decks (workspace_id, lower(slug))
  where status <> 'deleted'::public.resource_status;
create index decks_workspace_status_updated_idx
  on public.decks (workspace_id, status, updated_at desc, id);
create index decks_game_format_idx
  on public.decks (game_id, format_code, format_version_id);
create index decks_created_by_idx
  on public.decks (created_by_user_id);
create index decks_cover_printing_idx
  on public.decks (cover_printing_id)
  where cover_printing_id is not null;

create trigger decks_set_updated_at
before update on public.decks
for each row execute function app_private.set_updated_at();

create table public.deck_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deck_id uuid not null,
  card_id uuid not null
    references public.catalog_cards (id) on delete restrict,
  zone public.deck_zone not null,
  quantity integer not null,
  preferred_printing_id uuid null
    references public.catalog_printings (id) on delete restrict,
  preferred_finish public.card_finish null,
  sort_order integer not null default 0,
  notes text null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint deck_entries_deck_fk
    foreign key (workspace_id, deck_id)
    references public.decks (workspace_id, id)
    on delete restrict,
  constraint deck_entries_deck_card_zone_unique
    unique (deck_id, card_id, zone),
  constraint deck_entries_quantity_bounded check (
    quantity between 1 and 10000
  ),
  constraint deck_entries_preference_pair check (
    (preferred_printing_id is null) = (preferred_finish is null)
    and (
      preferred_finish is null
      or preferred_finish <> 'unknown'::public.card_finish
    )
  ),
  constraint deck_entries_sort_order_bounded check (
    sort_order between 0 and 1000000
  ),
  constraint deck_entries_notes_bounded check (
    notes is null or char_length(notes) <= 2000
  )
);

create index deck_entries_workspace_deck_zone_idx
  on public.deck_entries (
    workspace_id,
    deck_id,
    zone,
    sort_order,
    id
  );
create index deck_entries_card_idx
  on public.deck_entries (card_id, deck_id);
create index deck_entries_preferred_printing_idx
  on public.deck_entries (preferred_printing_id, preferred_finish)
  where preferred_printing_id is not null;

create trigger deck_entries_set_updated_at
before update on public.deck_entries
for each row execute function app_private.set_updated_at();

create table public.deck_inventory_sources (
  workspace_id uuid not null,
  deck_id uuid not null,
  collection_id uuid not null,
  priority smallint not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (deck_id, collection_id),
  constraint deck_inventory_sources_deck_fk
    foreign key (workspace_id, deck_id)
    references public.decks (workspace_id, id)
    on delete restrict,
  constraint deck_inventory_sources_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict,
  constraint deck_inventory_sources_priority_unique
    unique (deck_id, priority),
  constraint deck_inventory_sources_priority_bounded check (
    priority between 0 and 999
  )
);

create index deck_inventory_sources_collection_idx
  on public.deck_inventory_sources (
    workspace_id,
    collection_id,
    deck_id
  );

create table public.deck_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deck_id uuid not null,
  revision integer not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  reason text not null,
  content_hash text not null,
  format_code text not null,
  rules_version_id uuid not null
    references public.deck_format_versions (id) on delete restrict,
  catalog_version text null,
  snapshot jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint deck_revisions_deck_fk
    foreign key (workspace_id, deck_id)
    references public.decks (workspace_id, id)
    on delete restrict,
  constraint deck_revisions_deck_revision_unique
    unique (deck_id, revision),
  constraint deck_revisions_id_deck_unique unique (id, deck_id),
  constraint deck_revisions_rules_format_fk
    foreign key (rules_version_id, format_code)
    references public.deck_format_versions (id, format_code)
    on delete restrict,
  constraint deck_revisions_revision_positive check (revision > 0),
  constraint deck_revisions_reason_shape check (
    reason = lower(btrim(reason))
    and reason ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint deck_revisions_hash_shape check (
    content_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint deck_revisions_catalog_version_bounded check (
    catalog_version is null
    or char_length(catalog_version) between 1 and 160
  ),
  constraint deck_revisions_snapshot_bounded check (
    jsonb_typeof(snapshot) = 'object'
    and pg_column_size(snapshot) <= 41943040
  )
);

create index deck_revisions_workspace_deck_idx
  on public.deck_revisions (workspace_id, deck_id, revision desc);
create index deck_revisions_rules_catalog_idx
  on public.deck_revisions (rules_version_id, catalog_version);

create function app_private.validate_deck_revision_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_computed_hash text;
begin
  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = new.deck_id;

  v_computed_hash := encode(
    extensions.digest(
      convert_to((new.snapshot -> 'logical_content')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_deck.id is null
    or new.workspace_id <> v_deck.workspace_id
    or new.revision <> v_deck.current_revision
    or new.format_code <> v_deck.format_code
    or new.rules_version_id <> v_deck.format_version_id
    or new.content_hash <> v_computed_hash
    or new.snapshot #>> '{deck,deck_id}' <> new.deck_id::text
    or new.snapshot #>> '{deck,format_code}' <> new.format_code
    or new.snapshot #>> '{deck,format_version_id}'
      <> new.rules_version_id::text
    or jsonb_typeof(new.snapshot -> 'logical_content') <> 'object'
  then
    raise exception using
      errcode = '23514',
      message = 'talence_deck_revision_provenance_invalid';
  end if;

  return new;
end;
$$;

create trigger deck_revisions_validate_provenance
before insert on public.deck_revisions
for each row execute function app_private.validate_deck_revision_provenance();

create function app_private.reject_deck_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_deck_revision_immutable';
end;
$$;

create trigger deck_revisions_immutable
before update or delete on public.deck_revisions
for each row execute function app_private.reject_deck_revision_mutation();

create table public.deck_validation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deck_id uuid not null,
  deck_revision_id uuid not null,
  revision integer not null,
  content_hash text not null,
  format_code text not null,
  rules_version_id uuid not null
    references public.deck_format_versions (id) on delete restrict,
  catalog_version text not null,
  result jsonb not null,
  evaluated_by_user_id uuid not null
    references auth.users (id) on delete restrict,
  evaluated_at timestamptz not null default statement_timestamp(),
  constraint deck_validation_runs_deck_fk
    foreign key (workspace_id, deck_id)
    references public.decks (workspace_id, id)
    on delete restrict,
  constraint deck_validation_runs_revision_fk
    foreign key (deck_revision_id, deck_id)
    references public.deck_revisions (id, deck_id)
    on delete restrict,
  constraint deck_validation_runs_revision_number_fk
    foreign key (deck_id, revision)
    references public.deck_revisions (deck_id, revision)
    on delete restrict,
  constraint deck_validation_runs_rules_format_fk
    foreign key (rules_version_id, format_code)
    references public.deck_format_versions (id, format_code)
    on delete restrict,
  constraint deck_validation_runs_identity_unique
    unique (deck_id, content_hash, rules_version_id, catalog_version),
  constraint deck_validation_runs_hash_shape check (
    content_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint deck_validation_runs_catalog_version_bounded check (
    char_length(catalog_version) between 1 and 160
  ),
  constraint deck_validation_runs_result_bounded check (
    jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 1048576
  )
);

create index deck_validation_runs_workspace_deck_idx
  on public.deck_validation_runs (
    workspace_id,
    deck_id,
    evaluated_at desc,
    id
  );

create function app_private.validate_deck_validation_run_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_revision public.deck_revisions;
begin
  select revision_row.*
  into v_revision
  from public.deck_revisions as revision_row
  where revision_row.id = new.deck_revision_id;

  if v_revision.id is null
    or new.workspace_id <> v_revision.workspace_id
    or new.deck_id <> v_revision.deck_id
    or new.revision <> v_revision.revision
    or new.content_hash <> v_revision.content_hash
    or new.format_code <> v_revision.format_code
    or new.rules_version_id <> v_revision.rules_version_id
  then
    raise exception using
      errcode = '23514',
      message = 'talence_deck_validation_provenance_invalid';
  end if;

  return new;
end;
$$;

create trigger deck_validation_runs_validate_provenance
before insert on public.deck_validation_runs
for each row execute function app_private.validate_deck_validation_run_provenance();

create function app_private.reject_deck_validation_run_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_deck_validation_run_immutable';
end;
$$;

create trigger deck_validation_runs_immutable
before update or delete on public.deck_validation_runs
for each row execute function app_private.reject_deck_validation_run_mutation();

-- A transaction-local, unforgeable preservation context lets trusted deck
-- mutations copy identities that were valid when originally saved, even if
-- the catalog later deactivates them. The token is backed by private rows tied
-- to both the backend and transaction; a caller-set custom GUC alone grants
-- nothing.
create table app_private.deck_entry_preservation_contexts (
  token uuid primary key,
  backend_pid integer not null,
  transaction_id bigint not null,
  target_deck_id uuid not null,
  source_deck_id uuid not null,
  allowed_cover_printing_id uuid,
  created_at timestamptz not null default statement_timestamp()
);

create table app_private.deck_entry_preservation_items (
  token uuid not null
    references app_private.deck_entry_preservation_contexts (token)
    on delete cascade,
  source_entry_id uuid not null,
  card_id uuid not null,
  zone public.deck_zone not null,
  preferred_printing_id uuid,
  preferred_finish public.card_finish,
  primary key (token, source_entry_id),
  constraint deck_entry_preservation_preference_pair check (
    (preferred_printing_id is null) = (preferred_finish is null)
  )
);

create index deck_entry_preservation_items_card_idx
  on app_private.deck_entry_preservation_items (
    token,
    card_id,
    zone,
    preferred_printing_id,
    preferred_finish
  );

create function app_private.begin_deck_entry_preservation(
  p_target_deck_id uuid,
  p_source_deck_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_token uuid := extensions.gen_random_uuid();
begin
  insert into app_private.deck_entry_preservation_contexts (
    token,
    backend_pid,
    transaction_id,
    target_deck_id,
    source_deck_id,
    allowed_cover_printing_id
  )
  select
    v_token,
    pg_backend_pid(),
    txid_current(),
    p_target_deck_id,
    source.id,
    source.cover_printing_id
  from public.decks as source
  join public.decks as target
    on target.id = p_target_deck_id
    and target.workspace_id = source.workspace_id
    and target.game_id = source.game_id
  where source.id = p_source_deck_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  insert into app_private.deck_entry_preservation_items (
    token,
    source_entry_id,
    card_id,
    zone,
    preferred_printing_id,
    preferred_finish
  )
  select
    v_token,
    entry.id,
    entry.card_id,
    entry.zone,
    entry.preferred_printing_id,
    entry.preferred_finish
  from public.deck_entries as entry
  where entry.deck_id = p_source_deck_id;

  perform set_config(
    'talence.deck_entry_preservation_token',
    v_token::text,
    true
  );
  return v_token;
end;
$$;

create function app_private.end_deck_entry_preservation(p_token uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  delete from app_private.deck_entry_preservation_contexts
  where token = p_token
    and backend_pid = pg_backend_pid()
    and transaction_id = txid_current();

  perform set_config(
    'talence.deck_entry_preservation_token',
    '',
    true
  );
end;
$$;

create function app_private.deck_entry_preservation_allows(
  p_target_deck_id uuid,
  p_card_id uuid,
  p_zone public.deck_zone,
  p_preferred_printing_id uuid default null,
  p_preferred_finish public.card_finish default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_token uuid;
begin
  v_token := nullif(
    current_setting(
      'talence.deck_entry_preservation_token',
      true
    ),
    ''
  )::uuid;

  return v_token is not null
    and exists (
      select 1
      from app_private.deck_entry_preservation_contexts as context
      join app_private.deck_entry_preservation_items as item
        on item.token = context.token
      where context.token = v_token
        and context.backend_pid = pg_backend_pid()
        and context.transaction_id = txid_current()
        and context.target_deck_id = p_target_deck_id
        and item.card_id = p_card_id
        and item.zone = p_zone
        and (
          p_preferred_printing_id is null
          or (
            item.preferred_printing_id = p_preferred_printing_id
            and item.preferred_finish = p_preferred_finish
          )
        )
    );
exception
  when others then
    return false;
end;
$$;

create function app_private.deck_cover_preservation_allows(
  p_target_deck_id uuid,
  p_cover_printing_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_token uuid;
begin
  v_token := nullif(
    current_setting(
      'talence.deck_entry_preservation_token',
      true
    ),
    ''
  )::uuid;

  return v_token is not null
    and exists (
      select 1
      from app_private.deck_entry_preservation_contexts as context
      where context.token = v_token
        and context.backend_pid = pg_backend_pid()
        and context.transaction_id = txid_current()
        and context.target_deck_id = p_target_deck_id
        and context.allowed_cover_printing_id = p_cover_printing_id
    );
exception
  when others then
    return false;
end;
$$;

create function app_private.validate_deck_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_format_game_id uuid;
  v_cover_card_id uuid;
  v_cover_game_id uuid;
  v_cover_active boolean;
begin
  select format.game_id
  into v_format_game_id
  from public.deck_formats as format
  where format.code = new.format_code;

  if v_format_game_id is null
    or v_format_game_id <> new.game_id
  then
    raise exception using
      errcode = '23514',
      message = 'talence_deck_format_game_mismatch';
  end if;

  if new.cover_printing_id is not null then
    select printing.card_id, printing.game_id, printing.active
    into v_cover_card_id, v_cover_game_id, v_cover_active
    from public.catalog_printings as printing
    where printing.id = new.cover_printing_id;

    if v_cover_card_id is null
      or v_cover_game_id <> new.game_id
      or (
        not v_cover_active
        and (
          tg_op = 'INSERT'
          or old.cover_printing_id is distinct from new.cover_printing_id
        )
        and not app_private.deck_cover_preservation_allows(
          new.id,
          new.cover_printing_id
        )
      )
      or not exists (
        select 1
        from public.deck_entries as entry
        where entry.deck_id = new.id
          and entry.card_id = v_cover_card_id
      )
    then
      raise exception using
        errcode = '23514',
        message = 'talence_deck_cover_mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger decks_validate_integrity
before insert or update on public.decks
for each row execute function app_private.validate_deck_integrity();

create function app_private.validate_deck_entry_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_card_game_id uuid;
  v_card_active boolean;
  v_printing_card_id uuid;
  v_printing_game_id uuid;
  v_printing_finishes public.card_finish[];
  v_printing_active boolean;
begin
  if tg_op = 'UPDATE'
    and old.card_id is distinct from new.card_id
  then
    raise exception using
      errcode = '55000',
      message = 'talence_deck_entry_card_immutable';
  end if;

  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = new.deck_id;

  select card.game_id, card.active
  into v_card_game_id, v_card_active
  from public.catalog_cards as card
  where card.id = new.card_id;

  if v_deck.id is null
    or v_deck.workspace_id <> new.workspace_id
    or v_card_game_id is null
    or v_card_game_id <> v_deck.game_id
    or (
      not v_card_active
      and (
        tg_op = 'INSERT'
        or old.card_id is distinct from new.card_id
      )
      and not app_private.deck_entry_preservation_allows(
        new.deck_id,
        new.card_id,
        new.zone
      )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_deck_entry_game_mismatch';
  end if;

  if new.preferred_printing_id is not null then
    select
      printing.card_id,
      printing.game_id,
      printing.finishes,
      printing.active
    into
      v_printing_card_id,
      v_printing_game_id,
      v_printing_finishes,
      v_printing_active
    from public.catalog_printings as printing
    where printing.id = new.preferred_printing_id;

    if v_printing_card_id is null
      or v_printing_card_id <> new.card_id
      or v_printing_game_id <> v_deck.game_id
      or not (new.preferred_finish = any(v_printing_finishes))
      or (
        not v_printing_active
        and (
          tg_op = 'INSERT'
          or old.preferred_printing_id
            is distinct from new.preferred_printing_id
          or old.preferred_finish is distinct from new.preferred_finish
        )
        and not app_private.deck_entry_preservation_allows(
          new.deck_id,
          new.card_id,
          new.zone,
          new.preferred_printing_id,
          new.preferred_finish
        )
      )
    then
      raise exception using
        errcode = '23514',
        message = 'talence_deck_preferred_printing_mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger deck_entries_validate_integrity
before insert or update on public.deck_entries
for each row execute function app_private.validate_deck_entry_integrity();

create function app_private.clear_deck_cover_before_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.decks as deck
    join public.catalog_printings as printing
      on printing.id = deck.cover_printing_id
    where deck.id = old.deck_id
      and printing.card_id = old.card_id
  )
    and not exists (
      select 1
      from public.deck_entries as other_entry
      where other_entry.deck_id = old.deck_id
        and other_entry.card_id = old.card_id
        and other_entry.id <> old.id
    )
  then
    update public.decks
    set cover_printing_id = null
    where id = old.deck_id;
  end if;

  return old;
end;
$$;

create trigger deck_entries_clear_cover_before_delete
before delete on public.deck_entries
for each row execute function app_private.clear_deck_cover_before_entry_delete();

create function app_private.lock_collection_deck_source_scope(
  p_collection_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_collection_id is null then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_id_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'talence:collection-deck-source:' || p_collection_id::text,
      0
    )
  );
end;
$$;

create function app_private.validate_deck_source_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_collection public.collections;
begin
  perform app_private.lock_collection_deck_source_scope(
    new.collection_id
  );

  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = new.deck_id;

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = new.collection_id;

  if v_deck.id is null
    or v_collection.id is null
    or new.workspace_id <> v_deck.workspace_id
    or v_collection.workspace_id <> v_deck.workspace_id
    or v_collection.game_id <> v_deck.game_id
    or v_collection.status = 'deleted'::public.resource_status
  then
    raise exception using
      errcode = '23514',
      message = 'talence_deck_source_unavailable';
  end if;

  return new;
end;
$$;

create trigger deck_inventory_sources_validate_integrity
before insert or update on public.deck_inventory_sources
for each row execute function app_private.validate_deck_source_integrity();

create function app_private.guard_collection_deck_source_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.status <> 'deleted'::public.resource_status
    and new.status = 'deleted'::public.resource_status
  then
    perform app_private.lock_collection_deck_source_scope(old.id);

    if exists (
      select 1
      from public.deck_inventory_sources as source
      join public.decks as deck on deck.id = source.deck_id
      where source.collection_id = old.id
        and deck.status <> 'deleted'::public.resource_status
    )
    then
      raise exception using
        errcode = '55000',
        message = 'talence_collection_referenced_by_deck';
    end if;
  end if;

  return new;
end;
$$;

create trigger collections_guard_deck_source_lifecycle
before update of status on public.collections
for each row execute function app_private.guard_collection_deck_source_lifecycle();

create function app_private.reject_deck_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_deck_hard_delete_forbidden';
end;
$$;

create trigger decks_reject_hard_delete
before delete on public.decks
for each row execute function app_private.reject_deck_hard_delete();

-- Practical baseline rules. These are advisory application rules, not an
-- exhaustive implementation of Magic Comprehensive Rules or tournament policy.
insert into public.deck_formats (code, game_id, name)
values
  ('standard', '00000000-0000-4000-8000-000000000001', 'Standard'),
  ('pioneer', '00000000-0000-4000-8000-000000000001', 'Pioneer'),
  ('modern', '00000000-0000-4000-8000-000000000001', 'Modern'),
  ('legacy', '00000000-0000-4000-8000-000000000001', 'Legacy'),
  ('vintage', '00000000-0000-4000-8000-000000000001', 'Vintage'),
  ('pauper', '00000000-0000-4000-8000-000000000001', 'Pauper'),
  ('commander', '00000000-0000-4000-8000-000000000001', 'Commander');

insert into public.deck_format_versions (
  id,
  format_code,
  version,
  version_key,
  effective_at,
  minimum_mainboard,
  maximum_mainboard,
  minimum_deck_size,
  maximum_deck_size,
  sideboard_max,
  default_copy_limit,
  minimum_commander,
  maximum_commander,
  companion_max,
  companion_consumes_sideboard,
  enforce_color_identity,
  legality_format_code,
  restricted_copy_limit,
  scope_note,
  rules_metadata
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'standard', 1, 'standard-baseline-v1', '2026-07-26T00:00:00Z',
    60, null, 60, null, 15, 4, 0, 0, 1, true, false, 'standard', 1,
    'Advisory baseline: deck size, sideboard, copy limits, and ingested Standard legality. Tournament policy and the Comprehensive Rules remain out of scope.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"official_url":"https://magic.wizards.com/en/formats/standard","verified_on":"2026-07-26"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'pioneer', 1, 'pioneer-baseline-v1', '2026-07-26T00:00:00Z',
    60, null, 60, null, 15, 4, 0, 0, 1, true, false, 'pioneer', 1,
    'Advisory baseline: deck size, sideboard, copy limits, and ingested Pioneer legality. Tournament policy and the Comprehensive Rules remain out of scope.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"official_url":"https://magic.wizards.com/en/formats/pioneer","verified_on":"2026-07-26"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'modern', 1, 'modern-baseline-v1', '2026-07-26T00:00:00Z',
    60, null, 60, null, 15, 4, 0, 0, 1, true, false, 'modern', 1,
    'Advisory baseline: deck size, sideboard, copy limits, and ingested Modern legality. Tournament policy and the Comprehensive Rules remain out of scope.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"official_url":"https://magic.wizards.com/en/formats/modern","verified_on":"2026-07-26"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'legacy', 1, 'legacy-baseline-v1', '2026-07-26T00:00:00Z',
    60, null, 60, null, 15, 4, 0, 0, 1, true, false, 'legacy', 1,
    'Advisory baseline: deck size, sideboard, copy limits, and ingested Legacy legality. Tournament policy and the Comprehensive Rules remain out of scope.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"official_url":"https://magic.wizards.com/en/formats/legacy","verified_on":"2026-07-26"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    'vintage', 1, 'vintage-baseline-v1', '2026-07-26T00:00:00Z',
    60, null, 60, null, 15, 4, 0, 0, 1, true, false, 'vintage', 1,
    'Advisory baseline: deck size, sideboard, ordinary and restricted copy limits, and ingested Vintage legality. Tournament policy and the Comprehensive Rules remain out of scope.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"official_url":"https://magic.wizards.com/en/formats/vintage","verified_on":"2026-07-26"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    'pauper', 1, 'pauper-baseline-v1', '2026-07-26T00:00:00Z',
    60, null, 60, null, 15, 4, 0, 0, 1, true, false, 'pauper', 1,
    'Advisory baseline: deck size, sideboard, copy limits, and ingested Pauper legality. Rarity-history nuance, tournament policy, and the Comprehensive Rules remain out of scope.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"official_url":"https://magic.wizards.com/en/formats/pauper","verified_on":"2026-07-26"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-000000000007',
    'commander', 1, 'commander-baseline-v1', '2026-07-26T00:00:00Z',
    0, null, 100, 100, 0, 1, 1, 2, 1, false, true, 'commander', 1,
    'Advisory Commander baseline: exactly 100 consuming cards, one or two commanders, singleton copy limit, ingested Commander legality, and commander color identity. Partner/background pairing and exhaustive commander eligibility rules are intentionally not modeled.',
    '{"copy_exemptions":["basic_land","oracle_any_number"],"commander_model":"one_or_two_with_pairing_advisory","official_url":"https://magic.wizards.com/en/formats/commander","verified_on":"2026-07-26"}'::jsonb
  );

alter table public.deck_formats enable row level security;
alter table public.deck_format_versions enable row level security;
alter table public.decks enable row level security;
alter table public.deck_entries enable row level security;
alter table public.deck_inventory_sources enable row level security;
alter table public.deck_revisions enable row level security;
alter table public.deck_validation_runs enable row level security;

revoke all privileges on table public.deck_formats
  from public, anon, authenticated;
revoke all privileges on table public.deck_format_versions
  from public, anon, authenticated;
revoke all privileges on table public.decks
  from public, anon, authenticated;
revoke all privileges on table public.deck_entries
  from public, anon, authenticated;
revoke all privileges on table public.deck_inventory_sources
  from public, anon, authenticated;
revoke all privileges on table public.deck_revisions
  from public, anon, authenticated;
revoke all privileges on table public.deck_validation_runs
  from public, anon, authenticated;
revoke all privileges on table app_private.deck_entry_preservation_contexts
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.deck_entry_preservation_items
  from public, anon, authenticated, service_role;

revoke all on function app_private.valid_deck_tags(text[])
  from public, anon, authenticated;
revoke all on function app_private.reject_deck_format_version_mutation()
  from public, anon, authenticated;
revoke all on function app_private.begin_deck_entry_preservation(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.end_deck_entry_preservation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.deck_entry_preservation_allows(
  uuid,
  uuid,
  public.deck_zone,
  uuid,
  public.card_finish
)
  from public, anon, authenticated, service_role;
revoke all on function app_private.deck_cover_preservation_allows(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.validate_deck_integrity()
  from public, anon, authenticated;
revoke all on function app_private.validate_deck_entry_integrity()
  from public, anon, authenticated;
revoke all on function app_private.clear_deck_cover_before_entry_delete()
  from public, anon, authenticated;
revoke all on function app_private.lock_collection_deck_source_scope(uuid)
  from public, anon, authenticated;
revoke all on function app_private.validate_deck_source_integrity()
  from public, anon, authenticated;
revoke all on function app_private.guard_collection_deck_source_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.reject_deck_revision_mutation()
  from public, anon, authenticated;
revoke all on function app_private.validate_deck_revision_provenance()
  from public, anon, authenticated;
revoke all on function app_private.reject_deck_validation_run_mutation()
  from public, anon, authenticated;
revoke all on function app_private.validate_deck_validation_run_provenance()
  from public, anon, authenticated;
revoke all on function app_private.reject_deck_hard_delete()
  from public, anon, authenticated;

comment on table public.deck_formats is
  'Stable system-written format identities. Human sessions have read-only access.';
comment on table public.deck_format_versions is
  'Append-only practical baseline rules. Every deck pins one exact version.';
comment on table public.decks is
  'Workspace-scoped private-beta decks with soft lifecycle semantics.';
comment on table public.deck_entries is
  'Oracle-level requirements; optional preferred printings must match the oracle card.';
comment on table public.deck_inventory_sources is
  'Ordered non-deleted collection sources used for finite ownership allocation; archived sources remain explicit and count.';
comment on table public.deck_revisions is
  'Immutable canonical deck snapshots with exact rules/catalog version provenance.';
comment on table public.deck_validation_runs is
  'Immutable advisory results pinned to one content hash, rules version, and catalog version.';
