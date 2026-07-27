-- Phase 4: default-deny deck RLS, narrow RPC grants, and collection lifecycle
-- capability parity for collections referenced by non-deleted decks.

grant select on table public.deck_formats to authenticated;
grant select on table public.deck_format_versions to authenticated;
grant select on table public.decks to authenticated;
grant select on table public.deck_entries to authenticated;
grant select on table public.deck_inventory_sources to authenticated;
grant select on table public.deck_revisions to authenticated;
grant select on table public.deck_validation_runs to authenticated;

create policy deck_formats_select_admitted
on public.deck_formats
for select
to authenticated
using (app_api.is_admitted_user(auth.uid()));

create policy deck_format_versions_select_admitted
on public.deck_format_versions
for select
to authenticated
using (app_api.is_admitted_user(auth.uid()));

create policy decks_select_workspace
on public.decks
for select
to authenticated
using (
  status <> 'deleted'::public.resource_status
  and app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
);

create policy deck_entries_select_workspace
on public.deck_entries
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.decks as deck
    where deck.id = deck_entries.deck_id
      and deck.workspace_id = deck_entries.workspace_id
      and deck.status <> 'deleted'::public.resource_status
  )
);

create policy deck_inventory_sources_select_workspace
on public.deck_inventory_sources
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.decks as deck
    where deck.id = deck_inventory_sources.deck_id
      and deck.workspace_id = deck_inventory_sources.workspace_id
      and deck.status <> 'deleted'::public.resource_status
  )
);

create policy deck_revisions_select_workspace
on public.deck_revisions
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.decks as deck
    where deck.id = deck_revisions.deck_id
      and deck.workspace_id = deck_revisions.workspace_id
      and deck.status <> 'deleted'::public.resource_status
  )
);

create policy deck_validation_runs_select_workspace
on public.deck_validation_runs
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.decks as deck
    where deck.id = deck_validation_runs.deck_id
      and deck.workspace_id = deck_validation_runs.workspace_id
      and deck.status <> 'deleted'::public.resource_status
  )
);

-- Preserve the Phase 3 functions behind wrappers so collection UI capability
-- flags and mutation enforcement agree with the Phase 4 source guard.
alter function public.collection_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  set schema app_private;

alter function public.collection_detail(uuid, text)
  set schema app_private;

alter function public.collection_delete(uuid, timestamptz)
  set schema app_private;

create or replace function app_private.collection_delete(
  p_collection_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_collection public.collections;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'owner'::public.membership_role,
    false
  );

  -- This transaction-scoped lock is shared with deck source insertion. It is
  -- intentionally acquired before the collection row lock so the two paths
  -- cannot deadlock or pass each other between validation and mutation.
  perform app_private.lock_collection_deck_source_scope(p_collection_id);

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
  for update;

  if p_expected_updated_at is null
    or v_collection.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_collection_stale';
  end if;

  update public.collections
  set
    status = 'deleted'::public.resource_status,
    deleted_at = statement_timestamp()
  where id = p_collection_id;

  return jsonb_build_object(
    'collection',
    app_private.collection_mutation_json(p_collection_id),
    'replayed',
    false
  );
end;
$$;

revoke all on function app_private.collection_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  from public, anon, authenticated, service_role;
revoke all on function app_private.collection_detail(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.collection_delete(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function public.collection_list(
  p_workspace_id uuid,
  p_include_archived boolean default false,
  p_after text default null,
  p_limit integer default 40,
  p_status public.resource_status default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_items jsonb;
begin
  v_result := app_private.collection_list(
    p_workspace_id,
    p_include_archived,
    p_after,
    p_limit,
    p_status
  );

  select coalesce(
    jsonb_agg(
      case
        when exists (
          select 1
          from public.deck_inventory_sources as source
          join public.decks as deck on deck.id = source.deck_id
          where source.collection_id =
            (item.value ->> 'collection_id')::uuid
            and deck.status <> 'deleted'::public.resource_status
        )
        then jsonb_set(
          item.value,
          '{permissions,can_delete}',
          'false'::jsonb,
          true
        )
        else item.value
      end
      order by item.ordinality
    ),
    '[]'::jsonb
  )
  into v_items
  from jsonb_array_elements(v_result -> 'items')
    with ordinality as item(value, ordinality);

  return jsonb_set(v_result, '{items}', v_items, true);
end;
$$;

create function public.collection_detail(
  p_collection_id uuid,
  p_currency text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  v_result := app_private.collection_detail(
    p_collection_id,
    p_currency
  );

  if exists (
    select 1
    from public.deck_inventory_sources as source
    join public.decks as deck on deck.id = source.deck_id
    where source.collection_id = p_collection_id
      and deck.status <> 'deleted'::public.resource_status
  )
  then
    v_result := jsonb_set(
      v_result,
      '{permissions,can_delete}',
      'false'::jsonb,
      true
    );
  end if;

  return v_result;
end;
$$;

create function public.collection_delete(
  p_collection_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return app_private.collection_delete(
    p_collection_id,
    p_expected_updated_at
  );
end;
$$;

revoke all on function public.collection_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_detail(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_delete(uuid, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.collection_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  to authenticated;
grant execute on function public.collection_detail(uuid, text)
  to authenticated;
grant execute on function public.collection_delete(uuid, timestamptz)
  to authenticated;

grant execute on function public.deck_formats_list()
  to authenticated;
grant execute on function public.deck_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  to authenticated;
grant execute on function public.deck_detail(uuid, text)
  to authenticated;
grant execute on function public.deck_create(
  uuid,
  text,
  text,
  text,
  text,
  text[],
  uuid[]
)
  to authenticated;
grant execute on function public.deck_update(
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
  to authenticated;
grant execute on function public.deck_duplicate(uuid, integer, text)
  to authenticated;
grant execute on function public.deck_archive(uuid, integer)
  to authenticated;
grant execute on function public.deck_restore(uuid, integer)
  to authenticated;
grant execute on function public.deck_delete(uuid, integer)
  to authenticated;
grant execute on function public.deck_sources_replace(
  uuid,
  uuid[],
  integer
)
  to authenticated;
grant execute on function public.deck_entry_add(
  uuid,
  uuid,
  public.deck_zone,
  integer,
  integer,
  uuid,
  public.card_finish,
  text
)
  to authenticated;
grant execute on function public.deck_entry_update(
  uuid,
  integer,
  public.deck_zone,
  uuid,
  public.card_finish,
  text,
  integer
)
  to authenticated;
grant execute on function public.deck_entry_remove(uuid, integer)
  to authenticated;
grant execute on function public.deck_entries_replace(
  uuid,
  jsonb,
  integer
)
  to authenticated;
grant execute on function public.deck_catalog_search(
  uuid,
  text,
  text,
  integer
)
  to authenticated;
grant execute on function public.deck_import_resolve(uuid, jsonb)
  to authenticated;
grant execute on function public.deck_card_printings(
  uuid,
  uuid,
  text,
  integer,
  text
)
  to authenticated;
grant execute on function public.calculate_deck_ownership(uuid, text)
  to authenticated;
grant execute on function public.validate_deck(uuid)
  to authenticated;
grant execute on function public.deck_revision_history(uuid, integer)
  to authenticated;
grant execute on function public.deck_validation_history(uuid, integer)
  to authenticated;
grant execute on function public.deck_export(uuid)
  to authenticated;

comment on policy decks_select_workspace on public.decks is
  'Admitted workspace viewers may read non-deleted decks; all writes use bounded RPCs.';
comment on policy deck_revisions_select_workspace
  on public.deck_revisions is
  'Immutable deck snapshots are visible only within the owning workspace.';
