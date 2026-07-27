-- Phase 5: default-deny RLS, column-safe history visibility, feature-policy
-- administration, and least-privilege human/service RPC grants.

create function public.admin_device_feature_policies()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_items jsonb;
begin
  if not app_api.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'feature_key', policy.feature_key,
        'enabled', policy.enabled,
        'per_minute_requests', policy.per_minute_requests,
        'per_day_requests', policy.per_day_requests,
        'per_day_units', policy.per_day_units,
        'max_request_bytes', policy.max_request_bytes,
        'max_items', policy.max_items,
        'updated_by_user_id', policy.updated_by_user_id,
        'created_at', policy.created_at,
        'updated_at', policy.updated_at
      )
      order by policy.feature_key
    ),
    '[]'::jsonb
  )
  into v_items
  from app_private.device_feature_policies as policy;

  return jsonb_build_object('items', v_items);
end;
$$;

create function public.admin_device_feature_policy_update(
  p_feature_key text,
  p_enabled boolean,
  p_per_minute_requests integer,
  p_per_day_requests integer,
  p_per_day_units integer,
  p_max_request_bytes integer,
  p_max_items integer,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_policy app_private.device_feature_policies;
begin
  if not app_api.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  select policy.*
  into v_policy
  from app_private.device_feature_policies as policy
  where policy.feature_key = p_feature_key
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_device_feature_policy_not_found';
  end if;

  if not app_private.is_admitted_platform_admin(v_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  if p_expected_updated_at is null
    or v_policy.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_device_feature_policy_stale';
  end if;

  if p_enabled is null
    or p_per_minute_requests is null
    or p_per_minute_requests not between 1 and 10000
    or p_per_day_requests is null
    or p_per_day_requests not between 1 and 10000000
    or p_per_day_units is null
    or p_per_day_units not between 1 and 100000000
    or p_max_request_bytes is null
    or p_max_request_bytes not between 0 and 16777216
    or p_max_items is null
    or p_max_items not between 0 and 10000
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_feature_policy_invalid';
  end if;

  update app_private.device_feature_policies
  set
    enabled = p_enabled,
    per_minute_requests = p_per_minute_requests,
    per_day_requests = p_per_day_requests,
    per_day_units = p_per_day_units,
    max_request_bytes = p_max_request_bytes,
    max_items = p_max_items,
    updated_by_user_id = v_actor_user_id
  where feature_key = p_feature_key;

  return jsonb_build_object(
    'feature_key', p_feature_key,
    'enabled', p_enabled,
    'per_minute_requests', p_per_minute_requests,
    'per_day_requests', p_per_day_requests,
    'per_day_units', p_per_day_units,
    'max_request_bytes', p_max_request_bytes,
    'max_items', p_max_items,
    'updated_by_user_id', v_actor_user_id,
    'updated_at', (
      select policy.updated_at
      from app_private.device_feature_policies as policy
      where policy.feature_key = p_feature_key
    )
  );
end;
$$;

create policy catalog_snapshots_select_platform_admin
on public.catalog_snapshots
for select
to authenticated
using (app_api.is_platform_admin());

create policy devices_select_workspace
on public.devices
for select
to authenticated
using (
  deleted_at is null
  and app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
);

create policy device_collection_grants_select_workspace
on public.device_collection_grants
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.devices as device
    where device.id = device_collection_grants.device_id
      and device.workspace_id =
        device_collection_grants.workspace_id
      and device.deleted_at is null
  )
);

create policy device_sync_batches_select_workspace
on public.device_sync_batches
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = device_sync_batches.collection_id
      and collection.workspace_id =
        device_sync_batches.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

create policy device_run_summaries_select_workspace
on public.device_run_summaries
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = device_run_summaries.collection_id
      and collection.workspace_id =
        device_run_summaries.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

grant select (
  id,
  version,
  catalog_import_id,
  game_id,
  schema_version,
  status,
  sha256,
  byte_size,
  record_counts,
  minimum_client_version,
  api_contract_version,
  provider_observed_at,
  source_sha256,
  generated_at,
  published_at,
  created_at
) on table public.catalog_snapshots to authenticated;

grant select on table public.devices to authenticated;
grant select on table public.device_collection_grants to authenticated;
grant select (
  id,
  workspace_id,
  device_id,
  collection_id,
  idempotency_key,
  catalog_snapshot_id,
  catalog_snapshot_version,
  occurred_at,
  received_at,
  status,
  inventory_transaction_id,
  external_run_id,
  response_code,
  result_lines,
  created_at
) on table public.device_sync_batches to authenticated;
grant select (
  id,
  workspace_id,
  device_id,
  collection_id,
  external_run_id,
  status,
  catalog_snapshot_id,
  catalog_snapshot_version,
  total_count,
  recognized_count,
  unrecognized_count,
  posted_count,
  started_at,
  completed_at,
  received_at,
  diagnostic_code,
  metadata,
  created_at
) on table public.device_run_summaries to authenticated;

grant execute on function public.device_list(
  uuid,
  public.device_status,
  text,
  integer
) to authenticated;
grant execute on function public.device_detail(uuid)
  to authenticated;
grant execute on function public.device_update(
  uuid,
  text,
  public.device_type,
  text,
  text,
  text,
  timestamptz
) to authenticated;
grant execute on function public.device_set_status(
  uuid,
  public.device_status,
  timestamptz
) to authenticated;
grant execute on function public.device_credential_revoke(uuid, uuid)
  to authenticated;
grant execute on function public.device_revoke(uuid, timestamptz)
  to authenticated;
grant execute on function public.device_delete(uuid, timestamptz)
  to authenticated;
grant execute on function public.device_grants_replace(uuid, jsonb)
  to authenticated;
grant execute on function public.admin_device_feature_policies()
  to authenticated;
grant execute on function public.admin_device_feature_policy_update(
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) to authenticated;

grant execute on function public.device_register(
  uuid,
  uuid,
  text,
  public.device_type,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;
grant execute on function public.device_rotate_credential(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) to service_role;
grant execute on function public.device_credential_candidate(text)
  to service_role;
grant execute on function public.device_auth_touch(uuid, uuid, uuid)
  to service_role;
grant execute on function public.device_api_me(
  uuid,
  uuid,
  uuid,
  integer
) to service_role;
grant execute on function public.device_api_heartbeat(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  integer
) to service_role;
grant execute on function public.device_api_catalog_manifest(
  uuid,
  uuid,
  uuid,
  text,
  text,
  integer[],
  integer
) to service_role;
grant execute on function public.device_api_inventory_page(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
) to service_role;
grant execute on function public.apply_device_inventory_batch(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb,
  jsonb,
  integer
) to service_role;
grant execute on function public.device_api_create_run_summary(
  uuid,
  uuid,
  uuid,
  text,
  text,
  uuid,
  public.device_run_status,
  text,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  jsonb,
  integer
) to service_role;
grant execute on function app_private.catalog_publish_snapshot(
  uuid,
  text,
  integer,
  text,
  text,
  bigint,
  jsonb,
  text,
  timestamptz,
  text
) to service_role;

revoke all on function public.admin_device_feature_policies()
  from public, anon, service_role;
revoke all on function public.admin_device_feature_policy_update(
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) from public, anon, service_role;

comment on policy devices_select_workspace on public.devices is
  'Active admitted workspace members may read non-deleted device metadata; mutations remain RPC-only.';
comment on policy device_sync_batches_select_workspace
  on public.device_sync_batches is
  'Workspace members may read safe accepted-batch columns, but the canonical request hash and correlation ID have no column grant.';
comment on policy device_run_summaries_select_workspace
  on public.device_run_summaries is
  'Workspace members may read thin safe run outcomes; no robot execution state exists in the schema.';
