-- Phase 3: bounded, resumable CSV import creation, strict resolution, staging,
-- manual review, preview, and safe error-report paging.

create function app_private.inventory_import_job_json(p_import_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'import_job_id', job.id,
    'workspace_id', job.workspace_id,
    'collection_id', job.collection_id,
    'created_by_user_id', job.created_by_user_id,
    'status', job.status,
    'original_filename', job.original_filename,
    'storage_bucket', job.storage_bucket,
    'storage_path', job.storage_path,
    'file_size', job.file_size,
    'file_sha256', job.file_sha256,
    'parser_version', job.parser_version,
    'total_rows', job.total_rows,
    'matched_rows', job.matched_rows,
    'ambiguous_rows', job.ambiguous_rows,
    'rejected_rows', job.rejected_rows,
    'excluded_rows', job.excluded_rows,
    'staging_completed_at', job.staging_completed_at,
    'committed_transaction_id', job.committed_transaction_id,
    'failure_code', job.failure_code,
    'cancelled_at', job.cancelled_at,
    'completed_at', job.completed_at,
    'created_at', job.created_at,
    'updated_at', job.updated_at,
    'purge_after', job.purge_after,
    'purged_at', job.purged_at,
    'max_file_bytes', 2097152,
    'max_rows', 5000,
    'max_stage_rows_per_call', 500
  )
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id
$$;

create function app_private.assert_inventory_import_source_object(
  p_import_job_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
begin
  select job.*
  into v_job
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_import_job_not_found';
  end if;

  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = v_job.storage_bucket
      and object.name = v_job.storage_path
      and (
        object.owner = v_job.created_by_user_id
        or object.owner_id = v_job.created_by_user_id::text
      )
      and case
        when object.metadata ->> 'size' ~ '^[0-9]+$'
          then (object.metadata ->> 'size')::bigint = v_job.file_size
        else false
      end
      and lower(coalesce(object.metadata ->> 'mimetype', '')) in (
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'text/plain'
      )
      and object.user_metadata ->> 'sha256' = v_job.file_sha256
      and object.user_metadata ->> 'import_job_id' = v_job.id::text
      and object.user_metadata ->> 'parser_version' =
        v_job.parser_version
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_source_object_invalid';
  end if;
end;
$$;

create function app_private.inventory_import_error_message(
  p_error_code text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_error_code
    when 'field_too_long'
      then 'One or more fields exceed the supported length.'
    when 'physical_state_invalid'
      then 'Finish, condition, or additive quantity is invalid.'
    when 'scryfall_id_invalid'
      then 'The Scryfall ID is not a valid UUID.'
    when 'scryfall_id_not_found'
      then 'No active supported printing matches that Scryfall ID.'
    when 'set_collector_language_incomplete'
      then 'Set code, collector number, and language must all be present.'
    when 'set_collector_language_ambiguous'
      then 'More than one supported printing matches these identifiers.'
    when 'set_collector_language_not_found'
      then 'No supported printing matches these exact identifiers.'
    when 'name_requires_manual_review'
      then 'Name-only matches require an explicit printing selection.'
    when 'name_not_found_stable_identity_required'
      then 'No candidate was found; provide a stable printing identifier.'
    when 'stable_identity_required'
      then 'Provide a Scryfall ID or exact set, collector, and language.'
    else null
  end
$$;

create function app_private.inventory_import_error_suggestion(
  p_error_code text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_error_code in (
      'set_collector_language_ambiguous',
      'name_requires_manual_review'
    )
      then 'Choose one of the candidate printings or exclude the row.'
    when p_error_code is null then null
    else 'Correct the source row and create a new import, or exclude it.'
  end
$$;

create function app_private.inventory_import_resolution(
  p_import_job_id uuid,
  p_raw_data jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_game_id uuid;
  v_scryfall_id text := nullif(btrim(p_raw_data ->> 'scryfall_id'), '');
  v_set_code text := lower(
    nullif(btrim(p_raw_data ->> 'set_code'), '')
  );
  v_collector_number text := nullif(
    btrim(p_raw_data ->> 'collector_number'),
    ''
  );
  v_language text := lower(
    nullif(btrim(p_raw_data ->> 'language'), '')
  );
  v_name text := nullif(btrim(p_raw_data ->> 'name'), '');
  v_finish public.card_finish;
  v_condition public.card_condition;
  v_quantity integer;
  v_scryfall_uuid uuid;
  v_resolved_printing_id uuid;
  v_suggestions uuid[] := '{}'::uuid[];
  v_match_count integer := 0;
  v_normalized_name text;
  v_oversized_fields text[];
begin
  select collection.game_id
  into v_game_id
  from public.inventory_import_jobs as job
  join public.collections as collection
    on collection.id = job.collection_id
  where job.id = p_import_job_id;

  if v_game_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_import_job_not_found';
  end if;

  select coalesce(array_agg(field_name order by field_name), '{}'::text[])
  into v_oversized_fields
  from (
    values
      ('scryfall_id', char_length(coalesce(p_raw_data ->> 'scryfall_id', '')) > 128),
      ('set_code', char_length(coalesce(p_raw_data ->> 'set_code', '')) > 64),
      ('collector_number', char_length(coalesce(p_raw_data ->> 'collector_number', '')) > 128),
      ('language', char_length(coalesce(p_raw_data ->> 'language', '')) > 32),
      ('name', char_length(coalesce(p_raw_data ->> 'name', '')) > 512),
      ('finish', char_length(coalesce(p_raw_data ->> 'finish', '')) > 64),
      ('condition', char_length(coalesce(p_raw_data ->> 'condition', '')) > 64),
      ('quantity', char_length(coalesce(p_raw_data ->> 'quantity', '')) > 64)
  ) as field(field_name, is_oversized)
  where is_oversized;

  if cardinality(v_oversized_fields) > 0 then
    return jsonb_build_object(
      'status', 'rejected',
      'finish', null,
      'condition', null,
      'quantity', null,
      'resolution_source', null,
      'resolved_printing_id', null,
      'suggested_printing_ids', '[]'::jsonb,
      'error_code', 'field_too_long',
      'error_detail', jsonb_build_object(
        'fields', to_jsonb(v_oversized_fields)
      )
    );
  end if;

  begin
    v_finish := lower(p_raw_data ->> 'finish')::public.card_finish;
    v_condition :=
      lower(p_raw_data ->> 'condition')::public.card_condition;
    v_quantity := (p_raw_data ->> 'quantity')::integer;
  exception
    when invalid_text_representation
      or numeric_value_out_of_range
      or null_value_not_allowed
    then
      return jsonb_build_object(
        'status', 'rejected',
        'finish', null,
        'condition', null,
        'quantity', null,
        'resolution_source', null,
        'resolved_printing_id', null,
        'suggested_printing_ids', '[]'::jsonb,
        'error_code', 'physical_state_invalid',
        'error_detail', jsonb_build_object(
          'message',
          'Finish, condition, and additive quantity must use canonical values.'
        )
      );
  end;

  if v_finish is null
    or v_finish = 'unknown'::public.card_finish
    or v_condition is null
    or v_condition = 'unknown'::public.card_condition
    or v_quantity is null
    or v_quantity not between 1 and 10000
  then
    return jsonb_build_object(
      'status', 'rejected',
      'finish', null,
      'condition', null,
      'quantity', null,
      'resolution_source', null,
      'resolved_printing_id', null,
      'suggested_printing_ids', '[]'::jsonb,
      'error_code', 'physical_state_invalid',
      'error_detail', jsonb_build_object(
        'message',
        'Finish, condition, and additive quantity must use canonical values.'
      )
    );
  end if;

  if v_scryfall_id is not null then
    begin
      v_scryfall_uuid := v_scryfall_id::uuid;
    exception
      when invalid_text_representation then
        return jsonb_build_object(
          'status', 'rejected',
          'finish', v_finish,
          'condition', v_condition,
          'quantity', v_quantity,
          'resolution_source', null,
          'resolved_printing_id', null,
          'suggested_printing_ids', '[]'::jsonb,
          'error_code', 'scryfall_id_invalid',
          'error_detail', jsonb_build_object(
            'scryfall_id', v_scryfall_id
          )
        );
    end;

    select printing.id
    into v_resolved_printing_id
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    left join public.catalog_cards as card
      on card.id = printing.card_id
    where printing.source_provider = 'scryfall'
      and printing.source_id = v_scryfall_uuid::text
      and printing.game_id = v_game_id
      and printing.active
      and catalog_set.active
      and (card.id is null or card.active)
      and v_finish = any(printing.finishes);

    if v_resolved_printing_id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'finish', v_finish,
        'condition', v_condition,
        'quantity', v_quantity,
        'resolution_source', null,
        'resolved_printing_id', null,
        'suggested_printing_ids', '[]'::jsonb,
        'error_code', 'scryfall_id_not_found',
        'error_detail', jsonb_build_object(
          'scryfall_id', v_scryfall_id
        )
      );
    end if;

    return jsonb_build_object(
      'status', 'matched',
      'finish', v_finish,
      'condition', v_condition,
      'quantity', v_quantity,
      'resolution_source', 'scryfall_id',
      'resolved_printing_id', v_resolved_printing_id,
      'suggested_printing_ids', '[]'::jsonb,
      'error_code', null,
      'error_detail', '{}'::jsonb
    );
  end if;

  if v_set_code is not null
    or v_collector_number is not null
    or v_language is not null
  then
    if v_set_code is null
      or v_collector_number is null
      or v_language is null
    then
      return jsonb_build_object(
        'status', 'rejected',
        'finish', v_finish,
        'condition', v_condition,
        'quantity', v_quantity,
        'resolution_source', null,
        'resolved_printing_id', null,
        'suggested_printing_ids', '[]'::jsonb,
        'error_code', 'set_collector_language_incomplete',
        'error_detail', '{}'::jsonb
      );
    end if;

    select
      count(*)::integer,
      coalesce(
        (
          array_agg(printing.id order by printing.id)
        )[1:5],
        '{}'::uuid[]
      )
    into v_match_count, v_suggestions
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    left join public.catalog_cards as card
      on card.id = printing.card_id
    where printing.game_id = v_game_id
      and catalog_set.code = v_set_code
      and printing.collector_number = v_collector_number
      and printing.language = v_language
      and printing.active
      and catalog_set.active
      and (card.id is null or card.active)
      and v_finish = any(printing.finishes);

    if v_match_count = 1 then
      return jsonb_build_object(
        'status', 'matched',
        'finish', v_finish,
        'condition', v_condition,
        'quantity', v_quantity,
        'resolution_source', 'set_collector_language',
        'resolved_printing_id', v_suggestions[1],
        'suggested_printing_ids', '[]'::jsonb,
        'error_code', null,
        'error_detail', '{}'::jsonb
      );
    elsif v_match_count > 1 then
      return jsonb_build_object(
        'status', 'ambiguous',
        'finish', v_finish,
        'condition', v_condition,
        'quantity', v_quantity,
        'resolution_source', null,
        'resolved_printing_id', null,
        'suggested_printing_ids', to_jsonb(v_suggestions),
        'error_code', 'set_collector_language_ambiguous',
        'error_detail', jsonb_build_object(
          'match_count', v_match_count
        )
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'finish', v_finish,
      'condition', v_condition,
      'quantity', v_quantity,
      'resolution_source', null,
      'resolved_printing_id', null,
      'suggested_printing_ids', '[]'::jsonb,
      'error_code', 'set_collector_language_not_found',
      'error_detail', '{}'::jsonb
    );
  end if;

  if v_name is not null then
    v_normalized_name :=
      app_private.normalize_catalog_search_text(v_name);

    select coalesce(
      (
        array_agg(candidate.printing_id order by candidate.printing_id)
      )[1:5],
      '{}'::uuid[]
    )
    into v_suggestions
    from (
      select distinct printing.id as printing_id
      from public.catalog_printings as printing
      join public.catalog_sets as catalog_set
        on catalog_set.id = printing.set_id
      left join public.catalog_cards as card
        on card.id = printing.card_id
      left join public.catalog_faces as face
        on face.printing_id = printing.id
      where printing.game_id = v_game_id
        and printing.active
        and catalog_set.active
        and (card.id is null or card.active)
        and v_finish = any(printing.finishes)
        and (
          card.normalized_name = v_normalized_name
          or app_private.normalize_catalog_search_text(
            coalesce(printing.printed_name, '')
          ) = v_normalized_name
          or app_private.normalize_catalog_search_text(
            coalesce(face.name, '')
          ) = v_normalized_name
        )
      order by printing.id
      limit 5
    ) as candidate;

    if cardinality(v_suggestions) > 0 then
      return jsonb_build_object(
        'status', 'ambiguous',
        'finish', v_finish,
        'condition', v_condition,
        'quantity', v_quantity,
        'resolution_source', null,
        'resolved_printing_id', null,
        'suggested_printing_ids', to_jsonb(v_suggestions),
        'error_code', 'name_requires_manual_review',
        'error_detail', jsonb_build_object(
          'name', v_name
        )
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'finish', v_finish,
      'condition', v_condition,
      'quantity', v_quantity,
      'resolution_source', null,
      'resolved_printing_id', null,
      'suggested_printing_ids', '[]'::jsonb,
      'error_code', 'name_not_found_stable_identity_required',
      'error_detail', jsonb_build_object('name', v_name)
    );
  end if;

  return jsonb_build_object(
    'status', 'rejected',
    'finish', v_finish,
    'condition', v_condition,
    'quantity', v_quantity,
    'resolution_source', null,
    'resolved_printing_id', null,
    'suggested_printing_ids', '[]'::jsonb,
    'error_code', 'stable_identity_required',
    'error_detail', '{}'::jsonb
  );
end;
$$;

create function app_private.inventory_import_row_json(
  p_import_row_id uuid,
  p_currency text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'row_number', import_row.row_number,
    'raw', import_row.raw_data,
    'scryfall_id', import_row.raw_scryfall_id,
    'set_code', import_row.raw_set_code,
    'collector_number', import_row.raw_collector_number,
    'language', import_row.raw_language,
    'name', import_row.raw_name,
    'raw_finish', import_row.raw_finish,
    'raw_condition', import_row.raw_condition,
    'raw_quantity', import_row.raw_quantity,
    'finish', import_row.finish,
    'condition', import_row.condition,
    'quantity', import_row.quantity,
    'status', import_row.status,
    'resolution_source', import_row.resolution_source,
    'resolved_printing_id', import_row.resolved_printing_id,
    'suggested_printing_ids', import_row.suggested_printing_ids,
    'candidates', coalesce(
      (
        select jsonb_agg(
          app_private.inventory_printing_to_json(
            candidate.printing_id,
            p_currency,
            import_row.finish
          )
          order by candidate.ordinality
        )
        from unnest(import_row.suggested_printing_ids)
          with ordinality as candidate(printing_id, ordinality)
      ),
      '[]'::jsonb
    ),
    'error_code', import_row.error_code,
    'error_message',
      app_private.inventory_import_error_message(
        import_row.error_code
      ),
    'suggestion',
      app_private.inventory_import_error_suggestion(
        import_row.error_code
      ),
    'error_detail', import_row.error_detail,
    'resolved_printing', case
      when import_row.resolved_printing_id is null then null
      else app_private.inventory_printing_to_json(
        import_row.resolved_printing_id,
        p_currency,
        import_row.finish
      )
    end,
    'created_at', import_row.created_at,
    'updated_at', import_row.updated_at
  )
  from public.inventory_import_rows as import_row
  where import_row.id = p_import_row_id
$$;

create function public.inventory_import_create(
  p_collection_id uuid,
  p_original_filename text,
  p_file_size bigint,
  p_file_sha256 text,
  p_parser_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_collection public.collections;
  v_existing app_private.inventory_operation_requests;
  v_canonical_request jsonb;
  v_request_hash text;
  v_import_job_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'editor'::public.membership_role,
    false
  );

  if p_original_filename is null
    or char_length(btrim(p_original_filename)) not between 1 and 255
    or p_file_size is null
    or p_file_size not between 1 and 2097152
    or p_file_sha256 is null
    or p_file_sha256 !~ '^[a-f0-9]{64}$'
    or p_parser_version is null
    or char_length(btrim(p_parser_version)) not between 1 and 80
    or p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 8 and 200
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_create_invalid';
  end if;

  v_canonical_request := jsonb_build_object(
    'version', 1,
    'collection_id', p_collection_id,
    'original_filename', btrim(p_original_filename),
    'file_size', p_file_size,
    'file_sha256', p_file_sha256,
    'parser_version', btrim(p_parser_version)
  );
  v_request_hash := app_private.inventory_request_hash(v_canonical_request);

  perform pg_advisory_xact_lock(
    hashtextextended(
      'talence.inventory-import-create:'
        || v_user_id::text
        || ':'
        || p_collection_id::text
        || ':'
        || btrim(p_idempotency_key),
      0
    )
  );

  select request.*
  into v_existing
  from app_private.inventory_operation_requests as request
  where request.operation_type = 'import_create'
    and request.principal_kind = 'human'
    and request.principal_id = v_user_id
    and request.scope_id = p_collection_id
    and request.idempotency_key = btrim(p_idempotency_key)
  for update;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using
        errcode = '23505',
        message = 'talence_inventory_idempotency_conflict';
    end if;

    return app_private.inventory_import_job_json(
      (v_existing.response_payload ->> 'import_job_id')::uuid
    ) || jsonb_build_object('replayed', true);
  end if;

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
  for update;

  if v_collection.status <> 'active'::public.resource_status then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_not_active';
  end if;

  insert into public.inventory_import_jobs (
    id,
    workspace_id,
    collection_id,
    created_by_user_id,
    status,
    original_filename,
    storage_bucket,
    storage_path,
    file_size,
    file_sha256,
    parser_version
  )
  values (
    v_import_job_id,
    v_collection.workspace_id,
    p_collection_id,
    v_user_id,
    'queued'::public.job_status,
    btrim(p_original_filename),
    'inventory-imports',
    v_collection.workspace_id::text
      || '/'
      || v_import_job_id::text
      || '/source.csv',
    p_file_size,
    p_file_sha256,
    btrim(p_parser_version)
  );

  v_result := app_private.inventory_import_job_json(v_import_job_id)
    || jsonb_build_object('replayed', false);

  insert into app_private.inventory_operation_requests (
    operation_type,
    principal_kind,
    principal_id,
    actor_user_id,
    workspace_id,
    scope_id,
    idempotency_key,
    request_hash,
    transaction_ids,
    response_payload
  )
  values (
    'import_create',
    'human',
    v_user_id,
    v_user_id,
    v_collection.workspace_id,
    p_collection_id,
    btrim(p_idempotency_key),
    v_request_hash,
    '{}'::uuid[],
    v_result
  );

  return v_result;
end;
$$;

create function public.inventory_import_stage_rows(
  p_import_job_id uuid,
  p_rows jsonb,
  p_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
  v_item jsonb;
  v_resolution jsonb;
  v_row_number integer;
  v_row_hash text;
  v_existing_hash text;
  v_total_rows integer;
  v_matched_rows integer;
  v_ambiguous_rows integer;
  v_rejected_rows integer;
  v_excluded_rows integer;
  v_inserted_rows integer := 0;
  v_replayed_rows integer := 0;
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

  if v_job.status not in (
    'queued'::public.job_status,
    'running'::public.job_status
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_terminal';
  end if;

  if v_job.staging_completed_at is not null and not p_complete then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_staging_complete';
  end if;

  if p_rows is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 500
    or pg_column_size(p_rows) > 2097152
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_stage_batch_invalid';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_rows) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or pg_column_size(v_item) > 131072
      or exists (
        select 1
        from jsonb_object_keys(v_item) as key_name(value)
        where key_name.value not in (
          'row_number',
          'scryfall_id',
          'set_code',
          'collector_number',
          'language',
          'name',
          'finish',
          'condition',
          'quantity'
        )
      )
      or exists (
        select 1
        from jsonb_object_keys(v_item) as key_name(value)
        where key_name.value in (
          'scryfall_id',
          'set_code',
          'collector_number',
          'language',
          'name',
          'finish',
          'condition',
          'quantity'
        )
          and char_length(coalesce(v_item ->> key_name.value, '')) > 4096
      )
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_import_row_shape_invalid';
    end if;

    begin
      v_row_number := (v_item ->> 'row_number')::integer;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
        or null_value_not_allowed
      then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_import_row_number_invalid';
    end;

    if v_row_number not between 2 and 5001 then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_import_row_number_invalid';
    end if;

    v_row_hash := app_private.inventory_request_hash(v_item);
    select import_row.row_hash
    into v_existing_hash
    from public.inventory_import_rows as import_row
    where import_row.import_job_id = p_import_job_id
      and import_row.row_number = v_row_number;

    if found then
      if v_existing_hash <> v_row_hash then
        raise exception using
          errcode = '23505',
          message = 'talence_inventory_import_row_conflict';
      end if;

      v_replayed_rows := v_replayed_rows + 1;
      continue;
    end if;

    if v_job.staging_completed_at is not null then
      raise exception using
        errcode = '55000',
        message = 'talence_inventory_import_staging_complete';
    end if;

    v_resolution := app_private.inventory_import_resolution(
      p_import_job_id,
      v_item
    );

    insert into public.inventory_import_rows (
      import_job_id,
      workspace_id,
      collection_id,
      row_number,
      raw_data,
      raw_scryfall_id,
      raw_set_code,
      raw_collector_number,
      raw_language,
      raw_name,
      raw_finish,
      raw_condition,
      raw_quantity,
      finish,
      condition,
      quantity,
      status,
      resolution_source,
      resolved_printing_id,
      suggested_printing_ids,
      error_code,
      error_detail,
      row_hash
    )
    values (
      p_import_job_id,
      v_job.workspace_id,
      v_job.collection_id,
      v_row_number,
      v_item,
      nullif(btrim(v_item ->> 'scryfall_id'), ''),
      lower(nullif(btrim(v_item ->> 'set_code'), '')),
      nullif(btrim(v_item ->> 'collector_number'), ''),
      lower(nullif(btrim(v_item ->> 'language'), '')),
      nullif(btrim(v_item ->> 'name'), ''),
      nullif(btrim(v_item ->> 'finish'), ''),
      nullif(btrim(v_item ->> 'condition'), ''),
      nullif(btrim(v_item ->> 'quantity'), ''),
      (v_resolution ->> 'finish')::public.card_finish,
      (v_resolution ->> 'condition')::public.card_condition,
      (v_resolution ->> 'quantity')::integer,
      (v_resolution ->> 'status')::public.inventory_import_row_status,
      v_resolution ->> 'resolution_source',
      (v_resolution ->> 'resolved_printing_id')::uuid,
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(
            v_resolution -> 'suggested_printing_ids'
          ) as suggestion(value)
        ),
        '{}'::uuid[]
      ),
      v_resolution ->> 'error_code',
      coalesce(v_resolution -> 'error_detail', '{}'::jsonb),
      v_row_hash
    );
    v_inserted_rows := v_inserted_rows + 1;
  end loop;

  select
    count(*)::integer,
    count(*) filter (
      where import_row.status = 'matched'
    )::integer,
    count(*) filter (
      where import_row.status = 'ambiguous'
    )::integer,
    count(*) filter (
      where import_row.status = 'rejected'
    )::integer,
    count(*) filter (
      where import_row.status = 'excluded'
    )::integer
  into
    v_total_rows,
    v_matched_rows,
    v_ambiguous_rows,
    v_rejected_rows,
    v_excluded_rows
  from public.inventory_import_rows as import_row
  where import_row.import_job_id = p_import_job_id;

  if v_total_rows > 5000 then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_row_limit_exceeded';
  end if;

  if p_complete
    and v_job.staging_completed_at is null
    and v_total_rows < 1
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_rows_required';
  end if;

  if p_complete then
    perform app_private.assert_inventory_import_source_object(
      p_import_job_id
    );
  end if;

  if v_job.staging_completed_at is null then
    update public.inventory_import_jobs
    set
      status = 'running'::public.job_status,
      total_rows = v_total_rows,
      matched_rows = v_matched_rows,
      ambiguous_rows = v_ambiguous_rows,
      rejected_rows = v_rejected_rows,
      excluded_rows = v_excluded_rows,
      staging_completed_at = case
        when p_complete then statement_timestamp()
        else null
      end
    where id = p_import_job_id;
  end if;

  return jsonb_build_object(
    'job', app_private.inventory_import_job_json(p_import_job_id),
    'staged_rows_in_request', v_inserted_rows,
    'replayed_rows_in_request', v_replayed_rows,
    'replayed', v_inserted_rows = 0
  );
end;
$$;

create function public.inventory_import_resolve_row(
  p_import_job_id uuid,
  p_row_number integer,
  p_resolution text,
  p_printing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
  v_row public.inventory_import_rows;
  v_resolution text := lower(nullif(btrim(p_resolution), ''));
  v_reset jsonb;
  v_printing record;
  v_currency text;
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

  if v_job.status <> 'running'::public.job_status
    or v_job.staging_completed_at is null
    or v_resolution not in ('match', 'exclude', 'reset')
    or p_row_number not between 2 and 5001
    or (
      v_resolution = 'match'
      and p_printing_id is null
    )
    or (
      v_resolution <> 'match'
      and p_printing_id is not null
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_resolution_invalid';
  end if;

  select import_row.*
  into v_row
  from public.inventory_import_rows as import_row
  where import_row.import_job_id = p_import_job_id
    and import_row.row_number = p_row_number
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_import_row_not_found';
  end if;

  if v_resolution = 'match' then
    if v_row.finish is null
      or v_row.finish = 'unknown'::public.card_finish
      or v_row.condition is null
      or v_row.condition = 'unknown'::public.card_condition
      or v_row.quantity is null
      or v_row.quantity not between 1 and 10000
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_import_physical_state_invalid';
    end if;

    select printing.id, printing.finishes
    into v_printing
    from public.catalog_printings as printing
    join public.collections as collection
      on collection.id = v_job.collection_id
      and collection.game_id = printing.game_id
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    left join public.catalog_cards as card
      on card.id = printing.card_id
    where printing.id = p_printing_id
      and printing.active
      and catalog_set.active
      and (card.id is null or card.active);

    if not found or not v_row.finish = any(v_printing.finishes) then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_import_manual_printing_invalid';
    end if;

    update public.inventory_import_rows
    set
      status = 'matched'::public.inventory_import_row_status,
      resolution_source = 'manual',
      resolved_printing_id = p_printing_id,
      suggested_printing_ids = '{}'::uuid[],
      error_code = null,
      error_detail = '{}'::jsonb
    where id = v_row.id;
  elsif v_resolution = 'exclude' then
    update public.inventory_import_rows
    set
      status = 'excluded'::public.inventory_import_row_status,
      resolution_source = null,
      resolved_printing_id = null,
      suggested_printing_ids = '{}'::uuid[],
      error_code = null,
      error_detail = '{}'::jsonb
    where id = v_row.id;
  else
    v_reset := app_private.inventory_import_resolution(
      p_import_job_id,
      v_row.raw_data
    );
    update public.inventory_import_rows
    set
      finish = (v_reset ->> 'finish')::public.card_finish,
      condition = (v_reset ->> 'condition')::public.card_condition,
      quantity = (v_reset ->> 'quantity')::integer,
      status =
        (v_reset ->> 'status')::public.inventory_import_row_status,
      resolution_source = v_reset ->> 'resolution_source',
      resolved_printing_id =
        (v_reset ->> 'resolved_printing_id')::uuid,
      suggested_printing_ids = coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(
            v_reset -> 'suggested_printing_ids'
          ) as suggestion(value)
        ),
        '{}'::uuid[]
      ),
      error_code = v_reset ->> 'error_code',
      error_detail = coalesce(
        v_reset -> 'error_detail',
        '{}'::jsonb
      )
    where id = v_row.id;
  end if;

  update public.inventory_import_jobs
  set
    matched_rows = counts.matched_rows,
    ambiguous_rows = counts.ambiguous_rows,
    rejected_rows = counts.rejected_rows,
    excluded_rows = counts.excluded_rows
  from (
    select
      count(*) filter (where status = 'matched')::integer
        as matched_rows,
      count(*) filter (where status = 'ambiguous')::integer
        as ambiguous_rows,
      count(*) filter (where status = 'rejected')::integer
        as rejected_rows,
      count(*) filter (where status = 'excluded')::integer
        as excluded_rows
    from public.inventory_import_rows
    where import_job_id = p_import_job_id
  ) as counts
  where id = p_import_job_id;

  v_currency := app_private.current_catalog_currency(null);

  return jsonb_build_object(
    'job', app_private.inventory_import_job_json(p_import_job_id),
    'row', app_private.inventory_import_row_json(
      (
        select id
        from public.inventory_import_rows
        where import_job_id = p_import_job_id
          and row_number = p_row_number
      ),
      v_currency
    )
  );
end;
$$;

create function public.inventory_import_preview(
  p_import_job_id uuid,
  p_after_row_number integer default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
  v_currency text;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_after_row_number integer;
  v_previous_after_row_number integer;
begin
  select job.*
  into v_job
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id;

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

  if p_after_row_number is null
    or p_after_row_number not between 0 and 5001
    or p_limit is null
    or p_limit not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_preview_page_invalid';
  end if;

  v_currency := app_private.current_catalog_currency(null);
  if p_after_row_number = 0 then
    v_previous_after_row_number := null;
  else
    select coalesce(previous_row.row_number, 0)
    into v_previous_after_row_number
    from (
      select import_row.row_number
      from public.inventory_import_rows as import_row
      where import_row.import_job_id = p_import_job_id
        and import_row.row_number <= p_after_row_number
      order by import_row.row_number desc
      offset p_limit
      limit 1
    ) as previous_row;

    v_previous_after_row_number :=
      coalesce(v_previous_after_row_number, 0);
  end if;

  for v_row in
    select import_row.id, import_row.row_number
    from public.inventory_import_rows as import_row
    where import_row.import_job_id = p_import_job_id
      and import_row.row_number > p_after_row_number
    order by import_row.row_number
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      app_private.inventory_import_row_json(v_row.id, v_currency)
    );
    v_next_after_row_number := v_row.row_number;
  end loop;

  return jsonb_build_object(
    'job', app_private.inventory_import_job_json(p_import_job_id),
    'created_at', v_job.created_at,
    'counts', jsonb_build_object(
      'total', v_job.total_rows,
      'matched', v_job.matched_rows,
      'ambiguous', v_job.ambiguous_rows,
      'rejected', v_job.rejected_rows,
      'excluded', v_job.excluded_rows
    ),
    'items', v_items,
    'after_row_number', p_after_row_number,
    'previous_after_row_number', v_previous_after_row_number,
    'has_more', v_has_more,
    'next_after_row_number',
      case when v_has_more then v_next_after_row_number else null end
  );
end;
$$;

create function public.inventory_import_error_report(
  p_import_job_id uuid,
  p_after_row_number integer default 0,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.inventory_import_jobs;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_after_row_number integer;
  v_previous_after_row_number integer;
begin
  select job.*
  into v_job
  from public.inventory_import_jobs as job
  where job.id = p_import_job_id;

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

  if p_after_row_number is null
    or p_after_row_number not between 0 and 5001
    or p_limit is null
    or p_limit not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_import_error_page_invalid';
  end if;

  if p_after_row_number = 0 then
    v_previous_after_row_number := null;
  else
    select coalesce(previous_row.row_number, 0)
    into v_previous_after_row_number
    from (
      select import_row.row_number
      from public.inventory_import_rows as import_row
      where import_row.import_job_id = p_import_job_id
        and import_row.row_number <= p_after_row_number
        and import_row.status in (
          'ambiguous'::public.inventory_import_row_status,
          'rejected'::public.inventory_import_row_status
        )
      order by import_row.row_number desc
      offset p_limit
      limit 1
    ) as previous_row;

    v_previous_after_row_number :=
      coalesce(v_previous_after_row_number, 0);
  end if;

  for v_row in
    select import_row.*
    from public.inventory_import_rows as import_row
    where import_row.import_job_id = p_import_job_id
      and import_row.row_number > p_after_row_number
      and import_row.status in (
        'ambiguous'::public.inventory_import_row_status,
        'rejected'::public.inventory_import_row_status
      )
    order by import_row.row_number
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'row_number', v_row.row_number,
        'status', v_row.status,
        'error_code', v_row.error_code,
        'error_message',
          app_private.inventory_import_error_message(
            v_row.error_code
          ),
        'suggestion',
          app_private.inventory_import_error_suggestion(
            v_row.error_code
          ),
        'error_detail', v_row.error_detail,
        'suggested_printing_ids', v_row.suggested_printing_ids,
        'raw', jsonb_build_object(
          'scryfall_id',
            app_private.csv_safe_text(v_row.raw_data ->> 'scryfall_id'),
          'set_code',
            app_private.csv_safe_text(v_row.raw_data ->> 'set_code'),
          'collector_number',
            app_private.csv_safe_text(
              v_row.raw_data ->> 'collector_number'
            ),
          'language',
            app_private.csv_safe_text(v_row.raw_data ->> 'language'),
          'name', app_private.csv_safe_text(v_row.raw_data ->> 'name'),
          'finish',
            app_private.csv_safe_text(v_row.raw_data ->> 'finish'),
          'condition',
            app_private.csv_safe_text(v_row.raw_data ->> 'condition'),
          'quantity',
            app_private.csv_safe_text(v_row.raw_data ->> 'quantity')
        )
      )
    );
    v_next_after_row_number := v_row.row_number;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'after_row_number', p_after_row_number,
    'previous_after_row_number', v_previous_after_row_number,
    'has_more', v_has_more,
    'next_after_row_number',
      case when v_has_more then v_next_after_row_number else null end
  );
end;
$$;

revoke all on function app_private.inventory_import_job_json(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_inventory_import_source_object(uuid)
  from public, anon, authenticated;
revoke all on function app_private.inventory_import_error_message(text)
  from public, anon, authenticated;
revoke all on function app_private.inventory_import_error_suggestion(text)
  from public, anon, authenticated;
revoke all on function app_private.inventory_import_resolution(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function app_private.inventory_import_row_json(uuid, text)
  from public, anon, authenticated;
revoke all on function public.inventory_import_create(
  uuid,
  text,
  bigint,
  text,
  text,
  text
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_stage_rows(
  uuid,
  jsonb,
  boolean
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_resolve_row(
  uuid,
  integer,
  text,
  uuid
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_preview(
  uuid,
  integer,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.inventory_import_error_report(
  uuid,
  integer,
  integer
)
  from public, anon, authenticated, service_role;
