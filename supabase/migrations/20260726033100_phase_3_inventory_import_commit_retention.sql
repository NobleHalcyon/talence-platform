-- Phase 3: atomic CSV import commit/cancel and service-only retention
-- coordination. Storage deletion is intentionally external; the database marks
-- a terminal job purged only after its exact object is gone.

create function app_private.inventory_import_normalized_lines(
  p_import_job_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(
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
    ),
    '[]'::jsonb
  )
  from (
    select
      array_agg(
        'csv-row:' || import_row.row_number::text
        order by import_row.row_number
      ) as line_ids,
      import_row.resolved_printing_id as printing_id,
      import_row.finish,
      import_row.condition,
      sum(import_row.quantity)::integer as quantity_delta
    from public.inventory_import_rows as import_row
    where import_row.import_job_id = p_import_job_id
      and import_row.status = 'matched'
    group by
      import_row.resolved_printing_id,
      import_row.finish,
      import_row.condition
  ) as grouped
$$;

create function app_private.inventory_import_transaction_lines(
  p_transaction_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_ids', line.client_line_ids,
        'printing_id', line.printing_id,
        'finish', line.finish,
        'condition', line.condition,
        'quantity_delta', line.quantity_delta,
        'expected_quantity_before', null
      )
      order by
        line.printing_id,
        line.finish::text,
        line.condition::text
    ),
    '[]'::jsonb
  )
  from public.inventory_transaction_lines as line
  where line.transaction_id = p_transaction_id
$$;

create function public.inventory_import_commit(
  p_import_job_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_job public.inventory_import_jobs;
  v_lines jsonb;
  v_result jsonb;
  v_committed_at timestamptz := statement_timestamp();
begin
  select job.*
  into v_job
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_import_job_not_found';
  end if;

  perform app_private.assert_human_collection_role(
    v_job.collection_id,
    'editor'::public.membership_role,
    false
  );

  if p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 8 and 200
    or p_occurred_at is null
    or date_trunc('milliseconds', p_occurred_at)
      is distinct from date_trunc('milliseconds', v_job.created_at)
    or p_note is not null and char_length(p_note) > 4000
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_commit_invalid';
  end if;

  if v_job.status = 'succeeded'::public.job_status then
    if not exists (
      select 1
      from app_private.inventory_operation_requests as request
      where request.operation_type = 'import_commit'
        and request.principal_kind = 'human'
        and request.principal_id = v_user_id
        and request.scope_id = p_import_job_id
        and request.idempotency_key = btrim(p_idempotency_key)
        and v_job.committed_transaction_id =
          any(request.transaction_ids)
    )
    then
      raise exception using
        errcode = '55000',
        message = 'talence_inventory_import_already_committed';
    end if;

    v_lines := app_private.inventory_import_transaction_lines(
      v_job.committed_transaction_id
    );
    v_result := app_private.apply_inventory_transaction_core(
      'human',
      v_user_id,
      v_user_id,
      null,
      v_job.collection_id,
      'csv_import'::public.inventory_source,
      'import_commit',
      p_import_job_id,
      btrim(p_idempotency_key),
      v_job.created_at,
      v_lines,
      p_note,
      'csv-import:' || p_import_job_id::text,
      jsonb_build_object(
        'import_job_id', p_import_job_id,
        'file_sha256', v_job.file_sha256,
        'parser_version', v_job.parser_version
      ),
      p_import_job_id,
      null,
      null,
      null
    );

    return v_result || jsonb_build_object(
      'import_job_id', p_import_job_id,
      'status', v_job.status,
      'job', app_private.inventory_import_job_json(p_import_job_id)
    );
  end if;

  if v_job.status <> 'running'::public.job_status
    or v_job.staging_completed_at is null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_not_ready';
  end if;

  if v_job.ambiguous_rows > 0 then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_ambiguous_rows';
  end if;

  if v_job.matched_rows < 1 then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_no_matched_rows';
  end if;

  perform app_private.assert_inventory_import_source_object(
    p_import_job_id
  );

  v_lines := app_private.inventory_import_normalized_lines(
    p_import_job_id
  );

  if jsonb_array_length(v_lines) not between 1 and 5000
    or exists (
      select 1
      from jsonb_to_recordset(v_lines) as line(
        quantity_delta integer
      )
      where line.quantity_delta not between 1 and 50000000
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_aggregate_invalid';
  end if;

  v_result := app_private.apply_inventory_transaction_core(
    'human',
    v_user_id,
    v_user_id,
    null,
    v_job.collection_id,
    'csv_import'::public.inventory_source,
    'import_commit',
    p_import_job_id,
    btrim(p_idempotency_key),
    v_job.created_at,
    v_lines,
    p_note,
    'csv-import:' || p_import_job_id::text,
    jsonb_build_object(
      'import_job_id', p_import_job_id,
      'file_sha256', v_job.file_sha256,
      'parser_version', v_job.parser_version
    ),
    p_import_job_id,
    null,
    null,
    null
  );

  update public.inventory_import_jobs
  set
    status = 'succeeded'::public.job_status,
    committed_transaction_id =
      (v_result ->> 'transaction_id')::uuid,
    completed_at = v_committed_at
  where id = p_import_job_id;

  return v_result || jsonb_build_object(
    'import_job_id', p_import_job_id,
    'status', 'succeeded',
    'job', app_private.inventory_import_job_json(p_import_job_id)
  );
end;
$$;

create function public.inventory_import_cancel(p_import_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
  v_cancelled_at timestamptz := statement_timestamp();
begin
  select job.*
  into v_job
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_import_job_not_found';
  end if;

  perform app_private.assert_human_collection_role(
    v_job.collection_id,
    'editor'::public.membership_role,
    false
  );

  if v_job.status = 'cancelled'::public.job_status then
    return jsonb_build_object(
      'job', app_private.inventory_import_job_json(p_import_job_id),
      'replayed', true
    );
  end if;

  if v_job.status not in (
    'queued'::public.job_status,
    'running'::public.job_status
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_terminal';
  end if;

  update public.inventory_import_jobs
  set
    status = 'cancelled'::public.job_status,
    cancelled_at = v_cancelled_at,
    completed_at = v_cancelled_at
  where id = p_import_job_id;

  return jsonb_build_object(
    'job', app_private.inventory_import_job_json(p_import_job_id),
    'replayed', false
  );
end;
$$;

create function public.inventory_import_expire_stale(
  p_before timestamptz default (
    statement_timestamp() - interval '24 hours'
  ),
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_cancelled_at timestamptz := statement_timestamp();
  v_job_ids uuid[];
begin
  if p_before is null
    or p_before > statement_timestamp() - interval '1 hour'
    or p_limit is null
    or p_limit not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_expiry_invalid';
  end if;

  with candidates as (
    select job.id
    from public.inventory_import_jobs as job
    where job.status in (
        'queued'::public.job_status,
        'running'::public.job_status
      )
      and job.updated_at <= p_before
    order by job.updated_at, job.id
    for update skip locked
    limit p_limit
  ),
  expired as (
    update public.inventory_import_jobs as job
    set
      status = 'cancelled'::public.job_status,
      cancelled_at = v_cancelled_at,
      completed_at = v_cancelled_at
    from candidates
    where job.id = candidates.id
    returning job.id
  )
  select coalesce(array_agg(expired.id order by expired.id), '{}'::uuid[])
  into v_job_ids
  from expired;

  return jsonb_build_object(
    'expired_count', cardinality(v_job_ids),
    'import_job_ids', to_jsonb(v_job_ids),
    'cancelled_at', v_cancelled_at
  );
end;
$$;

create function public.inventory_import_retention_candidates(
  p_before timestamptz default statement_timestamp(),
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
begin
  if p_before is null
    or p_before > statement_timestamp() + interval '5 minutes'
    or p_limit is null
    or p_limit not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_retention_page_invalid';
  end if;

  for v_row in
    select job.*
    from public.inventory_import_jobs as job
    where job.status in (
        'succeeded'::public.job_status,
        'failed'::public.job_status,
        'cancelled'::public.job_status
      )
      and job.purged_at is null
      and job.purge_after <= p_before
      and job.purge_after <= statement_timestamp()
    order by job.purge_after, job.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'import_job_id', v_row.id,
        'workspace_id', v_row.workspace_id,
        'storage_bucket', v_row.storage_bucket,
        'storage_path', v_row.storage_path,
        'purge_after', v_row.purge_after
      )
    );
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'has_more', v_has_more
  );
end;
$$;

create function public.inventory_import_mark_purged(
  p_import_job_id uuid,
  p_purged_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
  v_deleted_rows integer;
begin
  select job.*
  into v_job
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_import_job_not_found';
  end if;

  if v_job.purged_at is not null then
    return jsonb_build_object(
      'import_job_id', p_import_job_id,
      'purged_at', v_job.purged_at,
      'staged_rows_deleted', 0,
      'replayed', true
    );
  end if;

  if v_job.status not in (
      'succeeded'::public.job_status,
      'failed'::public.job_status,
      'cancelled'::public.job_status
    )
    or p_purged_at is null
    or p_purged_at < v_job.purge_after
    or p_purged_at > statement_timestamp() + interval '5 minutes'
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_purge_not_ready';
  end if;

  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = v_job.storage_bucket
      and object.name = v_job.storage_path
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_storage_delete_required';
  end if;

  delete from public.inventory_import_rows as import_row
  where import_row.import_job_id = p_import_job_id;
  get diagnostics v_deleted_rows = row_count;

  update public.inventory_import_jobs
  set purged_at = p_purged_at
  where id = p_import_job_id;

  return jsonb_build_object(
    'import_job_id', p_import_job_id,
    'purged_at', p_purged_at,
    'staged_rows_deleted', v_deleted_rows,
    'replayed', false
  );
end;
$$;

revoke all on function app_private.inventory_import_normalized_lines(uuid)
  from public, anon, authenticated;
revoke all on function app_private.inventory_import_transaction_lines(uuid)
  from public, anon, authenticated;
revoke all on function public.inventory_import_commit(
  uuid,
  text,
  timestamptz,
  text
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_cancel(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_expire_stale(
  timestamptz,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_retention_candidates(
  timestamptz,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_mark_purged(
  uuid,
  timestamptz
)
  from public, anon, authenticated, service_role;
