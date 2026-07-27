-- Phase 5: least-revealing credential lookup, post-auth revalidation,
-- configurable feature quotas, device reads/heartbeat/manifest, and atomic
-- idempotent inventory/run mutations.

create function app_private.device_semver_gte(
  p_actual text,
  p_minimum text
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_actual_core text;
  v_minimum_core text;
  v_actual_parts integer[];
  v_minimum_parts integer[];
  v_actual_prerelease text;
  v_minimum_prerelease text;
begin
  if p_actual
      !~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$'
    or p_minimum
      !~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$'
  then
    return false;
  end if;

  v_actual_core := split_part(split_part(p_actual, '+', 1), '-', 1);
  v_minimum_core := split_part(split_part(p_minimum, '+', 1), '-', 1);
  v_actual_parts := string_to_array(v_actual_core, '.')::integer[];
  v_minimum_parts := string_to_array(v_minimum_core, '.')::integer[];

  if v_actual_parts > v_minimum_parts then
    return true;
  elsif v_actual_parts < v_minimum_parts then
    return false;
  end if;

  v_actual_prerelease := case
    when split_part(p_actual, '+', 1) like '%-%'
      then split_part(split_part(p_actual, '+', 1), '-', 2)
    else null
  end;
  v_minimum_prerelease := case
    when split_part(p_minimum, '+', 1) like '%-%'
      then split_part(split_part(p_minimum, '+', 1), '-', 2)
    else null
  end;

  if v_minimum_prerelease is null then
    return v_actual_prerelease is null;
  elsif v_actual_prerelease is null then
    return true;
  end if;

  return v_actual_prerelease >= v_minimum_prerelease;
exception
  when numeric_value_out_of_range then
    return false;
end;
$$;

create function app_private.lock_active_device_credential(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid
)
returns public.devices
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_credential app_private.device_credentials;
  v_now timestamptz := statement_timestamp();
begin
  if p_device_id is null
    or p_credential_id is null
    or p_request_id is null
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_credential_invalid';
  end if;

  -- Canonical service lock order starts with the device and then its
  -- credential. Human revoke/rotate paths use the same order.
  select device.*
  into v_device
  from public.devices as device
  where device.id = p_device_id
  for update;

  if not found
    or v_device.status <> 'active'::public.device_status
    or v_device.deleted_at is not null
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_credential_invalid';
  end if;

  select credential.*
  into v_credential
  from app_private.device_credentials as credential
  where credential.id = p_credential_id
    and credential.device_id = p_device_id
  for update;

  if not found
    or v_credential.revoked_at is not null
    or (
      v_credential.expires_at is not null
      and v_credential.expires_at <= v_now
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_credential_invalid';
  end if;

  if v_credential.last_used_at is null
    or v_credential.last_used_at <= v_now - interval '5 minutes'
  then
    update app_private.device_credentials
    set last_used_at = v_now
    where id = p_credential_id;
  end if;

  if v_device.last_seen_at is null
    or v_device.last_seen_at <= v_now - interval '5 minutes'
  then
    update public.devices
    set last_seen_at = v_now
    where id = p_device_id;
    v_device.last_seen_at := v_now;
  end if;

  -- Re-read after all potentially blocking writes. This closes the lookup /
  -- revoke and touch / suspend windows even when the caller already touched.
  select device.*
  into v_device
  from public.devices as device
  where device.id = p_device_id;

  select credential.*
  into v_credential
  from app_private.device_credentials as credential
  where credential.id = p_credential_id
    and credential.device_id = p_device_id;

  if not found
    or v_device.status <> 'active'::public.device_status
    or v_device.deleted_at is not null
    or v_credential.revoked_at is not null
    or (
      v_credential.expires_at is not null
      and v_credential.expires_at <= v_now
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_credential_invalid';
  end if;

  return v_device;
end;
$$;

create function app_private.consume_device_feature_quota(
  p_device_id uuid,
  p_feature_key text,
  p_units integer,
  p_request_bytes integer,
  p_items integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy app_private.device_feature_policies;
  v_minute_started_at timestamptz;
  v_day_started_at timestamptz;
  v_minute app_private.device_usage_windows;
  v_day app_private.device_usage_windows;
begin
  if p_device_id is null
    or p_feature_key is null
    or p_units is null
    or p_request_bytes is null
    or p_items is null
    or p_units < 0
    or p_request_bytes < 0
    or p_items < 0
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_request_invalid';
  end if;

  select policy.*
  into v_policy
  from app_private.device_feature_policies as policy
  where policy.feature_key = p_feature_key
  for update;

  if not found or not v_policy.enabled then
    raise exception using
      errcode = '55000',
      message = 'talence_device_feature_disabled',
      detail = jsonb_build_object(
        'feature', p_feature_key
      )::text;
  end if;

  if p_request_bytes > v_policy.max_request_bytes
    or p_items > v_policy.max_items
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_request_too_large',
      detail = jsonb_build_object(
        'feature', p_feature_key,
        'max_request_bytes', v_policy.max_request_bytes,
        'max_items', v_policy.max_items
      )::text;
  end if;

  v_minute_started_at := date_trunc('minute', statement_timestamp());
  v_day_started_at := (
    date_trunc(
      'day',
      statement_timestamp() at time zone 'UTC'
    ) at time zone 'UTC'
  );

  insert into app_private.device_usage_windows (
    feature_key,
    device_id,
    window_seconds,
    window_started_at
  )
  values (
    p_feature_key,
    p_device_id,
    60,
    v_minute_started_at
  )
  on conflict do nothing;

  select usage.*
  into v_minute
  from app_private.device_usage_windows as usage
  where usage.feature_key = p_feature_key
    and usage.device_id = p_device_id
    and usage.window_seconds = 60
    and usage.window_started_at = v_minute_started_at
  for update;

  insert into app_private.device_usage_windows (
    feature_key,
    device_id,
    window_seconds,
    window_started_at
  )
  values (
    p_feature_key,
    p_device_id,
    86400,
    v_day_started_at
  )
  on conflict do nothing;

  select usage.*
  into v_day
  from app_private.device_usage_windows as usage
  where usage.feature_key = p_feature_key
    and usage.device_id = p_device_id
    and usage.window_seconds = 86400
    and usage.window_started_at = v_day_started_at
  for update;

  if v_minute.request_count + 1 > v_policy.per_minute_requests
    or v_day.request_count + 1 > v_policy.per_day_requests
    or v_day.units_consumed + p_units > v_policy.per_day_units
  then
    raise exception using
      errcode = 'P0001',
      message = 'talence_device_quota_exceeded',
      detail = jsonb_build_object(
        'feature', p_feature_key,
        'window_started_at', case
          when v_minute.request_count + 1
            > v_policy.per_minute_requests
            then v_minute_started_at
          else v_day_started_at
        end
      )::text;
  end if;

  update app_private.device_usage_windows
  set
    request_count = request_count + 1,
    units_consumed = units_consumed + p_units,
    updated_at = statement_timestamp()
  where feature_key = p_feature_key
    and device_id = p_device_id
    and window_seconds = 60
    and window_started_at = v_minute_started_at;

  update app_private.device_usage_windows
  set
    request_count = request_count + 1,
    units_consumed = units_consumed + p_units,
    updated_at = statement_timestamp()
  where feature_key = p_feature_key
    and device_id = p_device_id
    and window_seconds = 86400
    and window_started_at = v_day_started_at;
end;
$$;

create function app_private.assert_device_collection_grant(
  p_device public.devices,
  p_collection_id uuid,
  p_permission public.grant_permission
)
returns public.collections
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_collection public.collections;
begin
  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
  for share;

  if not found
    or v_collection.workspace_id <> p_device.workspace_id
    or v_collection.status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_grant_denied';
  end if;

  perform grant_row.permission
  from public.device_collection_grants as grant_row
  where grant_row.workspace_id = p_device.workspace_id
    and grant_row.device_id = p_device.id
    and grant_row.collection_id = p_collection_id
    and grant_row.permission = p_permission
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'talence_device_grant_denied';
  end if;

  -- Revalidate collection lifecycle and device scope after grant-row wait.
  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id;

  if not found
    or v_collection.workspace_id <> p_device.workspace_id
    or v_collection.status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_grant_denied';
  end if;

  return v_collection;
end;
$$;

create function app_private.latest_compatible_catalog_snapshot(
  p_client_version text,
  p_supported_schema_versions integer[]
)
returns public.catalog_snapshots
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_snapshot public.catalog_snapshots;
begin
  if p_client_version is null
    or char_length(p_client_version) not between 1 and 80
    or p_supported_schema_versions is null
    or cardinality(p_supported_schema_versions) not between 1 and 16
    or array_position(p_supported_schema_versions, null) is not null
    or exists (
      select 1
      from unnest(p_supported_schema_versions) as schema_version(value)
      where schema_version.value not between 1 and 32767
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_manifest_request_invalid';
  end if;

  select snapshot.*
  into v_snapshot
  from public.catalog_snapshots as snapshot
  cross join public.catalog_state as state
  where state.singleton_id = 1
    and snapshot.status = 'succeeded'::public.job_status
    and snapshot.schema_version = any(p_supported_schema_versions)
    and app_private.device_semver_gte(
      p_client_version,
      snapshot.minimum_client_version
    )
  order by
    (snapshot.id = state.current_robot_snapshot_id) desc,
    snapshot.published_at desc,
    snapshot.id desc
  limit 1;

  return v_snapshot;
end;
$$;

create function app_private.normalize_device_inventory_lines(p_lines jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_canonical jsonb := '[]'::jsonb;
  v_grouped jsonb;
  v_line_id text;
  v_printing_id uuid;
  v_finish public.card_finish;
  v_condition public.card_condition;
  v_delta integer;
begin
  if p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 500
    or pg_column_size(p_lines) > 524288
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_inventory_lines_invalid';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_lines) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not v_item ?& array[
        'line_id',
        'printing_id',
        'finish',
        'condition',
        'quantity_delta'
      ]
      or v_item
        - 'line_id'
        - 'printing_id'
        - 'finish'
        - 'condition'
        - 'quantity_delta' <> '{}'::jsonb
    then
      raise exception using
        errcode = '22023',
        message = 'talence_device_inventory_line_invalid';
    end if;

    begin
      v_line_id := btrim(v_item ->> 'line_id');
      v_printing_id := (v_item ->> 'printing_id')::uuid;
      v_finish := (v_item ->> 'finish')::public.card_finish;
      v_condition := (v_item ->> 'condition')::public.card_condition;
      v_delta := (v_item ->> 'quantity_delta')::integer;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
      then
        raise exception using
          errcode = '22023',
          message = 'talence_device_inventory_line_invalid';
    end;

    if v_line_id is null
      or char_length(v_line_id) not between 1 and 128
      or v_printing_id is null
      or v_finish is null
      or v_condition is null
      or v_delta is null
      or v_delta = 0
      or v_delta not between -10000 and 10000
    then
      raise exception using
        errcode = '22023',
        message = 'talence_device_inventory_line_invalid';
    end if;

    v_canonical := v_canonical || jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_id,
        'printing_id', v_printing_id,
        'finish', v_finish,
        'condition', v_condition,
        'quantity_delta', v_delta
      )
    );
  end loop;

  if exists (
    select 1
    from jsonb_to_recordset(v_canonical) as line(line_id text)
    group by line.line_id
    having count(*) > 1
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_inventory_line_id_duplicate';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_canonical) as line(
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity_delta integer
    )
    group by line.printing_id, line.finish, line.condition
    having sum(line.quantity_delta) = 0
      or sum(line.quantity_delta) not between -50000000 and 50000000
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_inventory_aggregate_delta_invalid';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'line_ids', grouped.line_ids,
      'printing_id', grouped.printing_id,
      'finish', grouped.finish,
      'condition', grouped.condition,
      'quantity_delta', grouped.quantity_delta,
      'expected_quantity_before', null
    )
    order by
      grouped.printing_id,
      grouped.finish::text,
      grouped.condition::text
  )
  into v_grouped
  from (
    select
      array_agg(line.line_id order by line.ordinality) as line_ids,
      line.printing_id,
      line.finish,
      line.condition,
      sum(line.quantity_delta)::integer as quantity_delta
    from rows from (
      jsonb_to_recordset(v_canonical) as (
        line_id text,
        printing_id uuid,
        finish public.card_finish,
        condition public.card_condition,
        quantity_delta integer
      )
    ) with ordinality as line(
      line_id,
      printing_id,
      finish,
      condition,
      quantity_delta,
      ordinality
    )
    group by line.printing_id, line.finish, line.condition
  ) as grouped;

  return jsonb_build_object(
    'canonical_lines', v_canonical,
    'grouped_lines', v_grouped
  );
end;
$$;

create function public.device_credential_candidate(p_prefix text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select (
    select jsonb_build_object(
      'credential_id', credential.id,
      'device_id', credential.device_id,
      'prefix', credential.prefix,
      'secret_digest', credential.secret_digest
    )
    from app_private.device_credentials as credential
    join public.devices as device
      on device.id = credential.device_id
    where credential.prefix = p_prefix
      and credential.revoked_at is null
      and (
        credential.expires_at is null
        or credential.expires_at > statement_timestamp()
      )
      and device.status = 'active'::public.device_status
      and device.deleted_at is null
    limit 1
  )
$$;

create function public.device_auth_touch(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_credential app_private.device_credentials;
begin
  v_device := app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  select credential.*
  into v_credential
  from app_private.device_credentials as credential
  where credential.id = p_credential_id;

  return jsonb_build_object(
    'device_id', p_device_id,
    'last_seen_at', v_device.last_seen_at,
    'credential_last_used_at', v_credential.last_used_at
  );
end;
$$;

create function public.device_api_me(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid,
  p_request_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_grants jsonb;
begin
  v_device := app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  if p_request_bytes is null
    or p_request_bytes not between 0 and 8192
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_request_too_large';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection_id', grouped.collection_id,
        'permissions', grouped.permissions
      )
      order by grouped.collection_id
    ),
    '[]'::jsonb
  )
  into v_grants
  from (
    select
      grant_row.collection_id,
      jsonb_agg(
        grant_row.permission
        order by grant_row.permission::text
      ) as permissions
    from public.device_collection_grants as grant_row
    join public.collections as collection
      on collection.id = grant_row.collection_id
      and collection.workspace_id = grant_row.workspace_id
    where grant_row.device_id = p_device_id
      and collection.status = 'active'::public.resource_status
    group by grant_row.collection_id
  ) as grouped;

  return jsonb_build_object(
    'device_id', v_device.id,
    'workspace_id', v_device.workspace_id,
    'name', v_device.name,
    'type', v_device.type,
    'status', v_device.status,
    'grants', v_grants,
    'api_version', 'v1',
    'server_time', statement_timestamp()
  );
end;
$$;

create function public.device_api_heartbeat(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid,
  p_client_version text,
  p_firmware_version text,
  p_catalog_snapshot_version text,
  p_health jsonb,
  p_request_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_snapshot public.catalog_snapshots;
  v_item_count integer;
  v_now timestamptz := statement_timestamp();
begin
  perform app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  v_item_count := case
    when p_health is null or jsonb_typeof(p_health) <> 'object' then 0
    else (
      select count(*)::integer
      from jsonb_object_keys(p_health) as health_key(value)
    )
  end;

  perform app_private.consume_device_feature_quota(
    p_device_id,
    'device_heartbeat',
    1,
    p_request_bytes,
    v_item_count
  );

  if p_client_version is null
    or char_length(btrim(p_client_version)) not between 1 and 80
    or (
      p_firmware_version is not null
      and char_length(btrim(p_firmware_version)) not between 1 and 80
    )
    or (
      p_catalog_snapshot_version is not null
      and char_length(btrim(p_catalog_snapshot_version))
        not between 1 and 160
    )
    or not app_private.device_safe_metadata_valid(
      coalesce(p_health, '{}'::jsonb),
      20,
      8192
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_heartbeat_invalid';
  end if;

  if p_catalog_snapshot_version is not null then
    select snapshot.*
    into v_snapshot
    from public.catalog_snapshots as snapshot
    where snapshot.version = p_catalog_snapshot_version
      and snapshot.status = 'succeeded'::public.job_status
    for share;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'talence_catalog_snapshot_unknown';
    end if;
  end if;

  update public.devices
  set
    last_seen_at = v_now,
    last_client_version = btrim(p_client_version),
    last_firmware_version = nullif(btrim(p_firmware_version), ''),
    last_catalog_snapshot_id = case
      when p_catalog_snapshot_version is null then null
      else v_snapshot.id
    end
  where id = p_device_id;

  return jsonb_build_object(
    'accepted', true,
    'server_time', v_now
  );
end;
$$;

create function public.device_api_catalog_manifest(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid,
  p_current_version text,
  p_client_version text,
  p_supported_schema_versions integer[],
  p_request_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_snapshot public.catalog_snapshots;
begin
  perform app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  perform app_private.consume_device_feature_quota(
    p_device_id,
    'snapshot_downloads',
    1,
    p_request_bytes,
    coalesce(cardinality(p_supported_schema_versions), 0)
  );

  if p_current_version is not null
    and char_length(btrim(p_current_version)) not between 1 and 160
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_manifest_request_invalid';
  end if;

  -- The shared state lock prevents publication/promotion pointer changes
  -- while compatibility and immutable storage metadata are selected.
  perform 1
  from public.catalog_state as state
  where state.singleton_id = 1
  for share;

  v_snapshot := app_private.latest_compatible_catalog_snapshot(
    p_client_version,
    p_supported_schema_versions
  );

  if v_snapshot.id is null then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_snapshot_incompatible';
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'up_to_date',
      p_current_version is not null
      and p_current_version = v_snapshot.version,
    'server_time', statement_timestamp(),
    'latest', jsonb_build_object(
      'snapshot_id', v_snapshot.id,
      'version', v_snapshot.version,
      'snapshot_schema_version', v_snapshot.schema_version,
      'game_code', 'mtg',
      'generated_at', v_snapshot.generated_at,
      'provider_observed_at', v_snapshot.provider_observed_at,
      'sha256', v_snapshot.sha256,
      'byte_size', v_snapshot.byte_size,
      'record_counts', v_snapshot.record_counts,
      'minimum_client_version', v_snapshot.minimum_client_version,
      'api_contract_version', v_snapshot.api_contract_version,
      'storage_bucket', v_snapshot.storage_bucket,
      'storage_path', v_snapshot.storage_path
    )
  );
end;
$$;

create function public.device_api_inventory_page(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid,
  p_collection_id uuid,
  p_after text,
  p_limit integer,
  p_request_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_collection public.collections;
  v_cursor jsonb;
  v_after_printing_id uuid;
  v_after_finish public.card_finish;
  v_after_condition public.card_condition;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor text;
begin
  v_device := app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  if p_limit is null
    or p_limit not between 1 and 200
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_inventory_page_invalid';
  end if;

  perform app_private.consume_device_feature_quota(
    p_device_id,
    'device_inventory_reads',
    p_limit,
    p_request_bytes,
    p_limit
  );

  v_collection := app_private.assert_device_collection_grant(
    v_device,
    p_collection_id,
    'inventory_read'::public.grant_permission
  );

  if p_after is not null then
    begin
      v_cursor := app_private.inventory_decode_cursor(p_after);
      if (v_cursor ->> 'collection_id')::uuid <> p_collection_id
      then
        raise exception using
          errcode = '22023',
          message = 'talence_device_inventory_cursor_invalid';
      end if;
      v_after_printing_id := (v_cursor ->> 'printing_id')::uuid;
      v_after_finish :=
        (v_cursor ->> 'finish')::public.card_finish;
      v_after_condition :=
        (v_cursor ->> 'condition')::public.card_condition;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_device_inventory_cursor_invalid';
    end;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'printing_id', candidate.printing_id,
        'finish', candidate.finish,
        'condition', candidate.condition,
        'quantity', candidate.quantity,
        'updated_at', candidate.updated_at
      )
      order by
        candidate.printing_id,
        candidate.finish::text,
        candidate.condition::text
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      balance.printing_id,
      balance.finish,
      balance.condition,
      balance.quantity,
      balance.updated_at
    from public.inventory_balances as balance
    where balance.collection_id = p_collection_id
      and balance.workspace_id = v_collection.workspace_id
      and balance.quantity > 0
      and (
        v_after_printing_id is null
        or (
          balance.printing_id,
          balance.finish::text,
          balance.condition::text
        ) > (
          v_after_printing_id,
          v_after_finish::text,
          v_after_condition::text
        )
      )
    order by
      balance.printing_id,
      balance.finish::text,
      balance.condition::text
    limit p_limit + 1
  ) as candidate;

  v_has_more := jsonb_array_length(v_items) > p_limit;
  if v_has_more then
    v_items := v_items - p_limit;
  end if;

  if jsonb_array_length(v_items) > 0 then
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'collection_id', p_collection_id,
        'printing_id',
          v_items -> (jsonb_array_length(v_items) - 1)
            ->> 'printing_id',
        'finish',
          v_items -> (jsonb_array_length(v_items) - 1)
            ->> 'finish',
        'condition',
          v_items -> (jsonb_array_length(v_items) - 1)
            ->> 'condition'
      )
    );
  end if;

  return jsonb_build_object(
    'collection_id', p_collection_id,
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more,
    'server_time', statement_timestamp()
  );
end;
$$;

create function public.apply_device_inventory_batch(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid,
  p_collection_id uuid,
  p_idempotency_key text,
  p_catalog_snapshot_version text,
  p_occurred_at timestamptz,
  p_external_run_id text,
  p_lines jsonb,
  p_metadata jsonb,
  p_request_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_collection public.collections;
  v_snapshot public.catalog_snapshots;
  v_normalized jsonb;
  v_canonical_lines jsonb;
  v_grouped_lines jsonb;
  v_canonical_request jsonb;
  v_request_hash text;
  v_existing public.device_sync_batches;
  v_private_request app_private.inventory_operation_requests;
  v_core_result jsonb;
  v_result_lines jsonb;
  v_batch_id uuid := gen_random_uuid();
  v_received_at timestamptz := statement_timestamp();
  v_latest_snapshot_version text;
  v_unknown_ids uuid[];
  v_inactive_ids uuid[];
  v_unsupported_ids uuid[];
begin
  v_device := app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  perform app_private.consume_device_feature_quota(
    p_device_id,
    'device_inventory_writes',
    case
      when p_lines is null or jsonb_typeof(p_lines) <> 'array' then 0
      else jsonb_array_length(p_lines)
    end,
    p_request_bytes,
    case
      when p_lines is null or jsonb_typeof(p_lines) <> 'array' then 0
      else jsonb_array_length(p_lines)
    end
  );

  if p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 8 and 200
    or p_catalog_snapshot_version is null
    or char_length(btrim(p_catalog_snapshot_version))
      not between 1 and 160
    or p_occurred_at is null
    or p_external_run_id is not null
      and char_length(btrim(p_external_run_id)) not between 1 and 128
    or not app_private.device_safe_metadata_valid(
      coalesce(p_metadata, '{}'::jsonb),
      20,
      16384
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_inventory_batch_invalid';
  end if;

  v_normalized := app_private.normalize_device_inventory_lines(p_lines);
  v_canonical_lines := v_normalized -> 'canonical_lines';
  v_grouped_lines := v_normalized -> 'grouped_lines';

  v_canonical_request := jsonb_build_object(
    'schema_version', 1,
    'collection_id', p_collection_id,
    'catalog_snapshot_version', btrim(p_catalog_snapshot_version),
    'occurred_at_utc', to_char(
      p_occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'external_run_id', nullif(btrim(p_external_run_id), ''),
    'lines', v_canonical_lines,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  v_request_hash :=
    app_private.inventory_request_hash(v_canonical_request);

  -- Serialize first use before reading either immutable receipt. The lock is
  -- scoped to the device and key (not the collection) because the public
  -- idempotency key is device-wide.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'talence.device.inventory:'
        || p_device_id::text
        || ':'
        || btrim(p_idempotency_key),
      0
    )
  );

  select batch.*
  into v_existing
  from public.device_sync_batches as batch
  where batch.device_id = p_device_id
    and batch.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using
        errcode = '23505',
        message = 'talence_device_idempotency_conflict';
    end if;

    select request.*
    into v_private_request
    from app_private.inventory_operation_requests as request
    where request.operation_type = 'apply'
      and request.principal_kind = 'device'
      and request.principal_id = p_device_id
      and request.scope_id = p_device_id
      and request.idempotency_key = btrim(p_idempotency_key);

    if not found
      or not (
        v_existing.inventory_transaction_id
          = any(v_private_request.transaction_ids)
      )
      or (
        v_private_request.response_payload ->> 'transaction_id'
      )::uuid <> v_existing.inventory_transaction_id
    then
      raise exception using
        errcode = 'XX000',
        message = 'talence_device_inventory_receipt_inconsistent';
    end if;

    return jsonb_build_object(
      'batch_id', v_existing.id,
      'transaction_id', v_existing.inventory_transaction_id,
      'collection_id', v_existing.collection_id,
      'committed_at', v_existing.received_at,
      'replayed', true,
      'lines', v_existing.result_lines
    );
  end if;

  v_collection := app_private.assert_device_collection_grant(
    v_device,
    p_collection_id,
    'inventory_write'::public.grant_permission
  );

  -- Freeze catalog generation after collection/grant state. Promotion takes
  -- the opposing lock and therefore cannot change identity beneath the core.
  select snapshot.version
  into v_latest_snapshot_version
  from public.catalog_state as state
  left join public.catalog_snapshots as snapshot
    on snapshot.id = state.current_robot_snapshot_id
  where state.singleton_id = 1
  for share of state;

  select snapshot.*
  into v_snapshot
  from public.catalog_snapshots as snapshot
  where snapshot.version = btrim(p_catalog_snapshot_version)
    and snapshot.status = 'succeeded'::public.job_status
  for share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'talence_catalog_snapshot_unknown',
      detail = jsonb_build_object(
        'latest_snapshot_version', v_latest_snapshot_version
      )::text;
  end if;

  select coalesce(
    array_agg(distinct submitted.printing_id order by submitted.printing_id),
    '{}'::uuid[]
  )
  into v_unknown_ids
  from jsonb_to_recordset(v_canonical_lines) as submitted(
    line_id text,
    printing_id uuid,
    finish public.card_finish,
    condition public.card_condition,
    quantity_delta integer
  )
  left join public.catalog_printings as printing
    on printing.id = submitted.printing_id
    and printing.game_id = v_collection.game_id
  where printing.id is null;

  select coalesce(
    array_agg(distinct submitted.printing_id order by submitted.printing_id),
    '{}'::uuid[]
  )
  into v_inactive_ids
  from jsonb_to_recordset(v_canonical_lines) as submitted(
    line_id text,
    printing_id uuid,
    finish public.card_finish,
    condition public.card_condition,
    quantity_delta integer
  )
  join public.catalog_printings as printing
    on printing.id = submitted.printing_id
    and printing.game_id = v_collection.game_id
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  where not printing.active
    or not catalog_set.active
    or card.id is not null and not card.active;

  if cardinality(v_unknown_ids) > 0
    or cardinality(v_inactive_ids) > 0
  then
    raise exception using
      errcode = '23503',
      message = 'talence_catalog_printing_unknown',
      detail = jsonb_build_object(
        'unknown_printing_ids',
          to_jsonb(v_unknown_ids[1:20]),
        'unknown_count', cardinality(v_unknown_ids),
        'inactive_printing_ids',
          to_jsonb(v_inactive_ids[1:20]),
        'inactive_count', cardinality(v_inactive_ids),
        'latest_snapshot_version', v_latest_snapshot_version
      )::text;
  end if;

  select coalesce(
    array_agg(distinct submitted.printing_id order by submitted.printing_id),
    '{}'::uuid[]
  )
  into v_unsupported_ids
  from jsonb_to_recordset(v_canonical_lines) as submitted(
    line_id text,
    printing_id uuid,
    finish public.card_finish,
    condition public.card_condition,
    quantity_delta integer
  )
  join public.catalog_printings as printing
    on printing.id = submitted.printing_id
  where submitted.finish <> 'unknown'::public.card_finish
    and not submitted.finish = any(printing.finishes);

  if cardinality(v_unsupported_ids) > 0 then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_finish_unsupported',
      detail = jsonb_build_object(
        'printing_ids', to_jsonb(v_unsupported_ids[1:20]),
        'count', cardinality(v_unsupported_ids)
      )::text;
  end if;

  v_core_result := app_private.apply_inventory_transaction_core(
    'device',
    p_device_id,
    null,
    p_device_id,
    p_collection_id,
    'device'::public.inventory_source,
    'apply',
    p_device_id,
    btrim(p_idempotency_key),
    p_occurred_at,
    v_grouped_lines,
    null,
    nullif(btrim(p_external_run_id), ''),
    coalesce(p_metadata, '{}'::jsonb),
    null,
    null,
    null,
    null
  );

  select request.*
  into v_private_request
  from app_private.inventory_operation_requests as request
  where request.operation_type = 'apply'
    and request.principal_kind = 'device'
    and request.principal_id = p_device_id
    and request.scope_id = p_device_id
    and request.idempotency_key = btrim(p_idempotency_key);

  if not found
    or not (
      (v_core_result ->> 'transaction_id')::uuid
        = any(v_private_request.transaction_ids)
    )
    or (
      v_private_request.response_payload ->> 'transaction_id'
    )::uuid <> (v_core_result ->> 'transaction_id')::uuid
  then
    raise exception using
      errcode = 'XX000',
      message = 'talence_device_inventory_receipt_inconsistent';
  end if;

  -- Phase 3 aggregates duplicate balance tuples. Expand each aggregate result
  -- back to the caller's unique line IDs in original request order.
  select jsonb_agg(
    jsonb_build_object(
      'line_id', submitted.line_id,
      'printing_id', submitted.printing_id,
      'quantity_before',
        (core_line.value ->> 'quantity_before')::integer,
      'quantity_after',
        (core_line.value ->> 'quantity_after')::integer
    )
    order by submitted.ordinality
  )
  into v_result_lines
  from rows from (
    jsonb_to_recordset(v_canonical_lines) as (
      line_id text,
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity_delta integer
    )
  ) with ordinality as submitted(
    line_id,
    printing_id,
    finish,
    condition,
    quantity_delta,
    ordinality
  )
  join jsonb_array_elements(v_core_result -> 'lines') as core_line(value)
    on exists (
      select 1
      from jsonb_array_elements_text(
        core_line.value -> 'line_ids'
      ) as line_id(value)
      where line_id.value = submitted.line_id
    );

  if v_result_lines is null
    or jsonb_array_length(v_result_lines)
      <> jsonb_array_length(v_canonical_lines)
  then
    raise exception using
      errcode = 'XX000',
      message = 'talence_device_inventory_result_invalid';
  end if;

  insert into public.device_sync_batches (
    id,
    workspace_id,
    device_id,
    collection_id,
    idempotency_key,
    request_hash,
    catalog_snapshot_id,
    catalog_snapshot_version,
    occurred_at,
    received_at,
    status,
    inventory_transaction_id,
    external_run_id,
    response_code,
    correlation_id,
    result_lines,
    created_at
  )
  values (
    v_batch_id,
    v_device.workspace_id,
    p_device_id,
    p_collection_id,
    btrim(p_idempotency_key),
    v_request_hash,
    v_snapshot.id,
    v_snapshot.version,
    p_occurred_at,
    v_received_at,
    'committed',
    (v_core_result ->> 'transaction_id')::uuid,
    nullif(btrim(p_external_run_id), ''),
    'committed',
    p_request_id,
    v_result_lines,
    v_received_at
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'transaction_id', v_core_result ->> 'transaction_id',
    'collection_id', p_collection_id,
    'committed_at', v_received_at,
    'replayed', false,
    'lines', v_result_lines
  );
end;
$$;

create function public.device_api_create_run_summary(
  p_device_id uuid,
  p_credential_id uuid,
  p_request_id uuid,
  p_idempotency_key text,
  p_external_run_id text,
  p_collection_id uuid,
  p_status public.device_run_status,
  p_catalog_snapshot_version text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_counts jsonb,
  p_diagnostic_code text,
  p_metadata jsonb,
  p_request_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_snapshot public.catalog_snapshots;
  v_total integer;
  v_recognized integer;
  v_unrecognized integer;
  v_posted integer;
  v_canonical_request jsonb;
  v_request_hash text;
  v_existing_request app_private.device_mutation_requests;
  v_existing_resource app_private.device_mutation_requests;
  v_run_summary_id uuid := gen_random_uuid();
  v_received_at timestamptz := statement_timestamp();
  v_result jsonb;
begin
  v_device := app_private.lock_active_device_credential(
    p_device_id,
    p_credential_id,
    p_request_id
  );

  perform app_private.consume_device_feature_quota(
    p_device_id,
    'device_run_summaries',
    1,
    p_request_bytes,
    case
      when p_metadata is null
        or jsonb_typeof(p_metadata) <> 'object' then 0
      else (
        select count(*)::integer
        from jsonb_object_keys(p_metadata) as metadata_key(value)
      )
    end
  );

  if p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 8 and 200
    or p_external_run_id is null
    or char_length(btrim(p_external_run_id)) not between 1 and 128
    or p_catalog_snapshot_version is null
    or char_length(btrim(p_catalog_snapshot_version))
      not between 1 and 160
    or p_started_at is null
    or p_completed_at is null
    or p_status is null
    or p_completed_at < p_started_at
    or p_completed_at > v_received_at + interval '5 minutes'
    or p_counts is null
    or jsonb_typeof(p_counts) <> 'object'
    or not p_counts ?& array[
      'total',
      'recognized',
      'unrecognized',
      'posted'
    ]
    or p_counts
      - 'total'
      - 'recognized'
      - 'unrecognized'
      - 'posted' <> '{}'::jsonb
    or jsonb_typeof(p_counts -> 'total') <> 'number'
    or jsonb_typeof(p_counts -> 'recognized') <> 'number'
    or jsonb_typeof(p_counts -> 'unrecognized') <> 'number'
    or jsonb_typeof(p_counts -> 'posted') <> 'number'
    or p_diagnostic_code is not null
      and char_length(btrim(p_diagnostic_code)) not between 1 and 128
    or not app_private.device_safe_metadata_valid(
      coalesce(p_metadata, '{}'::jsonb),
      20,
      16384
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_run_summary_invalid';
  end if;

  begin
    v_total := (p_counts ->> 'total')::integer;
    v_recognized := (p_counts ->> 'recognized')::integer;
    v_unrecognized := (p_counts ->> 'unrecognized')::integer;
    v_posted := (p_counts ->> 'posted')::integer;
  exception
    when invalid_text_representation
      or numeric_value_out_of_range
    then
      raise exception using
        errcode = '22023',
        message = 'talence_device_run_summary_invalid';
  end;

  if v_total < 0
    or v_recognized < 0
    or v_unrecognized < 0
    or v_posted < 0
    or v_recognized + v_unrecognized <> v_total
    or v_posted > v_recognized
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_run_summary_invalid';
  end if;

  perform app_private.assert_device_collection_grant(
    v_device,
    p_collection_id,
    'run_summary_write'::public.grant_permission
  );

  perform 1
  from public.catalog_state as state
  where state.singleton_id = 1
  for share;

  select snapshot.*
  into v_snapshot
  from public.catalog_snapshots as snapshot
  where snapshot.version = btrim(p_catalog_snapshot_version)
    and snapshot.status = 'succeeded'::public.job_status
  for share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'talence_catalog_snapshot_unknown';
  end if;

  v_canonical_request := jsonb_build_object(
    'schema_version', 1,
    'external_run_id', btrim(p_external_run_id),
    'collection_id', p_collection_id,
    'status', p_status,
    'catalog_snapshot_version', v_snapshot.version,
    'started_at_utc', to_char(
      p_started_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'completed_at_utc', to_char(
      p_completed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'counts', jsonb_build_object(
      'total', v_total,
      'recognized', v_recognized,
      'unrecognized', v_unrecognized,
      'posted', v_posted
    ),
    'diagnostic_code', nullif(btrim(p_diagnostic_code), ''),
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  v_request_hash :=
    app_private.inventory_request_hash(v_canonical_request);

  -- Both public identities are immutable. Lock them in a fixed namespace
  -- order so concurrent first use becomes replay/conflict rather than a
  -- unique-constraint race.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'talence.device.run.idempotency:'
        || p_device_id::text
        || ':'
        || btrim(p_idempotency_key),
      0
    )
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'talence.device.run.external:'
        || p_device_id::text
        || ':'
        || btrim(p_external_run_id),
      0
    )
  );

  select request.*
  into v_existing_request
  from app_private.device_mutation_requests as request
  where request.operation_type = 'run_summary'
    and request.device_id = p_device_id
    and request.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_request.request_hash <> v_request_hash then
      raise exception using
        errcode = '23505',
        message = 'talence_device_idempotency_conflict';
    end if;

    return jsonb_set(
      v_existing_request.response_payload,
      '{replayed}',
      'true'::jsonb,
      true
    );
  end if;

  select request.*
  into v_existing_resource
  from app_private.device_mutation_requests as request
  join public.device_run_summaries as run_summary
    on run_summary.id = request.resource_id
  where request.operation_type = 'run_summary'
    and request.device_id = p_device_id
    and run_summary.external_run_id = btrim(p_external_run_id);

  if found then
    if v_existing_resource.request_hash <> v_request_hash then
      raise exception using
        errcode = '23505',
        message = 'talence_device_run_conflict';
    end if;

    return jsonb_set(
      v_existing_resource.response_payload,
      '{replayed}',
      'true'::jsonb,
      true
    );
  end if;

  insert into public.device_run_summaries (
    id,
    workspace_id,
    device_id,
    collection_id,
    idempotency_key,
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
    correlation_id,
    created_at
  )
  values (
    v_run_summary_id,
    v_device.workspace_id,
    p_device_id,
    p_collection_id,
    btrim(p_idempotency_key),
    btrim(p_external_run_id),
    p_status,
    v_snapshot.id,
    v_snapshot.version,
    v_total,
    v_recognized,
    v_unrecognized,
    v_posted,
    p_started_at,
    p_completed_at,
    v_received_at,
    nullif(btrim(p_diagnostic_code), ''),
    coalesce(p_metadata, '{}'::jsonb),
    p_request_id,
    v_received_at
  );

  v_result := jsonb_build_object(
    'run_summary_id', v_run_summary_id,
    'external_run_id', btrim(p_external_run_id),
    'accepted_at', v_received_at,
    'replayed', false
  );

  insert into app_private.device_mutation_requests (
    operation_type,
    device_id,
    idempotency_key,
    request_hash,
    resource_id,
    response_payload,
    created_at
  )
  values (
    'run_summary',
    p_device_id,
    btrim(p_idempotency_key),
    v_request_hash,
    v_run_summary_id,
    v_result,
    v_received_at
  );

  return v_result;
end;
$$;

revoke all on function app_private.device_semver_gte(text, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.lock_active_device_credential(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.consume_device_feature_quota(
  uuid,
  text,
  integer,
  integer,
  integer
) from public, anon, authenticated, service_role;
revoke all on function app_private.assert_device_collection_grant(
  public.devices,
  uuid,
  public.grant_permission
) from public, anon, authenticated, service_role;
revoke all on function app_private.latest_compatible_catalog_snapshot(
  text,
  integer[]
) from public, anon, authenticated, service_role;
revoke all on function app_private.normalize_device_inventory_lines(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.device_credential_candidate(text)
  from public, anon, authenticated, service_role;
revoke all on function public.device_auth_touch(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.device_api_me(
  uuid,
  uuid,
  uuid,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.device_api_heartbeat(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.device_api_catalog_manifest(
  uuid,
  uuid,
  uuid,
  text,
  text,
  integer[],
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.device_api_inventory_page(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.apply_device_inventory_batch(
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
) from public, anon, authenticated, service_role;
revoke all on function public.device_api_create_run_summary(
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
) from public, anon, authenticated, service_role;
