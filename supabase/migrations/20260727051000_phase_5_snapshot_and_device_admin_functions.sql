-- Phase 5: stale-safe catalog snapshot publication plus human device,
-- credential, lifecycle, and collection-grant administration.

create function app_private.has_workspace_role_for_user(
  p_user_id uuid,
  p_workspace_id uuid,
  p_minimum_role public.membership_role
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    app_api.is_admitted_user(p_user_id)
    and exists (
      select 1
      from public.workspace_memberships as membership
      where membership.workspace_id = p_workspace_id
        and membership.user_id = p_user_id
        and membership.status = 'active'::public.membership_status
        and app_private.membership_role_rank(membership.role)
          >= app_private.membership_role_rank(p_minimum_role)
    )
$$;

create function app_private.lock_workspace_role_for_user(
  p_user_id uuid,
  p_workspace_id uuid,
  p_minimum_role public.membership_role
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_workspace_status public.resource_status;
  v_membership_role public.membership_role;
  v_membership_status public.membership_status;
begin
  select workspace.status
  into v_workspace_status
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
  for share;

  if not found
    or v_workspace_status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_workspace_not_found';
  end if;

  select membership.role, membership.status
  into v_membership_role, v_membership_status
  from public.workspace_memberships as membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = p_user_id
  for share;

  if not found
    or v_membership_status <> 'active'::public.membership_status
    or app_private.membership_role_rank(v_membership_role)
      < app_private.membership_role_rank(p_minimum_role)
    or not app_api.is_admitted_user(p_user_id)
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_admin_denied';
  end if;
end;
$$;

create function app_private.device_json(p_device_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'device_id', device.id,
    'workspace_id', device.workspace_id,
    'name', device.name,
    'type', device.type,
    'manufacturer', device.manufacturer,
    'model', device.model,
    'serial_number', device.serial_number,
    'status', device.status,
    'last_seen_at', device.last_seen_at,
    'last_catalog_snapshot_id', device.last_catalog_snapshot_id,
    'last_catalog_snapshot_version', snapshot.version,
    'last_client_version', device.last_client_version,
    'last_firmware_version', device.last_firmware_version,
    'suspended_at', device.suspended_at,
    'revoked_at', device.revoked_at,
    'deleted_at', device.deleted_at,
    'created_by_user_id', device.created_by_user_id,
    'created_at', device.created_at,
    'updated_at', device.updated_at
  )
  from public.devices as device
  left join public.catalog_snapshots as snapshot
    on snapshot.id = device.last_catalog_snapshot_id
  where device.id = p_device_id
$$;

create function app_private.device_credential_json(p_credential_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'credential_id', credential.id,
    'prefix', credential.prefix,
    'created_at', credential.created_at,
    'expires_at', credential.expires_at,
    'last_used_at', credential.last_used_at,
    'revoked_at', credential.revoked_at,
    'is_active',
      credential.revoked_at is null
      and (
        credential.expires_at is null
        or credential.expires_at > statement_timestamp()
      )
  )
  from app_private.device_credentials as credential
  where credential.id = p_credential_id
$$;

create function app_private.device_grants_json(p_device_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection_id', grouped.collection_id,
        'collection_name', grouped.collection_name,
        'collection_status', grouped.collection_status,
        'permissions', grouped.permissions
      )
      order by
        lower(grouped.collection_name),
        grouped.collection_id
    ),
    '[]'::jsonb
  )
  from (
    select
      collection.id as collection_id,
      collection.name as collection_name,
      collection.status as collection_status,
      jsonb_agg(
        grant_row.permission
        order by grant_row.permission::text
      ) as permissions
    from public.device_collection_grants as grant_row
    join public.collections as collection
      on collection.id = grant_row.collection_id
      and collection.workspace_id = grant_row.workspace_id
    where grant_row.device_id = p_device_id
    group by collection.id, collection.name, collection.status
  ) as grouped
$$;

create function app_private.assert_device_input(
  p_name text,
  p_manufacturer text,
  p_model text,
  p_serial_number text
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 120
    or (
      p_manufacturer is not null
      and char_length(btrim(p_manufacturer)) not between 1 and 120
    )
    or (
      p_model is not null
      and char_length(btrim(p_model)) not between 1 and 120
    )
    or (
      p_serial_number is not null
      and char_length(btrim(p_serial_number)) not between 1 and 160
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_input_invalid';
  end if;
end;
$$;

create function app_private.assert_device_credential_input(
  p_prefix text,
  p_credential_digest text,
  p_expires_at timestamptz
)
returns void
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  if p_prefix is null
    or p_prefix <> lower(p_prefix)
    or p_prefix !~ '^[a-z0-9]{12,32}$'
    or p_credential_digest is null
    or p_credential_digest !~ '^[a-f0-9]{64}$'
    or (
      p_expires_at is not null
      and p_expires_at <= statement_timestamp() + interval '5 minutes'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_credential_input_invalid';
  end if;
end;
$$;

create function app_private.lock_managed_device(
  p_actor_user_id uuid,
  p_device_id uuid,
  p_allow_revoked boolean default false
)
returns public.devices
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_workspace_id uuid;
  v_device public.devices;
begin
  select device.workspace_id
  into v_workspace_id
  from public.devices as device
  where device.id = p_device_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_device_not_found';
  end if;

  perform app_private.lock_workspace_role_for_user(
    p_actor_user_id,
    v_workspace_id,
    'admin'::public.membership_role
  );

  select device.*
  into v_device
  from public.devices as device
  where device.id = p_device_id
  for update;

  if not found
    or v_device.workspace_id <> v_workspace_id
    or v_device.deleted_at is not null
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_device_not_found';
  end if;

  if not app_private.has_workspace_role_for_user(
    p_actor_user_id,
    v_device.workspace_id,
    'admin'::public.membership_role
  )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_admin_denied';
  end if;

  if not p_allow_revoked
    and v_device.status = 'revoked'::public.device_status
  then
    raise exception using
      errcode = '55000',
      message = 'talence_device_revoked';
  end if;

  return v_device;
end;
$$;

create function app_private.catalog_publish_snapshot(
  p_expected_import_id uuid,
  p_expected_catalog_version text,
  p_snapshot_schema_version integer,
  p_storage_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_record_counts jsonb,
  p_minimum_client_version text,
  p_generated_at timestamptz,
  p_api_contract_version text default 'v1'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.catalog_state;
  v_import public.catalog_import_runs;
  v_source public.catalog_source_files;
  v_game_id uuid;
  v_existing public.catalog_snapshots;
  v_snapshot_id uuid := gen_random_uuid();
  v_published_at timestamptz := statement_timestamp();
  v_previous_snapshot_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('talence:catalog-promotion', 0)
  );

  select state.*
  into v_state
  from public.catalog_state as state
  where state.singleton_id = 1
  for update;

  if not found
    or v_state.active_import_id is distinct from p_expected_import_id
    or v_state.active_catalog_version
      is distinct from p_expected_catalog_version
  then
    raise exception using
      errcode = '40001',
      message = 'talence_catalog_snapshot_stale';
  end if;

  select import_run.*
  into v_import
  from public.catalog_import_runs as import_run
  where import_run.id = p_expected_import_id
  for share;

  if not found
    or v_import.status <> 'succeeded'::public.job_status
    or v_import.catalog_version is distinct from p_expected_catalog_version
    or v_import.source_file_id is null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_snapshot_source_invalid';
  end if;

  select source.*
  into v_source
  from public.catalog_source_files as source
  where source.id = v_import.source_file_id
  for share;

  select game.id
  into v_game_id
  from public.games as game
  where game.code = 'mtg'
    and game.active;

  if not found
    or v_source.status <> 'succeeded'::public.job_status
    or v_source.catalog_identity_sha256 is null
    or v_source.provider_updated_at
      is distinct from v_state.last_successful_source_observed_at
    or v_game_id is null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_snapshot_source_invalid';
  end if;

  if p_expected_catalog_version is null
    or p_expected_catalog_version
      !~ '^mtg-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}-s[1-9][0-9]*$'
    or split_part(p_expected_catalog_version, '-', 2) <> to_char(
      v_source.provider_updated_at at time zone 'UTC',
      'YYYYMMDD"T"HH24MISS"Z"'
    )
    or split_part(p_expected_catalog_version, '-', 3)
      <> left(v_source.catalog_identity_sha256, 8)
    or p_snapshot_schema_version is null
    or p_snapshot_schema_version not between 1 and 32767
    or p_expected_catalog_version
      !~ ('-s' || p_snapshot_schema_version::text || '$')
    or p_storage_path is distinct from (
      'mtg/' || p_expected_catalog_version || '/catalog.sqlite'
    )
    or p_sha256 is null
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_byte_size is null
    or p_byte_size not between 1 and 1073741824
    or p_record_counts is null
    or not app_private.catalog_snapshot_counts_valid(p_record_counts)
    or p_minimum_client_version is null
    or p_minimum_client_version
      !~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$'
    or char_length(p_minimum_client_version) > 80
    or p_generated_at is null
    or v_source.downloaded_at is null
    or p_generated_at
      is distinct from date_trunc('second', v_source.provider_updated_at)
    or p_generated_at > v_published_at
    or p_api_contract_version is null
    or p_api_contract_version !~ '^v[1-9][0-9]*$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_snapshot_invalid';
  end if;

  select snapshot.*
  into v_existing
  from public.catalog_snapshots as snapshot
  where snapshot.version = p_expected_catalog_version;

  if found then
    if v_existing.game_id <> v_game_id
      or v_existing.schema_version <> p_snapshot_schema_version
      or v_existing.storage_path <> p_storage_path
      or v_existing.sha256 <> p_sha256
      or v_existing.byte_size <> p_byte_size
      or v_existing.record_counts <> p_record_counts
      or v_existing.minimum_client_version <> p_minimum_client_version
      or v_existing.generated_at <> p_generated_at
      or v_existing.api_contract_version <> p_api_contract_version
      or v_existing.provider_observed_at
        <> date_trunc('second', v_source.provider_updated_at)
      or v_existing.source_sha256
        <> v_source.catalog_identity_sha256
    then
      raise exception using
        errcode = '23505',
        message = 'talence_catalog_snapshot_replay_conflict';
    end if;

    if v_state.current_robot_snapshot_id is distinct from v_existing.id then
      v_previous_snapshot_id := v_state.current_robot_snapshot_id;

      update public.catalog_state
      set current_robot_snapshot_id = v_existing.id
      where singleton_id = 1;
    else
      select snapshot.id
      into v_previous_snapshot_id
      from public.catalog_snapshots as snapshot
      where snapshot.id <> v_existing.id
        and snapshot.game_id = v_existing.game_id
        and snapshot.schema_version = v_existing.schema_version
        and snapshot.status = 'succeeded'::public.job_status
        and (
          snapshot.published_at < v_existing.published_at
          or (
            snapshot.published_at = v_existing.published_at
            and snapshot.id < v_existing.id
          )
        )
      order by snapshot.published_at desc, snapshot.id desc
      limit 1;
    end if;

    return jsonb_build_object(
      'snapshot_id', v_existing.id,
      'version', v_existing.version,
      'status', v_existing.status,
      'published_at', v_existing.published_at,
      'current_snapshot_id', v_existing.id,
      'previous_snapshot_id', v_previous_snapshot_id,
      'replayed', true
    );
  end if;

  v_previous_snapshot_id := v_state.current_robot_snapshot_id;

  insert into public.catalog_snapshots (
    id,
    version,
    catalog_import_id,
    game_id,
    schema_version,
    status,
    storage_bucket,
    storage_path,
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
  )
  values (
    v_snapshot_id,
    p_expected_catalog_version,
    p_expected_import_id,
    v_game_id,
    p_snapshot_schema_version,
    'succeeded'::public.job_status,
    'catalog-snapshots',
    p_storage_path,
    p_sha256,
    p_byte_size,
    p_record_counts,
    p_minimum_client_version,
    p_api_contract_version,
    date_trunc('second', v_source.provider_updated_at),
    v_source.catalog_identity_sha256,
    p_generated_at,
    v_published_at,
    v_published_at
  );

  update public.catalog_state
  set current_robot_snapshot_id = v_snapshot_id
  where singleton_id = 1;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'version', p_expected_catalog_version,
    'status', 'succeeded',
    'published_at', v_published_at,
    'current_snapshot_id', v_snapshot_id,
    'previous_snapshot_id', v_previous_snapshot_id,
    'replayed', false
  );
end;
$$;

create function public.device_list(
  p_workspace_id uuid,
  p_status public.device_status default null,
  p_after text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_cursor jsonb;
  v_after_created_at timestamptz;
  v_after_id uuid;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor text;
  v_can_manage boolean;
begin
  if p_limit is null
    or p_limit not between 1 and 100
    or not app_api.has_workspace_role(
      p_workspace_id,
      'viewer'::public.membership_role
    )
  then
    raise exception using
      errcode = case
        when p_limit is null
          or p_limit not between 1 and 100 then '22023'
        else '42501'
      end,
      message = case
        when p_limit is null
          or p_limit not between 1 and 100
          then 'talence_device_page_invalid'
        else 'talence_device_access_denied'
      end;
  end if;

  if p_after is not null then
    begin
      v_cursor := app_private.inventory_decode_cursor(p_after);
      if (v_cursor ->> 'workspace_id')::uuid <> p_workspace_id
        or coalesce(v_cursor ->> 'status', '')
          <> coalesce(p_status::text, '')
      then
        raise exception using
          errcode = '22023',
          message = 'talence_device_cursor_invalid';
      end if;
      v_after_created_at :=
        (v_cursor ->> 'created_at')::timestamptz;
      v_after_id := (v_cursor ->> 'device_id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_device_cursor_invalid';
    end;
  end if;

  select coalesce(
    jsonb_agg(
      app_private.device_json(candidate.id)
      order by candidate.created_at desc, candidate.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select device.id, device.created_at
    from public.devices as device
    where device.workspace_id = p_workspace_id
      and device.deleted_at is null
      and (p_status is null or device.status = p_status)
      and (
        v_after_created_at is null
        or (device.created_at, device.id)
          < (v_after_created_at, v_after_id)
      )
    order by device.created_at desc, device.id desc
    limit p_limit + 1
  ) as candidate;

  v_has_more := jsonb_array_length(v_items) > p_limit;
  if v_has_more then
    v_items := v_items - p_limit;
  end if;

  if jsonb_array_length(v_items) > 0 then
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'workspace_id', p_workspace_id,
        'status', p_status,
        'created_at',
          v_items -> (jsonb_array_length(v_items) - 1) ->> 'created_at',
        'device_id',
          v_items -> (jsonb_array_length(v_items) - 1) ->> 'device_id'
      )
    );
  end if;

  v_can_manage := app_api.has_workspace_role(
    p_workspace_id,
    'admin'::public.membership_role
  );

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'permissions', jsonb_build_object(
      'can_manage', v_can_manage,
      'can_register', v_can_manage,
      'can_delete', v_can_manage
    ),
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.device_detail(p_device_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
  v_can_manage boolean;
  v_credentials jsonb := '[]'::jsonb;
  v_available_collections jsonb;
begin
  select device.*
  into v_device
  from public.devices as device
  where device.id = p_device_id
    and device.deleted_at is null;

  if not found
    or not app_api.has_workspace_role(
      v_device.workspace_id,
      'viewer'::public.membership_role
    )
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_device_not_found';
  end if;

  v_can_manage := app_api.has_workspace_role(
    v_device.workspace_id,
    'admin'::public.membership_role
  );

  if v_can_manage then
    select coalesce(
      jsonb_agg(
        app_private.device_credential_json(credential.id)
        order by credential.created_at desc, credential.id desc
      ),
      '[]'::jsonb
    )
    into v_credentials
    from app_private.device_credentials as credential
    where credential.device_id = p_device_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection_id', collection.id,
        'name', collection.name,
        'status', collection.status
      )
      order by lower(collection.name), collection.id
    ),
    '[]'::jsonb
  )
  into v_available_collections
  from public.collections as collection
  where collection.workspace_id = v_device.workspace_id
    and collection.status <> 'deleted'::public.resource_status;

  return jsonb_build_object(
    'device', app_private.device_json(p_device_id),
    'credentials', v_credentials,
    'grants', app_private.device_grants_json(p_device_id),
    'available_collections', v_available_collections,
    'permissions', jsonb_build_object(
      'can_manage', v_can_manage,
      'can_register', v_can_manage,
      'can_delete', v_can_manage
    )
  );
end;
$$;

create function public.device_register(
  p_actor_user_id uuid,
  p_workspace_id uuid,
  p_name text,
  p_type public.device_type,
  p_manufacturer text,
  p_model text,
  p_serial_number text,
  p_credential_prefix text,
  p_credential_digest text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device_id uuid := gen_random_uuid();
  v_credential_id uuid := gen_random_uuid();
begin
  if p_type is null then
    raise exception using
      errcode = '22023',
      message = 'talence_device_input_invalid';
  end if;

  perform app_private.lock_workspace_role_for_user(
    p_actor_user_id,
    p_workspace_id,
    'admin'::public.membership_role
  );
  perform app_private.assert_device_input(
    p_name,
    p_manufacturer,
    p_model,
    p_serial_number
  );
  perform app_private.assert_device_credential_input(
    p_credential_prefix,
    p_credential_digest,
    p_credential_expires_at
  );

  insert into public.devices (
    id,
    workspace_id,
    name,
    type,
    manufacturer,
    model,
    serial_number,
    status,
    created_by_user_id
  )
  values (
    v_device_id,
    p_workspace_id,
    btrim(p_name),
    p_type,
    nullif(btrim(p_manufacturer), ''),
    nullif(btrim(p_model), ''),
    nullif(btrim(p_serial_number), ''),
    'active'::public.device_status,
    p_actor_user_id
  );

  begin
    insert into app_private.device_credentials (
      id,
      device_id,
      prefix,
      secret_digest,
      created_by_user_id,
      expires_at
    )
    values (
      v_credential_id,
      v_device_id,
      p_credential_prefix,
      p_credential_digest,
      p_actor_user_id,
      p_credential_expires_at
    );
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'talence_device_credential_prefix_conflict';
  end;

  return jsonb_build_object(
    'device', app_private.device_json(v_device_id),
    'credential',
      app_private.device_credential_json(v_credential_id)
  );
end;
$$;

create function public.device_update(
  p_device_id uuid,
  p_name text,
  p_type public.device_type,
  p_manufacturer text,
  p_model text,
  p_serial_number text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
begin
  v_device := app_private.lock_managed_device(
    auth.uid(),
    p_device_id,
    false
  );
  perform app_private.assert_device_input(
    p_name,
    p_manufacturer,
    p_model,
    p_serial_number
  );

  if p_type is null then
    raise exception using
      errcode = '22023',
      message = 'talence_device_input_invalid';
  end if;

  if p_expected_updated_at is null
    or v_device.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_device_stale';
  end if;

  update public.devices
  set
    name = btrim(p_name),
    type = p_type,
    manufacturer = nullif(btrim(p_manufacturer), ''),
    model = nullif(btrim(p_model), ''),
    serial_number = nullif(btrim(p_serial_number), ''),
    updated_at = statement_timestamp()
  where id = p_device_id;

  return jsonb_build_object(
    'device',
    app_private.device_json(p_device_id)
  );
end;
$$;

create function public.device_set_status(
  p_device_id uuid,
  p_status public.device_status,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
begin
  if p_status is null
    or p_status not in (
    'active'::public.device_status,
    'suspended'::public.device_status
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_status_invalid';
  end if;

  v_device := app_private.lock_managed_device(
    auth.uid(),
    p_device_id,
    false
  );

  if p_expected_updated_at is null
    or v_device.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_device_stale';
  end if;

  update public.devices
  set
    status = p_status,
    suspended_at = case
      when p_status = 'suspended'::public.device_status
        then statement_timestamp()
      else null
    end,
    updated_at = statement_timestamp()
  where id = p_device_id;

  return jsonb_build_object(
    'device',
    app_private.device_json(p_device_id)
  );
end;
$$;

create function public.device_rotate_credential(
  p_actor_user_id uuid,
  p_device_id uuid,
  p_credential_prefix text,
  p_credential_digest text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_credential_id uuid := gen_random_uuid();
  v_revoked_ids uuid[];
begin
  perform app_private.lock_managed_device(
    p_actor_user_id,
    p_device_id,
    false
  );
  perform app_private.assert_device_credential_input(
    p_credential_prefix,
    p_credential_digest,
    p_credential_expires_at
  );

  perform credential.id
  from app_private.device_credentials as credential
  where credential.device_id = p_device_id
    and credential.revoked_at is null
  order by credential.id
  for update;

  select coalesce(
    array_agg(credential.id order by credential.id),
    '{}'::uuid[]
  )
  into v_revoked_ids
  from app_private.device_credentials as credential
  where credential.device_id = p_device_id
    and credential.revoked_at is null;

  update app_private.device_credentials
  set revoked_at = statement_timestamp()
  where device_id = p_device_id
    and revoked_at is null;

  begin
    insert into app_private.device_credentials (
      id,
      device_id,
      prefix,
      secret_digest,
      created_by_user_id,
      expires_at
    )
    values (
      v_credential_id,
      p_device_id,
      p_credential_prefix,
      p_credential_digest,
      p_actor_user_id,
      p_credential_expires_at
    );
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'talence_device_credential_prefix_conflict';
  end;

  update public.devices
  set updated_at = statement_timestamp()
  where id = p_device_id;

  return jsonb_build_object(
    'device_id', p_device_id,
    'credential',
      app_private.device_credential_json(v_credential_id),
    'revoked_credential_ids', to_jsonb(v_revoked_ids)
  );
end;
$$;

create function public.device_credential_revoke(
  p_device_id uuid,
  p_credential_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_credential app_private.device_credentials;
begin
  perform app_private.lock_managed_device(
    auth.uid(),
    p_device_id,
    false
  );

  select credential.*
  into v_credential
  from app_private.device_credentials as credential
  where credential.id = p_credential_id
    and credential.device_id = p_device_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_device_credential_not_found';
  end if;

  if v_credential.revoked_at is null then
    update app_private.device_credentials
    set revoked_at = statement_timestamp()
    where id = p_credential_id;

    update public.devices
    set updated_at = statement_timestamp()
    where id = p_device_id;
  end if;

  return jsonb_build_object(
    'credential',
    app_private.device_credential_json(p_credential_id)
  );
end;
$$;

create function public.device_revoke(
  p_device_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
begin
  v_device := app_private.lock_managed_device(
    auth.uid(),
    p_device_id,
    true
  );

  if p_expected_updated_at is null
    or v_device.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_device_stale';
  end if;

  if v_device.status <> 'revoked'::public.device_status then
    perform 1
    from app_private.device_credentials as credential
    where credential.device_id = p_device_id
    order by credential.id
    for update;

    update app_private.device_credentials
    set revoked_at = coalesce(revoked_at, statement_timestamp())
    where device_id = p_device_id;

    delete from public.device_collection_grants
    where device_id = p_device_id;

    update public.devices
    set
      status = 'revoked'::public.device_status,
      revoked_at = statement_timestamp(),
      updated_at = statement_timestamp()
    where id = p_device_id;
  end if;

  return jsonb_build_object(
    'device',
    app_private.device_json(p_device_id)
  );
end;
$$;

create function public.device_delete(
  p_device_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_device public.devices;
begin
  v_device := app_private.lock_managed_device(
    auth.uid(),
    p_device_id,
    true
  );

  if p_expected_updated_at is null
    or v_device.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_device_stale';
  end if;

  if v_device.status <> 'revoked'::public.device_status then
    raise exception using
      errcode = '55000',
      message = 'talence_device_delete_requires_revoked';
  end if;

  update public.devices
  set
    deleted_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = p_device_id;

  return jsonb_build_object(
    'device',
    app_private.device_json(p_device_id)
  );
end;
$$;

create function public.device_grants_replace(
  p_device_id uuid,
  p_grants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_device public.devices;
  v_item jsonb;
  v_permission jsonb;
  v_collection_id uuid;
  v_permission_value public.grant_permission;
  v_normalized jsonb := '[]'::jsonb;
begin
  v_device := app_private.lock_managed_device(
    v_actor_user_id,
    p_device_id,
    false
  );

  if p_grants is null
    or jsonb_typeof(p_grants) <> 'array'
    or jsonb_array_length(p_grants) > 100
    or pg_column_size(p_grants) > 131072
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_grants_invalid';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_grants) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not v_item ?& array['collection_id', 'permissions']
      or v_item - 'collection_id' - 'permissions' <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'permissions') <> 'array'
      or jsonb_array_length(v_item -> 'permissions') not between 1 and 3
    then
      raise exception using
        errcode = '22023',
        message = 'talence_device_grants_invalid';
    end if;

    begin
      v_collection_id := (v_item ->> 'collection_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception using
          errcode = '22023',
          message = 'talence_device_grants_invalid';
    end;

    for v_permission in
      select permission.value
      from jsonb_array_elements(v_item -> 'permissions')
        as permission(value)
    loop
      begin
        v_permission_value :=
          (v_permission #>> '{}')::public.grant_permission;
      exception
        when invalid_text_representation then
          raise exception using
            errcode = '22023',
            message = 'talence_device_grants_invalid';
      end;

      v_normalized := v_normalized || jsonb_build_array(
        jsonb_build_object(
          'collection_id', v_collection_id,
          'permission', v_permission_value
        )
      );
    end loop;
  end loop;

  if exists (
    select 1
    from jsonb_to_recordset(v_normalized) as grant_row(
      collection_id uuid,
      permission public.grant_permission
    )
    group by grant_row.collection_id, grant_row.permission
    having count(*) > 1
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_device_grants_duplicate';
  end if;

  perform collection.id
  from public.collections as collection
  join (
    select distinct grant_row.collection_id
    from jsonb_to_recordset(v_normalized) as grant_row(
      collection_id uuid,
      permission public.grant_permission
    )
  ) as requested
    on requested.collection_id = collection.id
  where collection.workspace_id = v_device.workspace_id
  order by collection.id
  for share of collection;

  if (
    select count(distinct grant_row.collection_id)
    from jsonb_to_recordset(v_normalized) as grant_row(
      collection_id uuid,
      permission public.grant_permission
    )
  ) <> (
    select count(distinct collection.id)
    from public.collections as collection
    join jsonb_to_recordset(v_normalized) as grant_row(
      collection_id uuid,
      permission public.grant_permission
    )
      on grant_row.collection_id = collection.id
    where collection.workspace_id = v_device.workspace_id
      and collection.status = 'active'::public.resource_status
  )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_device_grant_collection_invalid';
  end if;

  if not app_private.has_workspace_role_for_user(
    v_actor_user_id,
    v_device.workspace_id,
    'admin'::public.membership_role
  )
    or exists (
      select 1
      from public.devices as current_device
      where current_device.id = p_device_id
        and (
          current_device.status = 'revoked'::public.device_status
          or current_device.deleted_at is not null
        )
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_device_admin_denied';
  end if;

  delete from public.device_collection_grants
  where device_id = p_device_id;

  insert into public.device_collection_grants (
    workspace_id,
    device_id,
    collection_id,
    permission,
    granted_by_user_id
  )
  select
    v_device.workspace_id,
    p_device_id,
    grant_row.collection_id,
    grant_row.permission,
    v_actor_user_id
  from jsonb_to_recordset(v_normalized) as grant_row(
    collection_id uuid,
    permission public.grant_permission
  )
  order by grant_row.collection_id, grant_row.permission::text;

  update public.devices
  set updated_at = statement_timestamp()
  where id = p_device_id;

  return jsonb_build_object(
    'device_id', p_device_id,
    'grants', app_private.device_grants_json(p_device_id)
  );
end;
$$;

revoke all on function app_private.has_workspace_role_for_user(
  uuid,
  uuid,
  public.membership_role
) from public, anon, authenticated, service_role;
revoke all on function app_private.lock_workspace_role_for_user(
  uuid,
  uuid,
  public.membership_role
) from public, anon, authenticated, service_role;
revoke all on function app_private.device_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.device_credential_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.device_grants_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.assert_device_input(
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function app_private.assert_device_credential_input(
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.lock_managed_device(
  uuid,
  uuid,
  boolean
) from public, anon, authenticated, service_role;
revoke all on function app_private.catalog_publish_snapshot(
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
) from public, anon, authenticated, service_role;

revoke all on function public.device_list(
  uuid,
  public.device_status,
  text,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.device_detail(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.device_register(
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
) from public, anon, authenticated, service_role;
revoke all on function public.device_update(
  uuid,
  text,
  public.device_type,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.device_set_status(
  uuid,
  public.device_status,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.device_rotate_credential(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.device_credential_revoke(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.device_revoke(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.device_delete(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.device_grants_replace(uuid, jsonb)
  from public, anon, authenticated, service_role;
