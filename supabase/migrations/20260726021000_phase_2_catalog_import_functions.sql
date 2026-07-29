-- Phase 2: trusted worker coordination, validation, and atomic promotion.

create function app_private.catalog_register_source_file(
  p_provider text,
  p_source_type text,
  p_provider_object_id text,
  p_provider_updated_at timestamptz,
  p_download_uri text,
  p_content_type text default null,
  p_content_encoding text default null,
  p_compressed_size bigint default null,
  p_downloaded_size bigint default null,
  p_sha256 text default null,
  p_downloaded_at timestamptz default null,
  p_dependency_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_provider text := lower(btrim(p_provider));
  v_source_type text := lower(btrim(p_source_type));
  v_object_id text := btrim(p_provider_object_id);
  v_sha256 text := lower(btrim(p_sha256));
  v_dependency_sha256 text := lower(btrim(p_dependency_sha256));
  v_source_file_id uuid;
  v_existing_sha256 text;
  v_replayed boolean := false;
  v_successful_import_id uuid;
begin
  if v_provider is null
    or char_length(v_provider) not between 1 and 64
    or v_source_type is null
    or char_length(v_source_type) not between 1 and 64
    or v_object_id is null
    or char_length(v_object_id) not between 1 and 256
    or p_provider_updated_at is null
    or p_download_uri is null
    or char_length(btrim(p_download_uri)) not between 1 and 4096
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_source_metadata_invalid';
  end if;

  if v_provider = 'scryfall'
    and v_source_type <> 'fixture'
    and p_download_uri !~ '^https://'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_source_https_required';
  end if;

  if p_compressed_size is not null and p_compressed_size < 0
    or p_downloaded_size is not null and p_downloaded_size < 0
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_source_size_invalid';
  end if;

  if p_sha256 is not null
    and v_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_source_sha256_invalid';
  end if;

  if p_dependency_sha256 is not null
    and v_dependency_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_source_dependency_sha256_invalid';
  end if;

  select sf.id, sf.sha256
  into v_source_file_id, v_existing_sha256
  from public.catalog_source_files as sf
  where sf.provider = v_provider
    and sf.source_type = v_source_type
    and sf.provider_object_id = v_object_id
    and sf.provider_updated_at = p_provider_updated_at
    and sf.dependency_sha256 is not distinct from v_dependency_sha256
  for update;

  if found then
    v_replayed := true;
    if v_existing_sha256 is not null
      and v_sha256 is not null
      and v_existing_sha256 <> v_sha256
    then
      raise exception using
        errcode = '23505',
        message = 'talence_catalog_source_checksum_conflict';
    end if;

    update public.catalog_source_files
    set
      download_uri = p_download_uri,
      content_type = coalesce(p_content_type, content_type),
      content_encoding = coalesce(p_content_encoding, content_encoding),
      compressed_size = coalesce(p_compressed_size, compressed_size),
      downloaded_size = coalesce(p_downloaded_size, downloaded_size),
      sha256 = coalesce(v_sha256, sha256),
      dependency_sha256 = coalesce(
        v_dependency_sha256,
        dependency_sha256
      ),
      downloaded_at = coalesce(p_downloaded_at, downloaded_at),
      status = case
        when coalesce(v_sha256, sha256) is not null
          and coalesce(p_downloaded_at, downloaded_at) is not null
          and coalesce(p_downloaded_size, downloaded_size) is not null
        then 'succeeded'::public.job_status
        else 'running'::public.job_status
      end
    where id = v_source_file_id;
  else
    insert into public.catalog_source_files (
      provider,
      source_type,
      provider_object_id,
      provider_updated_at,
      download_uri,
      content_type,
      content_encoding,
      compressed_size,
      downloaded_size,
      sha256,
      dependency_sha256,
      downloaded_at,
      status
    )
    values (
      v_provider,
      v_source_type,
      v_object_id,
      p_provider_updated_at,
      p_download_uri,
      p_content_type,
      p_content_encoding,
      p_compressed_size,
      p_downloaded_size,
      v_sha256,
      v_dependency_sha256,
      p_downloaded_at,
      case
        when v_sha256 is not null
          and p_downloaded_at is not null
          and p_downloaded_size is not null
        then 'succeeded'::public.job_status
        else 'running'::public.job_status
      end
    )
    returning id into v_source_file_id;
  end if;

  select cir.id
  into v_successful_import_id
  from public.catalog_import_runs as cir
  join public.catalog_source_files as successful_source
    on successful_source.id = cir.source_file_id
  join public.catalog_state as current_state
    on current_state.singleton_id = 1
    and current_state.active_import_id = cir.id
  where cir.status = 'succeeded'::public.job_status
    and successful_source.provider = v_provider
    and successful_source.source_type = v_source_type
    and successful_source.provider_object_id = v_object_id
    and successful_source.provider_updated_at = p_provider_updated_at
    and successful_source.dependency_sha256
      is not distinct from v_dependency_sha256
    and (
      v_sha256 is null
      or successful_source.sha256 is null
      or successful_source.sha256 = v_sha256
    )
  order by cir.completed_at desc, cir.id desc
  limit 1;

  return jsonb_build_object(
    'source_file_id', v_source_file_id,
    'status', (
      select sf.status
      from public.catalog_source_files as sf
      where sf.id = v_source_file_id
    ),
    'sha256', (
      select sf.sha256
      from public.catalog_source_files as sf
      where sf.id = v_source_file_id
    ),
    'dependency_sha256', (
      select sf.dependency_sha256
      from public.catalog_source_files as sf
      where sf.id = v_source_file_id
    ),
    'catalog_identity_sha256', (
      select sf.catalog_identity_sha256
      from public.catalog_source_files as sf
      where sf.id = v_source_file_id
    ),
    'replayed', v_replayed,
    'unchanged', v_successful_import_id is not null,
    'successful_import_id', v_successful_import_id
  );
end;
$$;

create function app_private.catalog_purge_import_staging(
  p_import_run_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_total bigint := 0;
  v_count bigint;
begin
  delete from app_private.catalog_stage_prices
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from app_private.catalog_stage_external_ids
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from app_private.catalog_stage_legalities
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from app_private.catalog_stage_faces
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from app_private.catalog_stage_printings
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from app_private.catalog_stage_cards
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from app_private.catalog_stage_sets
  where import_run_id = p_import_run_id;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

create function app_private.catalog_begin_import(
  p_source_file_id uuid,
  p_trigger_type text,
  p_worker_version text,
  p_force boolean default false,
  p_queued_import_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source public.catalog_source_files%rowtype;
  v_trigger_type text := lower(btrim(p_trigger_type));
  v_worker_version text := btrim(p_worker_version);
  v_sync_enabled boolean;
  v_existing_import_id uuid;
  v_active_version text;
  v_import_run_id uuid;
  v_effective_force boolean := coalesce(p_force, false);
  v_cleanup_import_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('talence:catalog-import-worker', 0)
  );

  update public.catalog_import_runs
  set
    status = 'failed'::public.job_status,
    completed_at = statement_timestamp(),
    error_code = 'worker_heartbeat_expired',
    error_summary = 'The worker heartbeat expired before the import completed.'
  where status = 'running'::public.job_status
    and updated_at
      < statement_timestamp() - interval '30 minutes';

  for v_cleanup_import_id in
    select import_run.id
    from public.catalog_import_runs as import_run
    where import_run.status in (
      'failed'::public.job_status,
      'cancelled'::public.job_status
    )
      and import_run.completed_at
        < statement_timestamp() - interval '30 days'
  loop
    perform app_private.catalog_purge_import_staging(
      v_cleanup_import_id
    );
  end loop;

  select cs.sync_enabled, cs.active_catalog_version
  into v_sync_enabled, v_active_version
  from public.catalog_state as cs
  where cs.singleton_id = 1
  for update;

  if not coalesce(v_sync_enabled, false) then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_sync_disabled';
  end if;

  if v_trigger_type not in ('manual', 'scheduled', 'fixture', 'live')
    or v_worker_version is null
    or char_length(v_worker_version) not between 1 and 128
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_import_arguments_invalid';
  end if;

  select sf.*
  into v_source
  from public.catalog_source_files as sf
  where sf.id = p_source_file_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_catalog_source_not_found';
  end if;

  if v_source.status <> 'succeeded'::public.job_status
    or v_source.sha256 is null
    or v_source.downloaded_at is null
    or v_source.downloaded_size is null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_source_not_ready';
  end if;

  if p_queued_import_id is not null then
    select cir.requested_force
    into v_effective_force
    from public.catalog_import_runs as cir
    where cir.id = p_queued_import_id
      and cir.status = 'queued'::public.job_status
    for update;

    if not found then
      raise exception using
        errcode = '55000',
        message = 'talence_catalog_queued_import_not_claimable';
    end if;

    v_effective_force := v_effective_force or coalesce(p_force, false);
  end if;

  if not v_effective_force then
    select cir.id
    into v_existing_import_id
    from public.catalog_import_runs as cir
    join public.catalog_source_files as prior_source
      on prior_source.id = cir.source_file_id
    join public.catalog_state as current_state
      on current_state.singleton_id = 1
      and current_state.active_import_id = cir.id
    where cir.status = 'succeeded'::public.job_status
      and prior_source.provider = v_source.provider
      and prior_source.source_type = v_source.source_type
      and prior_source.provider_object_id = v_source.provider_object_id
    and prior_source.provider_updated_at = v_source.provider_updated_at
      and prior_source.dependency_sha256
        is not distinct from v_source.dependency_sha256
      and prior_source.sha256 = v_source.sha256
    order by cir.completed_at desc, cir.id desc
    limit 1;
  end if;

  if v_existing_import_id is not null then
    if p_queued_import_id is not null then
      update public.catalog_import_runs
      set
        source_file_id = p_source_file_id,
        status = 'succeeded'::public.job_status,
        requested_force = v_effective_force,
        completed_at = statement_timestamp(),
        worker_version = v_worker_version,
        catalog_version = v_active_version,
        error_code = null,
        error_summary = null,
        validation_summary = jsonb_build_object(
          'valid', true,
          'noop', true,
          'replayed_import_id', v_existing_import_id
        )
      where id = p_queued_import_id;
      v_import_run_id := p_queued_import_id;
    else
      v_import_run_id := v_existing_import_id;
    end if;

    return jsonb_build_object(
      'import_run_id', v_import_run_id,
      'status', 'succeeded',
      'replayed', true,
      'noop', true,
      'active_catalog_version', v_active_version
    );
  end if;

  if p_queued_import_id is not null then
    update public.catalog_import_runs
    set
      source_file_id = p_source_file_id,
      status = 'running'::public.job_status,
      trigger_type = v_trigger_type,
      requested_force = v_effective_force,
      started_at = statement_timestamp(),
      completed_at = null,
      worker_version = v_worker_version,
      error_code = null,
      error_summary = null,
      validation_summary = '{}'::jsonb
    where id = p_queued_import_id
    returning id into v_import_run_id;
  else
    insert into public.catalog_import_runs (
      source_file_id,
      status,
      trigger_type,
      requested_force,
      started_at,
      worker_version
    )
    values (
      p_source_file_id,
      'running'::public.job_status,
      v_trigger_type,
      v_effective_force,
      statement_timestamp(),
      v_worker_version
    )
    returning id into v_import_run_id;
  end if;

  return jsonb_build_object(
    'import_run_id', v_import_run_id,
    'status', 'running',
    'replayed', false,
    'noop', false,
    'active_catalog_version', v_active_version
  );
end;
$$;

create function app_private.catalog_heartbeat_import(p_import_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_heartbeat_at timestamptz := statement_timestamp();
  v_sync_enabled boolean;
begin
  select catalog_state.sync_enabled
  into v_sync_enabled
  from public.catalog_state as catalog_state
  where catalog_state.singleton_id = 1
  for update;

  if not coalesce(v_sync_enabled, false) then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_sync_disabled';
  end if;

  update public.catalog_import_runs
  set updated_at = v_heartbeat_at
  where id = p_import_run_id
    and status = 'running'::public.job_status;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_import_not_running';
  end if;

  return jsonb_build_object(
    'import_run_id', p_import_run_id,
    'status', 'running',
    'heartbeat_at', v_heartbeat_at
  );
end;
$$;

create function app_private.catalog_fail_import(
  p_import_run_id uuid,
  p_error_code text,
  p_error_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.catalog_import_runs%rowtype;
  v_error_code text := lower(btrim(p_error_code));
  v_error_summary text := nullif(btrim(p_error_summary), '');
  v_replayed boolean := false;
begin
  if v_error_code is null
    or char_length(v_error_code) not between 1 and 128
    or v_error_code !~ '^[a-z0-9][a-z0-9_.-]*$'
    or v_error_summary is not null
      and char_length(v_error_summary) > 4000
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_failure_invalid';
  end if;

  select cir.*
  into v_run
  from public.catalog_import_runs as cir
  where cir.id = p_import_run_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_catalog_import_not_found';
  end if;

  if v_run.status = 'succeeded'::public.job_status then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_succeeded_import_immutable';
  end if;

  if v_run.status = 'failed'::public.job_status then
    v_replayed := true;
  else
    update public.catalog_import_runs
    set
      status = 'failed'::public.job_status,
      completed_at = statement_timestamp(),
      error_code = v_error_code,
      error_summary = v_error_summary
    where id = p_import_run_id;
  end if;

  return jsonb_build_object(
    'import_run_id', p_import_run_id,
    'status', 'failed',
    'error_code', coalesce(v_run.error_code, v_error_code),
    'replayed', v_replayed
  );
end;
$$;

create function app_private.catalog_fail_queued_import(
  p_queued_import_id uuid,
  p_error_code text,
  p_error_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.catalog_import_runs%rowtype;
begin
  select import_run.*
  into v_run
  from public.catalog_import_runs as import_run
  where import_run.id = p_queued_import_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_catalog_import_not_found';
  end if;

  if v_run.status = 'failed'::public.job_status
    and v_run.started_at is null
  then
    return jsonb_build_object(
      'import_run_id', v_run.id,
      'status', 'failed',
      'error_code', v_run.error_code,
      'replayed', true
    );
  end if;

  if v_run.status <> 'queued'::public.job_status
    or v_run.started_at is not null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_queued_import_not_fail_markable';
  end if;

  return app_private.catalog_fail_import(
    p_queued_import_id,
    p_error_code,
    p_error_summary
  );
end;
$$;

create function app_private.catalog_complete_queued_noop(
  p_queued_import_id uuid,
  p_provider text,
  p_source_type text,
  p_provider_object_id text,
  p_provider_updated_at timestamptz,
  p_dependency_sha256 text,
  p_worker_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_provider text := lower(btrim(p_provider));
  v_source_type text := lower(btrim(p_source_type));
  v_provider_object_id text := btrim(p_provider_object_id);
  v_dependency_sha256 text := lower(btrim(p_dependency_sha256));
  v_worker_version text := btrim(p_worker_version);
  v_state public.catalog_state%rowtype;
  v_run public.catalog_import_runs%rowtype;
  v_active_run public.catalog_import_runs%rowtype;
  v_active_source public.catalog_source_files%rowtype;
  v_recorded_source public.catalog_source_files%rowtype;
  v_replayed_import_id uuid;
begin
  if v_provider is null
    or char_length(v_provider) not between 1 and 64
    or v_source_type is null
    or char_length(v_source_type) not between 1 and 64
    or v_provider_object_id is null
    or char_length(v_provider_object_id) not between 1 and 256
    or p_provider_updated_at is null
    or v_dependency_sha256 is not null
      and v_dependency_sha256 !~ '^[a-f0-9]{64}$'
    or v_worker_version is null
    or char_length(v_worker_version) not between 1 and 128
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_queued_noop_arguments_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talence:catalog-import-worker', 0)
  );

  select catalog_state.*
  into v_state
  from public.catalog_state as catalog_state
  where catalog_state.singleton_id = 1
  for update;

  if not coalesce(v_state.sync_enabled, false) then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_sync_disabled';
  end if;

  select import_run.*
  into v_run
  from public.catalog_import_runs as import_run
  where import_run.id = p_queued_import_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_catalog_import_not_found';
  end if;

  if v_run.status = 'succeeded'::public.job_status
    and v_run.started_at is null
    and coalesce(
      (v_run.validation_summary ->> 'noop')::boolean,
      false
    )
  then
    select source_file.*
    into v_recorded_source
    from public.catalog_source_files as source_file
    where source_file.id = v_run.source_file_id;

    if not found
      or v_recorded_source.provider <> v_provider
      or v_recorded_source.source_type <> v_source_type
      or v_recorded_source.provider_object_id <> v_provider_object_id
      or v_recorded_source.provider_updated_at <> p_provider_updated_at
      or v_recorded_source.dependency_sha256
        is distinct from v_dependency_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_queued_noop_replay_conflict';
    end if;

    begin
      v_replayed_import_id :=
        (v_run.validation_summary ->> 'replayed_import_id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '55000',
          message = 'talence_catalog_queued_noop_state_invalid';
    end;

    return jsonb_build_object(
      'import_run_id', v_run.id,
      'status', 'succeeded',
      'noop', true,
      'catalog_version', v_run.catalog_version,
      'active_import_id', v_replayed_import_id,
      'replayed', true
    );
  end if;

  if v_run.status <> 'queued'::public.job_status
    or v_run.started_at is not null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_queued_import_not_noop_completable';
  end if;

  if v_run.requested_force
    or v_state.active_import_id is null
    or v_state.active_catalog_version is null
  then
    return jsonb_build_object(
      'import_run_id', v_run.id,
      'status', 'queued',
      'noop', false,
      'catalog_version', v_state.active_catalog_version,
      'active_import_id', v_state.active_import_id,
      'replayed', false
    );
  end if;

  select import_run.*
  into v_active_run
  from public.catalog_import_runs as import_run
  where import_run.id = v_state.active_import_id
    and import_run.status = 'succeeded'::public.job_status
    and import_run.catalog_version = v_state.active_catalog_version;

  if not found then
    return jsonb_build_object(
      'import_run_id', v_run.id,
      'status', 'queued',
      'noop', false,
      'catalog_version', v_state.active_catalog_version,
      'active_import_id', v_state.active_import_id,
      'replayed', false
    );
  end if;

  select source_file.*
  into v_active_source
  from public.catalog_source_files as source_file
  where source_file.id = v_active_run.source_file_id
    and source_file.status = 'succeeded'::public.job_status
    and source_file.sha256 is not null;

  if not found
    or v_active_source.provider <> v_provider
    or v_active_source.source_type <> v_source_type
    or v_active_source.provider_object_id <> v_provider_object_id
    or v_active_source.provider_updated_at <> p_provider_updated_at
    or v_active_source.dependency_sha256
      is distinct from v_dependency_sha256
  then
    return jsonb_build_object(
      'import_run_id', v_run.id,
      'status', 'queued',
      'noop', false,
      'catalog_version', v_state.active_catalog_version,
      'active_import_id', v_state.active_import_id,
      'replayed', false
    );
  end if;

  update public.catalog_import_runs
  set
    source_file_id = v_active_source.id,
    status = 'succeeded'::public.job_status,
    completed_at = statement_timestamp(),
    worker_version = v_worker_version,
    catalog_version = v_state.active_catalog_version,
    error_code = null,
    error_summary = null,
    validation_summary = jsonb_build_object(
      'valid', true,
      'noop', true,
      'replayed_import_id', v_active_run.id
    )
  where id = v_run.id;

  return jsonb_build_object(
    'import_run_id', v_run.id,
    'status', 'succeeded',
    'noop', true,
    'catalog_version', v_state.active_catalog_version,
    'active_import_id', v_active_run.id,
    'replayed', false
  );
end;
$$;

create function app_private.catalog_validate_import(
  p_import_run_id uuid,
  p_max_rejections integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.catalog_import_runs%rowtype;
  v_sets bigint;
  v_cards bigint;
  v_printings bigint;
  v_faces bigint;
  v_legalities bigint;
  v_external_ids bigint;
  v_prices bigint;
  v_records_written bigint;
  v_active_sets bigint;
  v_active_cards bigint;
  v_active_printings bigint;
  v_errors text[] := '{}'::text[];
  v_summary jsonb;
begin
  if p_max_rejections is null or p_max_rejections < 0 then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_rejection_threshold_invalid';
  end if;

  select cir.*
  into v_run
  from public.catalog_import_runs as cir
  where cir.id = p_import_run_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_catalog_import_not_found';
  end if;

  if v_run.status = 'failed'::public.job_status
    and v_run.error_code = 'validation_failed'
  then
    return v_run.validation_summary
      || jsonb_build_object(
        'import_run_id', p_import_run_id,
        'status', 'failed',
        'replayed', true
      );
  end if;

  if v_run.status <> 'running'::public.job_status then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_import_not_validatable';
  end if;

  select count(*) into v_sets
  from app_private.catalog_stage_sets
  where import_run_id = p_import_run_id;

  select count(*) into v_cards
  from app_private.catalog_stage_cards
  where import_run_id = p_import_run_id;

  select count(*) into v_printings
  from app_private.catalog_stage_printings
  where import_run_id = p_import_run_id;

  select count(*) into v_faces
  from app_private.catalog_stage_faces
  where import_run_id = p_import_run_id;

  select count(*) into v_legalities
  from app_private.catalog_stage_legalities
  where import_run_id = p_import_run_id;

  select count(*) into v_external_ids
  from app_private.catalog_stage_external_ids
  where import_run_id = p_import_run_id;

  select count(*) into v_prices
  from app_private.catalog_stage_prices
  where import_run_id = p_import_run_id;

  if v_sets = 0 then
    v_errors := array_append(v_errors, 'sets_empty');
  end if;
  if v_cards = 0 then
    v_errors := array_append(v_errors, 'cards_empty');
  end if;
  if v_printings = 0 then
    v_errors := array_append(v_errors, 'printings_empty');
  end if;

  if v_run.records_seen <> v_printings then
    v_errors := array_append(v_errors, 'records_seen_mismatch');
  end if;

  if v_run.trigger_type <> 'fixture' then
    if v_sets < 100
      or v_cards < 10000
      or v_printings < 50000
    then
      v_errors := array_append(
        v_errors,
        'live_absolute_floor_failed'
      );
    end if;

    select
      count(*) filter (where active),
      (
        select count(*)
        from public.catalog_cards
        where active
      ),
      (
        select count(*)
        from public.catalog_printings
        where active
      )
    into v_active_sets, v_active_cards, v_active_printings
    from public.catalog_sets;

    if (
      v_active_sets > 0
      and v_sets * 100 < v_active_sets * 80
    )
      or (
        v_active_cards > 0
        and v_cards * 100 < v_active_cards * 80
      )
      or (
        v_active_printings > 0
        and v_printings * 100 < v_active_printings * 80
      )
    then
      v_errors := array_append(
        v_errors,
        'active_count_regression'
      );
    end if;
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_sets as staged_set
    where staged_set.import_run_id = p_import_run_id
      and staged_set.parent_set_id is not null
      and not exists (
        select 1
        from app_private.catalog_stage_sets as parent_set
        where parent_set.import_run_id = p_import_run_id
          and parent_set.set_id = staged_set.parent_set_id
      )
  ) then
    v_errors := array_append(v_errors, 'set_parent_missing');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_printings as staged_printing
    where staged_printing.import_run_id = p_import_run_id
      and not exists (
        select 1
        from app_private.catalog_stage_sets as staged_set
        where staged_set.import_run_id = p_import_run_id
          and staged_set.set_id = staged_printing.set_id
      )
  ) then
    v_errors := array_append(v_errors, 'printing_set_missing');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_printings as staged_printing
    where staged_printing.import_run_id = p_import_run_id
      and staged_printing.oracle_card_id is not null
      and not exists (
        select 1
        from app_private.catalog_stage_cards as staged_card
        where staged_card.import_run_id = p_import_run_id
          and staged_card.oracle_card_id = staged_printing.oracle_card_id
      )
  ) then
    v_errors := array_append(v_errors, 'printing_card_missing');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_printings as staged_printing
    where staged_printing.import_run_id = p_import_run_id
      and (
        not exists (
          select 1
          from app_private.catalog_stage_faces as staged_face
          where staged_face.import_run_id = p_import_run_id
            and staged_face.printing_id = staged_printing.printing_id
        )
        or (
          select min(staged_face.face_index) <> 0
            or max(staged_face.face_index) <> count(*) - 1
          from app_private.catalog_stage_faces as staged_face
          where staged_face.import_run_id = p_import_run_id
            and staged_face.printing_id = staged_printing.printing_id
        )
      )
  ) then
    v_errors := array_append(v_errors, 'face_order_invalid');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_faces as staged_face
    where staged_face.import_run_id = p_import_run_id
      and not exists (
        select 1
        from app_private.catalog_stage_printings as staged_printing
        where staged_printing.import_run_id = p_import_run_id
          and staged_printing.printing_id = staged_face.printing_id
      )
  ) then
    v_errors := array_append(v_errors, 'face_printing_missing');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_cards as staged_card
    where staged_card.import_run_id = p_import_run_id
      and (
        staged_card.normalized_name
          <> app_private.normalize_catalog_search_text(staged_card.name)
        or staged_card.mana_value < 0
        or not staged_card.colors
          <@ array['W', 'U', 'B', 'R', 'G']::text[]
        or not staged_card.color_identity
          <@ array['W', 'U', 'B', 'R', 'G']::text[]
      )
  ) then
    v_errors := array_append(v_errors, 'card_value_invalid');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_printings as staged_printing
    where staged_printing.import_run_id = p_import_run_id
      and (
        staged_printing.language <> lower(btrim(staged_printing.language))
        or staged_printing.language !~ '^[a-z][a-z0-9_-]{1,15}$'
        or cardinality(staged_printing.finishes) not between 1 and 3
        or not staged_printing.finishes <@ array[
          'nonfoil'::public.card_finish,
          'foil'::public.card_finish,
          'etched'::public.card_finish
        ]
        or not staged_printing.color_identity
          <@ array['W', 'U', 'B', 'R', 'G']::text[]
        or cardinality(staged_printing.finishes) <> (
          select count(distinct finish_value)
          from unnest(staged_printing.finishes) as finish_value
        )
      )
  ) then
    v_errors := array_append(v_errors, 'printing_value_invalid');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_legalities as staged_legality
    where staged_legality.import_run_id = p_import_run_id
      and (
        staged_legality.legality
          not in ('legal', 'not_legal', 'restricted', 'banned')
        or staged_legality.format_code
          !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
        or not exists (
          select 1
          from app_private.catalog_stage_cards as staged_card
          where staged_card.import_run_id = p_import_run_id
            and staged_card.oracle_card_id = staged_legality.oracle_card_id
        )
      )
  ) then
    v_errors := array_append(v_errors, 'legality_invalid');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_external_ids as staged_id
    where staged_id.import_run_id = p_import_run_id
      and (
        staged_id.entity_type not in ('card', 'printing', 'set')
        or case staged_id.entity_type
          when 'card' then not exists (
            select 1
            from app_private.catalog_stage_cards as staged_card
            where staged_card.import_run_id = p_import_run_id
              and staged_card.oracle_card_id = staged_id.entity_id
          )
          when 'printing' then not exists (
            select 1
            from app_private.catalog_stage_printings as staged_printing
            where staged_printing.import_run_id = p_import_run_id
              and staged_printing.printing_id = staged_id.entity_id
          )
          when 'set' then not exists (
            select 1
            from app_private.catalog_stage_sets as staged_set
            where staged_set.import_run_id = p_import_run_id
              and staged_set.set_id = staged_id.entity_id
          )
          else true
        end
      )
  ) then
    v_errors := array_append(v_errors, 'external_id_invalid');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_prices as staged_price
    where staged_price.import_run_id = p_import_run_id
      and (
        staged_price.provider <> lower(btrim(staged_price.provider))
        or staged_price.currency <> upper(btrim(staged_price.currency))
        or staged_price.currency !~ '^[A-Z]{3}$'
        or staged_price.finish = 'unknown'::public.card_finish
        or staged_price.amount < 0
        or staged_price.ingested_at < staged_price.observed_at
        or (
          staged_price.stale_after is not null
          and staged_price.stale_after <= staged_price.observed_at
        )
        or not exists (
          select 1
          from app_private.catalog_stage_printings as staged_printing
          where staged_printing.import_run_id = p_import_run_id
            and staged_printing.printing_id = staged_price.printing_id
            and staged_price.finish = any(staged_printing.finishes)
        )
      )
  ) then
    v_errors := array_append(v_errors, 'price_invalid');
  end if;

  if v_run.records_rejected > p_max_rejections then
    v_errors := array_append(v_errors, 'rejection_threshold_exceeded');
  end if;

  if exists (
    select 1
    from app_private.catalog_stage_cards as staged_card
    where staged_card.import_run_id = p_import_run_id
      and to_tsvector(
        'simple'::regconfig,
        concat_ws(' ', staged_card.name, staged_card.type_line)
      ) is null
  ) then
    v_errors := array_append(v_errors, 'search_document_invalid');
  end if;

  v_records_written :=
    v_sets
    + v_cards
    + v_printings
    + v_faces
    + v_legalities
    + v_external_ids
    + v_prices;

  v_summary := jsonb_build_object(
    'import_run_id', p_import_run_id,
    'valid', cardinality(v_errors) = 0,
    'status', case
      when cardinality(v_errors) = 0 then 'running'
      else 'failed'
    end,
    'errors', to_jsonb(v_errors),
    'counts', jsonb_build_object(
      'sets', v_sets,
      'cards', v_cards,
      'printings', v_printings,
      'faces', v_faces,
      'legalities', v_legalities,
      'external_ids', v_external_ids,
      'prices', v_prices,
      'records_rejected', v_run.records_rejected
    ),
    'max_rejections', p_max_rejections,
    'replayed', false
  );

  update public.catalog_import_runs
  set
    status = case
      when cardinality(v_errors) = 0
      then 'running'::public.job_status
      else 'failed'::public.job_status
    end,
    completed_at = case
      when cardinality(v_errors) = 0 then null
      else statement_timestamp()
    end,
    records_seen = greatest(
      records_seen,
      v_printings + records_rejected
    ),
    records_written = v_records_written,
    sets_written = v_sets,
    cards_written = v_cards,
    printings_written = v_printings,
    faces_written = v_faces,
    prices_written = v_prices,
    error_code = case
      when cardinality(v_errors) = 0 then null
      else 'validation_failed'
    end,
    error_summary = case
      when cardinality(v_errors) = 0 then null
      else array_to_string(v_errors, ',')
    end,
    validation_summary = v_summary
  where id = p_import_run_id;

  return v_summary;
end;
$$;

create function app_private.catalog_promote_import(
  p_import_run_id uuid,
  p_catalog_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.catalog_import_runs%rowtype;
  v_source public.catalog_source_files%rowtype;
  v_game_id uuid;
  v_validation jsonb;
  v_max_rejections integer := 0;
  v_expected_version text;
  v_state_import_id uuid;
  v_state_version text;
  v_sync_enabled boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('talence:catalog-promotion', 0)
  );

  select
    cs.active_import_id,
    cs.active_catalog_version,
    cs.sync_enabled
  into v_state_import_id, v_state_version, v_sync_enabled
  from public.catalog_state as cs
  where cs.singleton_id = 1
  for update;

  if not coalesce(v_sync_enabled, false) then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_sync_disabled';
  end if;

  select cir.*
  into v_run
  from public.catalog_import_runs as cir
  where cir.id = p_import_run_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_catalog_import_not_found';
  end if;

  if v_run.status = 'succeeded'::public.job_status
    and v_state_import_id = p_import_run_id
    and v_state_version = p_catalog_version
  then
    return jsonb_build_object(
      'import_run_id', p_import_run_id,
      'status', 'succeeded',
      'catalog_version', p_catalog_version,
      'promoted', true,
      'replayed', true,
      'counts', v_run.validation_summary -> 'counts'
    );
  end if;

  if v_run.status <> 'running'::public.job_status then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_import_not_promotable';
  end if;

  select sf.*
  into v_source
  from public.catalog_source_files as sf
  where sf.id = v_run.source_file_id;

  if not found or v_source.sha256 is null then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_source_not_ready';
  end if;

  if jsonb_typeof(v_run.validation_summary -> 'max_rejections') = 'number' then
    v_max_rejections :=
      (v_run.validation_summary ->> 'max_rejections')::integer;
  end if;

  v_validation := app_private.catalog_validate_import(
    p_import_run_id,
    v_max_rejections
  );

  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    return v_validation || jsonb_build_object(
      'promoted', false,
      'catalog_version', null
    );
  end if;

  v_expected_version := concat(
    'mtg-',
    to_char(
      v_source.provider_updated_at at time zone 'UTC',
      'YYYYMMDD"T"HH24MISS"Z"'
    ),
    '-',
    substring(v_source.catalog_identity_sha256 from 1 for 8),
    '-s1'
  );

  if p_catalog_version is null
    or p_catalog_version <> v_expected_version
    or char_length(p_catalog_version) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_version_invalid';
  end if;

  select g.id
  into v_game_id
  from public.games as g
  where lower(g.code) = 'mtg'
    and g.active
  limit 1;

  if v_game_id is null then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_game_unavailable';
  end if;

  insert into public.catalog_sets (
    id,
    game_id,
    source_provider,
    source_id,
    code,
    name,
    set_type,
    released_at,
    parent_set_id,
    card_count,
    digital,
    foil_only,
    nonfoil_only,
    icon_svg_uri,
    source_updated_at,
    active
  )
  select
    staged_set.set_id,
    v_game_id,
    v_source.provider,
    staged_set.set_id::text,
    staged_set.code,
    staged_set.name,
    staged_set.set_type,
    staged_set.released_at,
    staged_set.parent_set_id,
    staged_set.card_count,
    staged_set.digital,
    staged_set.foil_only,
    staged_set.nonfoil_only,
    staged_set.icon_svg_uri,
    v_source.provider_updated_at,
    true
  from app_private.catalog_stage_sets as staged_set
  where staged_set.import_run_id = p_import_run_id
  on conflict (id) do update
  set
    game_id = excluded.game_id,
    source_provider = excluded.source_provider,
    source_id = excluded.source_id,
    code = excluded.code,
    name = excluded.name,
    set_type = excluded.set_type,
    released_at = excluded.released_at,
    parent_set_id = excluded.parent_set_id,
    card_count = excluded.card_count,
    digital = excluded.digital,
    foil_only = excluded.foil_only,
    nonfoil_only = excluded.nonfoil_only,
    icon_svg_uri = excluded.icon_svg_uri,
    source_updated_at = excluded.source_updated_at,
    active = true;

  insert into public.catalog_cards (
    id,
    game_id,
    source_provider,
    source_id,
    name,
    normalized_name,
    mana_cost,
    mana_value,
    type_line,
    oracle_text,
    colors,
    color_identity,
    keywords,
    reserved,
    active,
    source_updated_at
  )
  select
    staged_card.oracle_card_id,
    v_game_id,
    v_source.provider,
    staged_card.oracle_card_id::text,
    staged_card.name,
    staged_card.normalized_name,
    staged_card.mana_cost,
    staged_card.mana_value,
    staged_card.type_line,
    staged_card.oracle_text,
    staged_card.colors,
    staged_card.color_identity,
    staged_card.keywords,
    staged_card.reserved,
    true,
    v_source.provider_updated_at
  from app_private.catalog_stage_cards as staged_card
  where staged_card.import_run_id = p_import_run_id
  on conflict (id) do update
  set
    game_id = excluded.game_id,
    source_provider = excluded.source_provider,
    source_id = excluded.source_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    mana_cost = excluded.mana_cost,
    mana_value = excluded.mana_value,
    type_line = excluded.type_line,
    oracle_text = excluded.oracle_text,
    colors = excluded.colors,
    color_identity = excluded.color_identity,
    keywords = excluded.keywords,
    reserved = excluded.reserved,
    active = true,
    source_updated_at = excluded.source_updated_at;

  insert into public.catalog_printings (
    id,
    game_id,
    card_id,
    set_id,
    source_provider,
    source_id,
    collector_number,
    language,
    printed_name,
    rarity,
    layout,
    released_at,
    digital,
    promo,
    oversized,
    variation,
    finishes,
    color_identity,
    frame_effects,
    border_color,
    artist,
    scryfall_uri,
    image_status,
    is_default_browse,
    active,
    source_updated_at
  )
  select
    staged_printing.printing_id,
    v_game_id,
    staged_printing.oracle_card_id,
    staged_printing.set_id,
    v_source.provider,
    staged_printing.printing_id::text,
    staged_printing.collector_number,
    staged_printing.language,
    staged_printing.printed_name,
    staged_printing.rarity,
    staged_printing.layout,
    staged_printing.released_at,
    staged_printing.digital,
    staged_printing.promo,
    staged_printing.oversized,
    staged_printing.variation,
    staged_printing.finishes,
    staged_printing.color_identity,
    staged_printing.frame_effects,
    staged_printing.border_color,
    staged_printing.artist,
    staged_printing.scryfall_uri,
    staged_printing.image_status,
    staged_printing.default_browse,
    true,
    v_source.provider_updated_at
  from app_private.catalog_stage_printings as staged_printing
  where staged_printing.import_run_id = p_import_run_id
  on conflict (id) do update
  set
    game_id = excluded.game_id,
    card_id = excluded.card_id,
    set_id = excluded.set_id,
    source_provider = excluded.source_provider,
    source_id = excluded.source_id,
    collector_number = excluded.collector_number,
    language = excluded.language,
    printed_name = excluded.printed_name,
    rarity = excluded.rarity,
    layout = excluded.layout,
    released_at = excluded.released_at,
    digital = excluded.digital,
    promo = excluded.promo,
    oversized = excluded.oversized,
    variation = excluded.variation,
    finishes = excluded.finishes,
    color_identity = excluded.color_identity,
    frame_effects = excluded.frame_effects,
    border_color = excluded.border_color,
    artist = excluded.artist,
    scryfall_uri = excluded.scryfall_uri,
    image_status = excluded.image_status,
    is_default_browse = excluded.is_default_browse,
    active = true,
    source_updated_at = excluded.source_updated_at;

  update public.catalog_printings as current_printing
  set active = false
  where current_printing.game_id = v_game_id
    and current_printing.source_provider = v_source.provider
    and current_printing.active
    and not exists (
      select 1
      from app_private.catalog_stage_printings as staged_printing
      where staged_printing.import_run_id = p_import_run_id
        and staged_printing.printing_id = current_printing.id
    );

  update public.catalog_cards as current_card
  set active = false
  where current_card.game_id = v_game_id
    and current_card.source_provider = v_source.provider
    and current_card.active
    and not exists (
      select 1
      from app_private.catalog_stage_cards as staged_card
      where staged_card.import_run_id = p_import_run_id
        and staged_card.oracle_card_id = current_card.id
    );

  update public.catalog_sets as current_set
  set active = false
  where current_set.game_id = v_game_id
    and current_set.source_provider = v_source.provider
    and current_set.active
    and not exists (
      select 1
      from app_private.catalog_stage_sets as staged_set
      where staged_set.import_run_id = p_import_run_id
        and staged_set.set_id = current_set.id
    );

  delete from public.catalog_faces as current_face
  where exists (
    select 1
    from app_private.catalog_stage_printings as staged_printing
    where staged_printing.import_run_id = p_import_run_id
      and staged_printing.printing_id = current_face.printing_id
  );

  insert into public.catalog_faces (
    id,
    printing_id,
    face_index,
    name,
    mana_cost,
    type_line,
    oracle_text,
    colors,
    power,
    toughness,
    loyalty,
    defense,
    artist,
    image_small_uri,
    image_normal_uri,
    image_large_uri,
    image_png_uri,
    art_crop_uri,
    border_crop_uri
  )
  select
    staged_face.face_id,
    staged_face.printing_id,
    staged_face.face_index,
    staged_face.name,
    staged_face.mana_cost,
    staged_face.type_line,
    staged_face.oracle_text,
    staged_face.colors,
    staged_face.power,
    staged_face.toughness,
    staged_face.loyalty,
    staged_face.defense,
    staged_face.artist,
    staged_face.image_small_uri,
    staged_face.image_normal_uri,
    staged_face.image_large_uri,
    staged_face.image_png_uri,
    staged_face.art_crop_uri,
    staged_face.border_crop_uri
  from app_private.catalog_stage_faces as staged_face
  where staged_face.import_run_id = p_import_run_id;

  delete from public.catalog_legalities as current_legality
  where exists (
    select 1
    from app_private.catalog_stage_cards as staged_card
    where staged_card.import_run_id = p_import_run_id
      and staged_card.oracle_card_id = current_legality.card_id
  );

  insert into public.catalog_legalities (
    card_id,
    format_code,
    legality,
    source_updated_at
  )
  select
    staged_legality.oracle_card_id,
    staged_legality.format_code,
    staged_legality.legality,
    v_source.provider_updated_at
  from app_private.catalog_stage_legalities as staged_legality
  where staged_legality.import_run_id = p_import_run_id;

  delete from public.catalog_external_ids as current_id
  where exists (
    select 1
    from app_private.catalog_stage_external_ids as staged_id
    where staged_id.import_run_id = p_import_run_id
      and staged_id.entity_type = current_id.entity_type
      and staged_id.entity_id = current_id.entity_id
  );

  insert into public.catalog_external_ids (
    entity_type,
    entity_id,
    provider,
    identifier_type,
    identifier_value
  )
  select
    staged_id.entity_type,
    staged_id.entity_id,
    staged_id.provider,
    staged_id.identifier_type,
    staged_id.identifier_value
  from app_private.catalog_stage_external_ids as staged_id
  where staged_id.import_run_id = p_import_run_id;

  delete from public.current_prices as current_price
  using public.catalog_printings as current_printing
  where current_printing.id = current_price.printing_id
    and current_printing.game_id = v_game_id
    and current_price.provider = v_source.provider;

  insert into public.current_prices (
    printing_id,
    provider,
    currency,
    finish,
    amount,
    observed_at,
    ingested_at,
    source_file_id,
    stale_after
  )
  select
    staged_price.printing_id,
    staged_price.provider,
    staged_price.currency,
    staged_price.finish,
    staged_price.amount,
    staged_price.observed_at,
    staged_price.ingested_at,
    v_run.source_file_id,
    coalesce(
      staged_price.stale_after,
      staged_price.observed_at + interval '36 hours'
    )
  from app_private.catalog_stage_prices as staged_price
  where staged_price.import_run_id = p_import_run_id;

  update public.catalog_import_runs
  set
    status = 'succeeded'::public.job_status,
    completed_at = statement_timestamp(),
    catalog_version = p_catalog_version,
    error_code = null,
    error_summary = null,
    validation_summary = v_validation || jsonb_build_object(
      'promoted', true,
      'catalog_version', p_catalog_version
    )
  where id = p_import_run_id;

  update public.catalog_state
  set
    active_import_id = p_import_run_id,
    active_catalog_version = p_catalog_version,
    last_successful_source_observed_at = v_source.provider_updated_at,
    current_search_index_version = p_catalog_version
  where singleton_id = 1;

  perform app_private.catalog_purge_import_staging(p_import_run_id);

  return jsonb_build_object(
    'import_run_id', p_import_run_id,
    'status', 'succeeded',
    'catalog_version', p_catalog_version,
    'promoted', true,
    'replayed', false,
    'counts', v_validation -> 'counts'
  );
end;
$$;

create function app_private.catalog_worker_status(
  p_provider text default 'scryfall',
  p_source_type text default 'all_cards'
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'sync_enabled', cs.sync_enabled,
    'active_catalog_version', cs.active_catalog_version,
    'active_import_id', cs.active_import_id,
    'provider_observed_at', cs.last_successful_source_observed_at,
    'catalog_ingested_at', active_run.completed_at,
    'latest_successful', (
      select jsonb_build_object(
        'import_run_id', cir.id,
        'source_file_id', sf.id,
        'provider_object_id', sf.provider_object_id,
        'provider_updated_at', sf.provider_updated_at,
        'sha256', sf.sha256,
        'dependency_sha256', sf.dependency_sha256,
        'catalog_identity_sha256', sf.catalog_identity_sha256,
        'catalog_version', cir.catalog_version,
        'completed_at', cir.completed_at
      )
      from public.catalog_import_runs as cir
      join public.catalog_source_files as sf
        on sf.id = cir.source_file_id
      where cir.status = 'succeeded'::public.job_status
        and sf.provider = lower(btrim(p_provider))
        and sf.source_type = lower(btrim(p_source_type))
      order by cir.completed_at desc, cir.id desc
      limit 1
    ),
    'next_queued', (
      select jsonb_build_object(
        'import_run_id', queued.id,
        'trigger_type', queued.trigger_type,
        'force', queued.requested_force,
        'queued_at', queued.created_at
      )
      from public.catalog_import_runs as queued
      where queued.status = 'queued'::public.job_status
      order by queued.created_at, queued.id
      limit 1
    )
  )
  from public.catalog_state as cs
  left join public.catalog_import_runs as active_run
    on active_run.id = cs.active_import_id
  where cs.singleton_id = 1
$$;

revoke all on function app_private.catalog_register_source_file(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  bigint,
  bigint,
  text,
  timestamptz,
  text
) from public, anon, authenticated;
revoke all on function app_private.catalog_purge_import_staging(uuid)
  from public, anon, authenticated;
revoke all on function app_private.catalog_begin_import(
  uuid,
  text,
  text,
  boolean,
  uuid
) from public, anon, authenticated;
revoke all on function app_private.catalog_heartbeat_import(uuid)
  from public, anon, authenticated;
revoke all on function app_private.catalog_fail_import(uuid, text, text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_fail_queued_import(
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function app_private.catalog_complete_queued_noop(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  text
) from public, anon, authenticated;
revoke all on function app_private.catalog_validate_import(uuid, integer)
  from public, anon, authenticated;
revoke all on function app_private.catalog_promote_import(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_worker_status(text, text)
  from public, anon, authenticated;

grant usage on schema app_private to service_role;
grant select, insert, update, delete
  on table app_private.catalog_stage_sets,
    app_private.catalog_stage_cards,
    app_private.catalog_stage_printings,
    app_private.catalog_stage_faces,
    app_private.catalog_stage_legalities,
    app_private.catalog_stage_external_ids,
    app_private.catalog_stage_prices
  to service_role;
grant update (
  records_seen,
  records_rejected
) on table public.catalog_import_runs to service_role;
grant execute on function app_private.catalog_register_source_file(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  bigint,
  bigint,
  text,
  timestamptz,
  text
) to service_role;
grant execute on function app_private.catalog_begin_import(
  uuid,
  text,
  text,
  boolean,
  uuid
) to service_role;
grant execute on function app_private.catalog_heartbeat_import(uuid)
  to service_role;
grant execute on function app_private.catalog_fail_import(uuid, text, text)
  to service_role;
grant execute on function app_private.catalog_fail_queued_import(
  uuid,
  text,
  text
) to service_role;
grant execute on function app_private.catalog_complete_queued_noop(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  text
) to service_role;
grant execute on function app_private.catalog_validate_import(uuid, integer)
  to service_role;
grant execute on function app_private.catalog_promote_import(uuid, text)
  to service_role;
grant execute on function app_private.catalog_worker_status(text, text)
  to service_role;
