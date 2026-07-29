-- Phase 4: bounded human mutations and immutable deck revisions.

create function app_private.deck_slug_base(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select left(
    trim(
      both '-'
      from regexp_replace(
        regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'),
        '-+',
        '-',
        'g'
      )
    ),
    60
  )
$$;

create function app_private.normalize_deck_tags(p_tags text[])
returns text[]
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_tags text[];
begin
  if p_tags is null then
    return '{}'::text[];
  end if;

  select coalesce(
    array_agg(btrim(tag.value) order by tag.ordinality),
    '{}'::text[]
  )
  into v_tags
  from unnest(p_tags) with ordinality as tag(value, ordinality);

  if not app_private.valid_deck_tags(v_tags) then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_tags_invalid';
  end if;

  return v_tags;
end;
$$;

create function app_private.assert_human_deck_role(
  p_deck_id uuid,
  p_minimum_role public.membership_role,
  p_allow_archived boolean default false
)
returns public.decks
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
begin
  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = p_deck_id;

  if v_deck.id is null
    or not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      v_deck.workspace_id,
      p_minimum_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  if v_deck.status = 'deleted'::public.resource_status then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  if not p_allow_archived
    and v_deck.status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = '55000',
      message = 'talence_deck_not_active';
  end if;

  return v_deck;
end;
$$;

create function app_private.latest_deck_format_version(
  p_format_code text
)
returns public.deck_format_versions
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_version public.deck_format_versions;
begin
  select version_row.*
  into v_version
  from public.deck_format_versions as version_row
  join public.deck_formats as format
    on format.code = version_row.format_code
  where version_row.format_code = lower(btrim(p_format_code))
    and format.active
    and version_row.effective_at <= statement_timestamp()
  order by version_row.version desc, version_row.id
  limit 1;

  if v_version.id is null then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_format_invalid';
  end if;

  return v_version;
end;
$$;

create function app_private.deck_mutation_json(p_deck_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'deck_id', deck.id,
    'workspace_id', deck.workspace_id,
    'game_id', deck.game_id,
    'name', deck.name,
    'slug', deck.slug,
    'description', deck.description,
    'notes', deck.notes,
    'tags', deck.tags,
    'format_code', deck.format_code,
    'format_version_id', deck.format_version_id,
    'rules_version', version_row.version,
    'rules_version_key', version_row.version_key,
    'cover_printing_id', deck.cover_printing_id,
    'status', deck.status,
    'current_revision', deck.current_revision,
    'created_at', deck.created_at,
    'updated_at', deck.updated_at,
    'archived_at', deck.archived_at,
    'deleted_at', deck.deleted_at
  )
  from public.decks as deck
  join public.deck_format_versions as version_row
    on version_row.id = deck.format_version_id
  where deck.id = p_deck_id
$$;

create function app_private.deck_entry_mutation_json(p_entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'entry_id', entry.id,
    'deck_id', entry.deck_id,
    'card_id', entry.card_id,
    'zone', entry.zone,
    'quantity', entry.quantity,
    'preferred_printing_id', entry.preferred_printing_id,
    'preferred_finish', entry.preferred_finish,
    'sort_order', entry.sort_order,
    'notes', entry.notes,
    'created_at', entry.created_at,
    'updated_at', entry.updated_at
  )
  from public.deck_entries as entry
  where entry.id = p_entry_id
$$;

create function app_private.deck_logical_content(p_deck_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'deck',
      jsonb_build_object(
        'game_id', deck.game_id,
        'format_code', deck.format_code,
        'format_version_id', deck.format_version_id,
        'name', deck.name,
        'description', deck.description,
        'notes', deck.notes,
        'tags', deck.tags,
        'cover_printing_id', deck.cover_printing_id,
        'visibility', deck.visibility,
        'status', deck.status
      ),
    'entries',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'card_id', entry.card_id,
              'zone', entry.zone,
              'quantity', entry.quantity,
              'preferred_printing_id', entry.preferred_printing_id,
              'preferred_finish', entry.preferred_finish,
              'notes', entry.notes
            )
            order by
              entry.zone::text,
              entry.card_id,
              entry.preferred_printing_id,
              entry.preferred_finish::text
          )
          from public.deck_entries as entry
          where entry.deck_id = deck.id
        ),
        '[]'::jsonb
      ),
    'inventory_sources',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'collection_id', source.collection_id,
              'priority', source.priority
            )
            order by source.priority, source.collection_id
          )
          from public.deck_inventory_sources as source
          where source.deck_id = deck.id
        ),
        '[]'::jsonb
      )
  )
  from public.decks as deck
  where deck.id = p_deck_id
$$;

create function app_private.deck_content_snapshot(p_deck_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'logical_content', app_private.deck_logical_content(deck.id),
    'deck',
      jsonb_build_object(
        'deck_id', deck.id,
        'workspace_id', deck.workspace_id,
        'game_id', deck.game_id,
        'format_code', deck.format_code,
        'format_version_id', deck.format_version_id,
        'name', deck.name,
        'slug', deck.slug,
        'description', deck.description,
        'notes', deck.notes,
        'tags', deck.tags,
        'cover_printing_id', deck.cover_printing_id,
        'visibility', deck.visibility,
        'status', deck.status
      ),
    'entries',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'entry_id', entry.id,
              'card_id', entry.card_id,
              'zone', entry.zone,
              'sort_order', entry.sort_order
            )
            order by
              entry.zone::text,
              entry.sort_order,
              entry.card_id,
              entry.id
          )
          from public.deck_entries as entry
          where entry.deck_id = deck.id
        ),
        '[]'::jsonb
      ),
    'inventory_sources',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'collection_id', source.collection_id,
              'priority', source.priority
            )
            order by source.priority, source.collection_id
          )
          from public.deck_inventory_sources as source
          where source.deck_id = deck.id
        ),
        '[]'::jsonb
      )
  )
  from public.decks as deck
  where deck.id = p_deck_id
$$;

create function app_private.deck_content_hash(p_deck_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(app_private.deck_logical_content(p_deck_id)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create function app_private.lock_deck_catalog_generation()
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_catalog_version text;
begin
  select coalesce(
    state.active_catalog_version,
    'catalog-unversioned'
  )
  into v_catalog_version
  from public.catalog_state as state
  where state.singleton_id = 1
  for share;

  return coalesce(v_catalog_version, 'catalog-unversioned');
end;
$$;

create function app_private.record_deck_revision(
  p_deck_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_snapshot jsonb;
  v_hash text;
  v_catalog_version text;
  v_revision_id uuid;
begin
  if p_reason is null
    or lower(btrim(p_reason))
      !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_revision_reason_invalid';
  end if;

  update public.decks
  set current_revision = current_revision + 1
  where id = p_deck_id
  returning *
  into v_deck;

  if v_deck.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  -- Backstop every caller with the same generation lock used before
  -- catalog-backed mutation triggers. Promotion locks this singleton FOR
  -- UPDATE before changing catalog rows, so the revision tag and validated
  -- catalog state cannot straddle a promotion.
  v_catalog_version :=
    app_private.lock_deck_catalog_generation();

  v_snapshot := app_private.deck_content_snapshot(p_deck_id);
  if octet_length((v_snapshot -> 'logical_content')::text) > 33554432
    or pg_column_size(v_snapshot) > 41943040
  then
    raise exception using
      errcode = '22001',
      message = 'talence_deck_content_too_large';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to((v_snapshot -> 'logical_content')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.deck_revisions (
    workspace_id,
    deck_id,
    revision,
    actor_user_id,
    reason,
    content_hash,
    format_code,
    rules_version_id,
    catalog_version,
    snapshot
  )
  values (
    v_deck.workspace_id,
    v_deck.id,
    v_deck.current_revision,
    auth.uid(),
    lower(btrim(p_reason)),
    v_hash,
    v_deck.format_code,
    v_deck.format_version_id,
    v_catalog_version,
    v_snapshot
  )
  returning id into v_revision_id;

  return jsonb_build_object(
    'revision_id', v_revision_id,
    'revision', v_deck.current_revision,
    'content_hash', v_hash,
    'rules_version_id', v_deck.format_version_id,
    'catalog_version', v_catalog_version
  );
end;
$$;

create function app_private.lock_deck_for_mutation(
  p_deck_id uuid,
  p_expected_revision integer,
  p_allow_archived boolean default false
)
returns public.decks
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'editor'::public.membership_role,
    p_allow_archived
  );

  -- Reject a guessed future revision before waiting. The same comparison is
  -- repeated after the row lock to reject a revision that changed meanwhile.
  if p_expected_revision is null
    or v_deck.current_revision <> p_expected_revision
  then
    raise exception using
      errcode = '40001',
      message = 'talence_deck_stale';
  end if;

  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = p_deck_id
  for update;

  -- The first authorization check can precede a wait on the deck row. Repeat
  -- admission, membership, and lifecycle checks against the locked row so a
  -- caller cannot carry pre-wait authority or status into the mutation.
  if v_deck.id is null
    or not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      v_deck.workspace_id,
      'editor'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  if v_deck.status = 'deleted'::public.resource_status then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  if not p_allow_archived
    and v_deck.status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = '55000',
      message = 'talence_deck_not_active';
  end if;

  if p_expected_revision is null
    or v_deck.current_revision <> p_expected_revision
  then
    raise exception using
      errcode = '40001',
      message = 'talence_deck_stale';
  end if;

  perform app_private.lock_deck_catalog_generation();

  return v_deck;
end;
$$;

create function public.deck_create(
  p_workspace_id uuid,
  p_name text,
  p_format_code text,
  p_description text default null,
  p_notes text default null,
  p_tags text[] default '{}'::text[],
  p_collection_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.deck_format_versions;
  v_format public.deck_formats;
  v_deck_id uuid := gen_random_uuid();
  v_slug text;
  v_tags text[];
  v_collection_count integer;
  v_collection_id uuid;
  v_revision jsonb;
begin
  if not app_api.is_admitted_user(v_user_id)
    or not app_api.has_workspace_role(
      p_workspace_id,
      'editor'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_create_denied';
  end if;

  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 120
    or p_description is not null and char_length(p_description) > 4000
    or p_notes is not null and char_length(p_notes) > 8000
    or p_collection_ids is null
    or cardinality(p_collection_ids) > 20
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_input_invalid';
  end if;

  perform app_private.lock_deck_catalog_generation();

  v_tags := app_private.normalize_deck_tags(p_tags);
  v_version := app_private.latest_deck_format_version(p_format_code);

  select format.*
  into v_format
  from public.deck_formats as format
  where format.code = v_version.format_code;

  select count(distinct collection_id)::integer
  into v_collection_count
  from unnest(p_collection_ids) as collection_id;

  if v_collection_count <> cardinality(p_collection_ids) then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_sources_duplicate';
  end if;

  for v_collection_id in
    select source.collection_id
    from unnest(p_collection_ids) as source(collection_id)
    order by source.collection_id
  loop
    perform app_private.lock_collection_deck_source_scope(
      v_collection_id
    );
  end loop;

  -- Catalog promotion and collection lifecycle coordination can both wait.
  -- Recheck the actor and workspace after all blocking locks and immediately
  -- before the first write.
  if not app_api.is_admitted_user(v_user_id)
    or not app_api.has_workspace_role(
      p_workspace_id,
      'editor'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_create_denied';
  end if;

  if not exists (
    select 1
    from public.workspaces as workspace
    where workspace.id = p_workspace_id
      and workspace.status = 'active'::public.resource_status
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_deck_workspace_unavailable';
  end if;

  v_slug := coalesce(nullif(app_private.deck_slug_base(p_name), ''), 'deck')
    || '-'
    || left(v_deck_id::text, 8);

  insert into public.decks (
    id,
    workspace_id,
    game_id,
    format_code,
    format_version_id,
    name,
    slug,
    description,
    notes,
    tags,
    created_by_user_id
  )
  values (
    v_deck_id,
    p_workspace_id,
    v_format.game_id,
    v_format.code,
    v_version.id,
    btrim(p_name),
    v_slug,
    nullif(btrim(p_description), ''),
    nullif(btrim(p_notes), ''),
    v_tags,
    v_user_id
  );

  insert into public.deck_inventory_sources (
    workspace_id,
    deck_id,
    collection_id,
    priority
  )
  select
    p_workspace_id,
    v_deck_id,
    source.collection_id,
    (source.ordinality - 1)::smallint
  from unnest(p_collection_ids)
    with ordinality as source(collection_id, ordinality);

  v_revision := app_private.record_deck_revision(v_deck_id, 'create');

  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(v_deck_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_update(
  p_deck_id uuid,
  p_name text,
  p_description text,
  p_notes text,
  p_tags text[],
  p_format_code text,
  p_format_version_id uuid,
  p_cover_printing_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_version public.deck_format_versions;
  v_tags text[];
  v_revision jsonb;
begin
  v_deck := app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision,
    false
  );

  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 120
    or p_description is not null and char_length(p_description) > 4000
    or p_notes is not null and char_length(p_notes) > 8000
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_input_invalid';
  end if;

  v_tags := app_private.normalize_deck_tags(p_tags);

  if p_format_version_id is null
    and lower(btrim(p_format_code)) = v_deck.format_code
  then
    select version_row.*
    into v_version
    from public.deck_format_versions as version_row
    where version_row.id = v_deck.format_version_id;
  elsif p_format_version_id is null then
    v_version := app_private.latest_deck_format_version(p_format_code);
  elsif p_format_version_id = v_deck.format_version_id
    and lower(btrim(p_format_code)) = v_deck.format_code
  then
    select version_row.*
    into v_version
    from public.deck_format_versions as version_row
    where version_row.id = v_deck.format_version_id
      and version_row.format_code = v_deck.format_code;
  else
    select version_row.*
    into v_version
    from public.deck_format_versions as version_row
    join public.deck_formats as format
      on format.code = version_row.format_code
    where version_row.id = p_format_version_id
      and version_row.format_code = lower(btrim(p_format_code))
      and format.active
      and format.game_id = v_deck.game_id
      and version_row.effective_at <= statement_timestamp();
  end if;

  if v_version.id is null then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_format_version_invalid';
  end if;

  update public.decks
  set
    name = btrim(p_name),
    description = nullif(btrim(p_description), ''),
    notes = nullif(btrim(p_notes), ''),
    tags = v_tags,
    format_code = v_version.format_code,
    format_version_id = v_version.id,
    cover_printing_id = p_cover_printing_id
  where id = p_deck_id;

  v_revision := app_private.record_deck_revision(p_deck_id, 'update');

  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_duplicate(
  p_deck_id uuid,
  p_expected_revision integer,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source public.decks;
  v_new_id uuid := gen_random_uuid();
  v_name text;
  v_slug text;
  v_revision jsonb;
  v_preservation_token uuid;
  v_collection_id uuid;
begin
  v_source := app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision,
    true
  );

  v_name := coalesce(nullif(btrim(p_name), ''), v_source.name || ' Copy');
  if char_length(v_name) not between 1 and 120 then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_input_invalid';
  end if;

  v_slug := coalesce(nullif(app_private.deck_slug_base(v_name), ''), 'deck')
    || '-'
    || left(v_new_id::text, 8);

  insert into public.decks (
    id,
    workspace_id,
    game_id,
    format_code,
    format_version_id,
    name,
    slug,
    description,
    notes,
    tags,
    created_by_user_id
  )
  values (
    v_new_id,
    v_source.workspace_id,
    v_source.game_id,
    v_source.format_code,
    v_source.format_version_id,
    v_name,
    v_slug,
    v_source.description,
    v_source.notes,
    v_source.tags,
    auth.uid()
  );

  v_preservation_token := app_private.begin_deck_entry_preservation(
    v_new_id,
    p_deck_id
  );

  insert into public.deck_entries (
    workspace_id,
    deck_id,
    card_id,
    zone,
    quantity,
    preferred_printing_id,
    preferred_finish,
    sort_order,
    notes
  )
  select
    v_source.workspace_id,
    v_new_id,
    entry.card_id,
    entry.zone,
    entry.quantity,
    entry.preferred_printing_id,
    entry.preferred_finish,
    entry.sort_order,
    entry.notes
  from public.deck_entries as entry
  where entry.deck_id = p_deck_id
  order by entry.zone::text, entry.sort_order, entry.id;

  for v_collection_id in
    select source.collection_id
    from public.deck_inventory_sources as source
    where source.deck_id = p_deck_id
    order by source.collection_id
  loop
    perform app_private.lock_collection_deck_source_scope(
      v_collection_id
    );
  end loop;

  if not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      v_source.workspace_id,
      'editor'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  insert into public.deck_inventory_sources (
    workspace_id,
    deck_id,
    collection_id,
    priority
  )
  select
    v_source.workspace_id,
    v_new_id,
    source.collection_id,
    source.priority
  from public.deck_inventory_sources as source
  where source.deck_id = p_deck_id
  order by source.priority, source.collection_id;

  if v_source.cover_printing_id is not null then
    update public.decks
    set cover_printing_id = v_source.cover_printing_id
    where id = v_new_id;
  end if;

  perform app_private.end_deck_entry_preservation(
    v_preservation_token
  );

  v_revision := app_private.record_deck_revision(v_new_id, 'duplicate');

  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(v_new_id),
    'source_deck_id', p_deck_id,
    'revision', v_revision
  );
end;
$$;

create function public.deck_archive(
  p_deck_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_revision jsonb;
begin
  perform app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision,
    false
  );

  update public.decks
  set
    status = 'archived'::public.resource_status,
    archived_at = statement_timestamp(),
    deleted_at = null
  where id = p_deck_id;

  v_revision := app_private.record_deck_revision(p_deck_id, 'archive');
  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_restore(
  p_deck_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_revision jsonb;
begin
  v_deck := app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision,
    true
  );

  if v_deck.status <> 'archived'::public.resource_status then
    raise exception using
      errcode = '55000',
      message = 'talence_deck_restore_requires_archived';
  end if;

  update public.decks
  set
    status = 'active'::public.resource_status,
    archived_at = null,
    deleted_at = null
  where id = p_deck_id;

  v_revision := app_private.record_deck_revision(p_deck_id, 'restore');
  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_delete(
  p_deck_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_revision jsonb;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'owner'::public.membership_role,
    true
  );

  if p_expected_revision is null
    or v_deck.current_revision <> p_expected_revision
  then
    raise exception using
      errcode = '40001',
      message = 'talence_deck_stale';
  end if;

  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = p_deck_id
  for update;

  if v_deck.id is null
    or not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      v_deck.workspace_id,
      'owner'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  if v_deck.status = 'deleted'::public.resource_status then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  if p_expected_revision is null
    or v_deck.current_revision <> p_expected_revision
  then
    raise exception using
      errcode = '40001',
      message = 'talence_deck_stale';
  end if;

  perform app_private.lock_deck_catalog_generation();

  update public.decks
  set
    status = 'deleted'::public.resource_status,
    deleted_at = statement_timestamp()
  where id = p_deck_id;

  v_revision := app_private.record_deck_revision(p_deck_id, 'delete');
  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_sources_replace(
  p_deck_id uuid,
  p_collection_ids uuid[],
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_distinct_count integer;
  v_collection_id uuid;
  v_revision jsonb;
begin
  v_deck := app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision
  );

  if p_collection_ids is null or cardinality(p_collection_ids) > 20 then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_sources_invalid';
  end if;

  select count(distinct collection_id)::integer
  into v_distinct_count
  from unnest(p_collection_ids) as collection_id;

  if v_distinct_count <> cardinality(p_collection_ids) then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_sources_duplicate';
  end if;

  for v_collection_id in
    select source.collection_id
    from unnest(p_collection_ids) as source(collection_id)
    order by source.collection_id
  loop
    perform app_private.lock_collection_deck_source_scope(
      v_collection_id
    );
  end loop;

  if not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      v_deck.workspace_id,
      'editor'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  delete from public.deck_inventory_sources
  where deck_id = p_deck_id;

  insert into public.deck_inventory_sources (
    workspace_id,
    deck_id,
    collection_id,
    priority
  )
  select
    v_deck.workspace_id,
    p_deck_id,
    source.collection_id,
    (source.ordinality - 1)::smallint
  from unnest(p_collection_ids)
    with ordinality as source(collection_id, ordinality);

  v_revision := app_private.record_deck_revision(
    p_deck_id,
    'sources_replace'
  );

  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'collection_ids', to_jsonb(p_collection_ids),
    'revision', v_revision
  );
end;
$$;

create function public.deck_entry_add(
  p_deck_id uuid,
  p_card_id uuid,
  p_zone public.deck_zone,
  p_quantity integer,
  p_expected_revision integer,
  p_preferred_printing_id uuid default null,
  p_preferred_finish public.card_finish default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_entry_id uuid;
  v_sort_order integer;
  v_revision jsonb;
begin
  v_deck := app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision
  );

  if p_card_id is null
    or p_zone is null
    or p_quantity is null
    or p_quantity not between 1 and 10000
    or p_notes is not null and char_length(p_notes) > 2000
    or (p_preferred_printing_id is null)
      <> (p_preferred_finish is null)
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_entry_input_invalid';
  end if;

  if (
    select count(*)
    from public.deck_entries as entry
    where entry.deck_id = p_deck_id
  ) >= 2000
  then
    raise exception using
      errcode = '54000',
      message = 'talence_deck_entry_limit_exceeded';
  end if;

  select coalesce(max(entry.sort_order), -10) + 10
  into v_sort_order
  from public.deck_entries as entry
  where entry.deck_id = p_deck_id
    and entry.zone = p_zone;

  begin
    insert into public.deck_entries (
      workspace_id,
      deck_id,
      card_id,
      zone,
      quantity,
      preferred_printing_id,
      preferred_finish,
      sort_order,
      notes
    )
    values (
      v_deck.workspace_id,
      p_deck_id,
      p_card_id,
      p_zone,
      p_quantity,
      p_preferred_printing_id,
      p_preferred_finish,
      v_sort_order,
      nullif(btrim(p_notes), '')
    )
    returning id into v_entry_id;
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'talence_deck_entry_exists';
  end;

  v_revision := app_private.record_deck_revision(p_deck_id, 'entry_add');
  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'entry', app_private.deck_entry_mutation_json(v_entry_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_entry_update(
  p_entry_id uuid,
  p_quantity integer,
  p_zone public.deck_zone,
  p_preferred_printing_id uuid,
  p_preferred_finish public.card_finish,
  p_notes text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_entry public.deck_entries;
  v_locked_deck_id uuid;
  v_revision jsonb;
begin
  select entry.*
  into v_entry
  from public.deck_entries as entry
  where entry.id = p_entry_id;

  if v_entry.id is null then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  v_locked_deck_id := v_entry.deck_id;
  perform app_private.lock_deck_for_mutation(
    v_locked_deck_id,
    p_expected_revision
  );

  select entry.*
  into v_entry
  from public.deck_entries as entry
  where entry.id = p_entry_id
  for update;

  if v_entry.id is null
    or v_entry.deck_id is distinct from v_locked_deck_id
  then
    raise exception using
      errcode = '40001',
      message = 'talence_deck_stale';
  end if;

  if p_quantity is null
    or p_quantity not between 1 and 10000
    or p_zone is null
    or p_notes is not null and char_length(p_notes) > 2000
    or (p_preferred_printing_id is null)
      <> (p_preferred_finish is null)
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_entry_input_invalid';
  end if;

  begin
    update public.deck_entries
    set
      quantity = p_quantity,
      zone = p_zone,
      preferred_printing_id = p_preferred_printing_id,
      preferred_finish = p_preferred_finish,
      notes = nullif(btrim(p_notes), '')
    where id = p_entry_id;
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'talence_deck_entry_zone_conflict';
  end;

  v_revision := app_private.record_deck_revision(
    v_entry.deck_id,
    'entry_update'
  );
  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(v_entry.deck_id),
    'entry', app_private.deck_entry_mutation_json(p_entry_id),
    'revision', v_revision
  );
end;
$$;

create function public.deck_entry_remove(
  p_entry_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_entry public.deck_entries;
  v_locked_deck_id uuid;
  v_revision jsonb;
begin
  select entry.*
  into v_entry
  from public.deck_entries as entry
  where entry.id = p_entry_id;

  if v_entry.id is null then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_access_denied';
  end if;

  v_locked_deck_id := v_entry.deck_id;
  perform app_private.lock_deck_for_mutation(
    v_locked_deck_id,
    p_expected_revision
  );

  select entry.*
  into v_entry
  from public.deck_entries as entry
  where entry.id = p_entry_id
  for update;

  if v_entry.id is null
    or v_entry.deck_id is distinct from v_locked_deck_id
  then
    raise exception using
      errcode = '40001',
      message = 'talence_deck_stale';
  end if;

  delete from public.deck_entries where id = p_entry_id;
  v_revision := app_private.record_deck_revision(
    v_entry.deck_id,
    'entry_remove'
  );

  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(v_entry.deck_id),
    'removed_entry_id', p_entry_id,
    'revision', v_revision
  );
end;
$$;

create function public.deck_entries_replace(
  p_deck_id uuid,
  p_entries jsonb,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_entry_count integer;
  v_distinct_count integer;
  v_old_cover uuid;
  v_revision jsonb;
  v_preservation_token uuid;
begin
  v_deck := app_private.lock_deck_for_mutation(
    p_deck_id,
    p_expected_revision
  );
  v_old_cover := v_deck.cover_printing_id;

  if p_entries is null
    or jsonb_typeof(p_entries) <> 'array'
    or jsonb_array_length(p_entries) > 2000
    or pg_column_size(p_entries) > 1048576
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_entries_payload_invalid';
  end if;

  begin
    with parsed as (
      select
        item.ordinality,
        (item.value ->> 'card_id')::uuid as card_id,
        (item.value ->> 'zone')::public.deck_zone as zone,
        (item.value ->> 'quantity')::integer as quantity,
        nullif(item.value ->> 'preferred_printing_id', '')::uuid
          as preferred_printing_id,
        nullif(item.value ->> 'preferred_finish', '')::public.card_finish
          as preferred_finish,
        item.value ->> 'notes' as notes
      from jsonb_array_elements(p_entries)
        with ordinality as item(value, ordinality)
    )
    select
      count(*)::integer,
      count(distinct (parsed.card_id, parsed.zone))::integer
    into v_entry_count, v_distinct_count
    from parsed
    where parsed.card_id is not null
      and parsed.zone is not null
      and parsed.quantity between 1 and 10000
      and (parsed.preferred_printing_id is null)
        = (parsed.preferred_finish is null)
      and (
        parsed.notes is null
        or char_length(parsed.notes) <= 2000
      );
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'talence_deck_entries_payload_invalid';
  end;

  if v_entry_count <> jsonb_array_length(p_entries)
    or v_distinct_count <> v_entry_count
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_entries_payload_invalid';
  end if;

  v_preservation_token := app_private.begin_deck_entry_preservation(
    p_deck_id,
    p_deck_id
  );

  delete from public.deck_entries where deck_id = p_deck_id;

  insert into public.deck_entries (
    workspace_id,
    deck_id,
    card_id,
    zone,
    quantity,
    preferred_printing_id,
    preferred_finish,
    sort_order,
    notes
  )
  select
    v_deck.workspace_id,
    p_deck_id,
    (item.value ->> 'card_id')::uuid,
    (item.value ->> 'zone')::public.deck_zone,
    (item.value ->> 'quantity')::integer,
    nullif(item.value ->> 'preferred_printing_id', '')::uuid,
    nullif(item.value ->> 'preferred_finish', '')::public.card_finish,
    ((item.ordinality - 1) * 10)::integer,
    nullif(btrim(item.value ->> 'notes'), '')
  from jsonb_array_elements(p_entries)
    with ordinality as item(value, ordinality);

  if v_old_cover is not null
    and exists (
      select 1
      from public.catalog_printings as printing
      join public.deck_entries as entry
        on entry.card_id = printing.card_id
      where printing.id = v_old_cover
        and entry.deck_id = p_deck_id
    )
  then
    update public.decks
    set cover_printing_id = v_old_cover
    where id = p_deck_id;
  end if;

  perform app_private.end_deck_entry_preservation(
    v_preservation_token
  );

  v_revision := app_private.record_deck_revision(
    p_deck_id,
    'entries_replace'
  );
  return jsonb_build_object(
    'deck', app_private.deck_mutation_json(p_deck_id),
    'entry_count', v_entry_count,
    'revision', v_revision
  );
end;
$$;

revoke all on function app_private.deck_slug_base(text)
  from public, anon, authenticated;
revoke all on function app_private.normalize_deck_tags(text[])
  from public, anon, authenticated;
revoke all on function app_private.assert_human_deck_role(
  uuid,
  public.membership_role,
  boolean
)
  from public, anon, authenticated;
revoke all on function app_private.latest_deck_format_version(text)
  from public, anon, authenticated;
revoke all on function app_private.deck_mutation_json(uuid)
  from public, anon, authenticated;
revoke all on function app_private.deck_entry_mutation_json(uuid)
  from public, anon, authenticated;
revoke all on function app_private.deck_logical_content(uuid)
  from public, anon, authenticated;
revoke all on function app_private.deck_content_snapshot(uuid)
  from public, anon, authenticated;
revoke all on function app_private.deck_content_hash(uuid)
  from public, anon, authenticated;
revoke all on function app_private.lock_deck_catalog_generation()
  from public, anon, authenticated, service_role;
revoke all on function app_private.record_deck_revision(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.lock_deck_for_mutation(
  uuid,
  integer,
  boolean
)
  from public, anon, authenticated;

revoke all on function public.deck_create(
  uuid,
  text,
  text,
  text,
  text,
  text[],
  uuid[]
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_update(
  uuid,
  text,
  text,
  text,
  text[],
  text,
  uuid,
  uuid,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_duplicate(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_archive(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_restore(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_delete(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_sources_replace(uuid, uuid[], integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_entry_add(
  uuid,
  uuid,
  public.deck_zone,
  integer,
  integer,
  uuid,
  public.card_finish,
  text
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_entry_update(
  uuid,
  integer,
  public.deck_zone,
  uuid,
  public.card_finish,
  text,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_entry_remove(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_entries_replace(uuid, jsonb, integer)
  from public, anon, authenticated, service_role;
