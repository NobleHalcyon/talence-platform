-- Phase 3: collection mutation RPCs, canonical human-line normalization, and
-- the reusable atomic single-collection inventory ledger core.

create function app_private.inventory_request_hash(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create function app_private.normalize_inventory_delta_lines(p_lines jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_result jsonb;
  v_line_id text;
  v_printing_id uuid;
  v_finish public.card_finish;
  v_condition public.card_condition;
  v_delta integer;
  v_expected integer;
begin
  if p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 500
    or pg_column_size(p_lines) > 262144
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_lines_invalid';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_lines) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_item) as key_name(value)
        where key_name.value not in (
          'line_id',
          'printing_id',
          'finish',
          'condition',
          'quantity_delta',
          'expected_quantity_before'
        )
      )
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_line_shape_invalid';
    end if;

    begin
      v_line_id := btrim(v_item ->> 'line_id');
      v_printing_id := (v_item ->> 'printing_id')::uuid;
      v_finish := (v_item ->> 'finish')::public.card_finish;
      v_condition := (v_item ->> 'condition')::public.card_condition;
      v_delta := (v_item ->> 'quantity_delta')::integer;
      v_expected := case
        when v_item ? 'expected_quantity_before'
          and jsonb_typeof(v_item -> 'expected_quantity_before') <> 'null'
        then (v_item ->> 'expected_quantity_before')::integer
        else null
      end;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
        or null_value_not_allowed
      then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_line_value_invalid';
    end;

    if v_line_id is null
      or char_length(v_line_id) not between 1 and 128
      or v_printing_id is null
      or v_finish is null
      or v_finish = 'unknown'::public.card_finish
      or v_condition is null
      or v_condition = 'unknown'::public.card_condition
      or v_delta is null
      or v_delta = 0
      or v_delta not between -10000 and 10000
      or v_expected is not null and v_expected < 0
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_line_value_invalid';
    end if;

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_id,
        'printing_id', v_printing_id,
        'finish', v_finish,
        'condition', v_condition,
        'quantity_delta', v_delta,
        'expected_quantity_before', v_expected
      )
    );
  end loop;

  if exists (
    select 1
    from jsonb_to_recordset(v_rows) as line(line_id text)
    group by line.line_id
    having count(*) > 1
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_line_id_duplicate';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rows) as line(
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      expected_quantity_before integer
    )
    group by line.printing_id, line.finish, line.condition
    having count(
      distinct coalesce(line.expected_quantity_before, -1)
    ) > 1
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_expected_quantity_disagrees';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rows) as line(
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
      message = 'talence_inventory_aggregate_delta_invalid';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'line_ids', grouped.line_ids,
      'printing_id', grouped.printing_id,
      'finish', grouped.finish,
      'condition', grouped.condition,
      'quantity_delta', grouped.quantity_delta,
      'expected_quantity_before', grouped.expected_quantity_before
    )
    order by
      grouped.printing_id,
      grouped.finish::text,
      grouped.condition::text
  )
  into v_result
  from (
    select
      array_agg(line.line_id order by line.line_id) as line_ids,
      line.printing_id,
      line.finish,
      line.condition,
      sum(line.quantity_delta)::integer as quantity_delta,
      min(line.expected_quantity_before) as expected_quantity_before
    from jsonb_to_recordset(v_rows) as line(
      line_id text,
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity_delta integer,
      expected_quantity_before integer
    )
    group by line.printing_id, line.finish, line.condition
  ) as grouped;

  return v_result;
end;
$$;

create function app_private.collection_slug_base(p_name text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_slug text;
begin
  v_slug := btrim(
    regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  v_slug := left(v_slug, 68);

  if char_length(v_slug) < 3 then
    return 'collection';
  end if;

  return v_slug;
end;
$$;

create function app_private.collection_mutation_json(p_collection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'collection_id', collection.id,
    'workspace_id', collection.workspace_id,
    'game_id', collection.game_id,
    'name', collection.name,
    'slug', collection.slug,
    'description', collection.description,
    'cover_printing_id', collection.cover_printing_id,
    'visibility', collection.visibility,
    'status', collection.status,
    'created_by_user_id', collection.created_by_user_id,
    'archived_at', collection.archived_at,
    'deleted_at', collection.deleted_at,
    'created_at', collection.created_at,
    'updated_at', collection.updated_at
  )
  from public.collections as collection
  where collection.id = p_collection_id
$$;

create function app_private.assert_human_collection_role(
  p_collection_id uuid,
  p_minimum_role public.membership_role,
  p_require_active boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_collection public.collections;
begin
  if not app_api.is_admitted_user(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'talence_admitted_user_required';
  end if;

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id;

  if not found or v_collection.status = 'deleted'::public.resource_status then
    raise exception using
      errcode = 'P0002',
      message = 'talence_collection_not_found';
  end if;

  if not app_api.has_workspace_role(
    v_collection.workspace_id,
    p_minimum_role
  )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_collection_access_denied';
  end if;

  if p_require_active
    and v_collection.status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_not_active';
  end if;
end;
$$;

create function app_private.apply_inventory_transaction_core(
  p_principal_kind text,
  p_principal_id uuid,
  p_actor_user_id uuid,
  p_device_id uuid,
  p_collection_id uuid,
  p_source public.inventory_source,
  p_operation_type text,
  p_scope_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz,
  p_normalized_lines jsonb,
  p_note text,
  p_external_reference text,
  p_metadata jsonb,
  p_import_job_id uuid,
  p_reverses_transaction_id uuid,
  p_transfer_group_id uuid,
  p_transfer_direction public.inventory_transfer_direction
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_collection public.collections;
  v_existing app_private.inventory_operation_requests;
  v_canonical_request jsonb;
  v_request_hash text;
  v_transaction_id uuid := gen_random_uuid();
  v_committed_at timestamptz := statement_timestamp();
  v_result_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_line record;
  v_printing record;
  v_quantity_before integer;
  v_quantity_after integer;
  v_line_number integer := 0;
  v_quantity_added bigint := 0;
  v_quantity_removed bigint := 0;
begin
  if p_principal_kind not in ('human', 'device', 'system')
    or p_principal_id is null
    or (
      p_principal_kind = 'human'
      and (
        p_actor_user_id is null
        or p_actor_user_id <> p_principal_id
        or p_device_id is not null
      )
    )
    or (
      p_principal_kind = 'device'
      and (
        p_actor_user_id is not null
        or p_device_id is null
        or p_device_id <> p_principal_id
      )
    )
    or (
      p_principal_kind = 'system'
      and (
        p_actor_user_id is not null
        or p_device_id is not null
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_principal_invalid';
  end if;

  if p_operation_type not in ('apply', 'reversal', 'import_commit')
    or p_scope_id is null
    or p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 8 and 200
    or p_occurred_at is null
    or p_occurred_at > statement_timestamp() + interval '5 minutes'
    or p_normalized_lines is null
    or jsonb_typeof(p_normalized_lines) <> 'array'
    or jsonb_array_length(p_normalized_lines) not between 1 and (
      case
        when p_source = 'csv_import'::public.inventory_source then 5000
        else 500
      end
    )
    or p_note is not null and char_length(p_note) > 4000
    or p_external_reference is not null
      and char_length(btrim(p_external_reference)) not between 1 and 200
    or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 16384
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_request_invalid';
  end if;

  v_canonical_request := jsonb_build_object(
    'version', 1,
    'operation_type', p_operation_type,
    'collection_id', p_collection_id,
    'source', p_source,
    'occurred_at_utc', to_char(
      p_occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'lines', p_normalized_lines,
    'note', p_note,
    'external_reference', p_external_reference,
    'metadata', p_metadata,
    'import_job_id', p_import_job_id,
    'reverses_transaction_id', p_reverses_transaction_id,
    'transfer_group_id', p_transfer_group_id,
    'transfer_direction', p_transfer_direction
  );
  v_request_hash := app_private.inventory_request_hash(v_canonical_request);

  select request.*
  into v_existing
  from app_private.inventory_operation_requests as request
  where request.operation_type = p_operation_type
    and request.principal_kind = p_principal_kind
    and request.principal_id = p_principal_id
    and request.scope_id = p_scope_id
    and request.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using
        errcode = '23505',
        message = 'talence_inventory_idempotency_conflict';
    end if;

    return jsonb_set(
      v_existing.response_payload,
      '{replayed}',
      'true'::jsonb,
      true
    );
  end if;

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_collection_not_found';
  end if;

  if v_collection.status <> 'active'::public.resource_status then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_not_active';
  end if;

  select request.*
  into v_existing
  from app_private.inventory_operation_requests as request
  where request.operation_type = p_operation_type
    and request.principal_kind = p_principal_kind
    and request.principal_id = p_principal_id
    and request.scope_id = p_scope_id
    and request.idempotency_key = btrim(p_idempotency_key)
  for update;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using
        errcode = '23505',
        message = 'talence_inventory_idempotency_conflict';
    end if;

    return jsonb_set(
      v_existing.response_payload,
      '{replayed}',
      'true'::jsonb,
      true
    );
  end if;

  if p_reverses_transaction_id is not null
    and exists (
      select 1
      from public.inventory_transactions as reversal
      where reversal.reverses_transaction_id = p_reverses_transaction_id
    )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_transaction_already_reversed';
  end if;

  for v_line in
    select line.*
    from jsonb_to_recordset(p_normalized_lines) as line(
      line_ids text[],
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity_delta integer,
      expected_quantity_before integer
    )
    order by
      line.printing_id,
      line.finish::text,
      line.condition::text
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'talence.inventory:'
          || p_collection_id::text
          || ':'
          || v_line.printing_id::text
          || ':'
          || v_line.finish::text
          || ':'
          || v_line.condition::text,
        0
      )
    );

    if v_line.line_ids is null
      or cardinality(v_line.line_ids) not between 1 and 5000
      or array_position(v_line.line_ids, null) is not null
      or v_line.quantity_delta is null
      or v_line.quantity_delta = 0
      or v_line.quantity_delta not between -50000000 and 50000000
      or v_line.expected_quantity_before is not null
        and v_line.expected_quantity_before < 0
      or v_line.finish is null
      or v_line.condition is null
      or p_principal_kind <> 'device'
        and p_source <> 'reversal'::public.inventory_source
        and (
          v_line.finish = 'unknown'::public.card_finish
          or v_line.condition = 'unknown'::public.card_condition
        )
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_normalized_line_invalid';
    end if;

    select
      printing.id,
      printing.finishes,
      (
        printing.active
        and catalog_set.active
        and (card.id is null or card.active)
      ) as identity_active
    into v_printing
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    left join public.catalog_cards as card
      on card.id = printing.card_id
    where printing.id = v_line.printing_id
      and printing.game_id = v_collection.game_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'talence_catalog_printing_unknown';
    end if;

    if p_source <> 'reversal'::public.inventory_source
      and v_line.quantity_delta > 0
      and not v_printing.identity_active
    then
      raise exception using
        errcode = '23514',
        message = 'talence_catalog_printing_inactive';
    end if;

    if v_line.finish <> 'unknown'::public.card_finish
      and not v_line.finish = any(v_printing.finishes)
      and p_source <> 'reversal'::public.inventory_source
      and v_line.quantity_delta > 0
    then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_finish_unsupported';
    end if;

    select balance.quantity
    into v_quantity_before
    from public.inventory_balances as balance
    where balance.collection_id = p_collection_id
      and balance.printing_id = v_line.printing_id
      and balance.finish = v_line.finish
      and balance.condition = v_line.condition
    for update;

    v_quantity_before := coalesce(v_quantity_before, 0);

    if v_line.expected_quantity_before is not null
      and v_line.expected_quantity_before <> v_quantity_before
    then
      raise exception using
        errcode = '40001',
        message = 'talence_inventory_stale_quantity',
        detail = jsonb_build_object(
          'printing_id', v_line.printing_id,
          'finish', v_line.finish,
          'condition', v_line.condition,
          'expected_quantity_before', v_line.expected_quantity_before,
          'current_quantity', v_quantity_before
        )::text;
    end if;

    v_quantity_after := v_quantity_before + v_line.quantity_delta;

    if v_quantity_after < 0 then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_quantity_negative',
        detail = jsonb_build_object(
          'printing_id', v_line.printing_id,
          'finish', v_line.finish,
          'condition', v_line.condition,
          'quantity_before', v_quantity_before,
          'quantity_delta', v_line.quantity_delta
        )::text;
    end if;

  end loop;

  insert into public.inventory_transactions (
    id,
    workspace_id,
    collection_id,
    source,
    actor_user_id,
    device_id,
    import_job_id,
    idempotency_key,
    external_reference,
    reverses_transaction_id,
    transfer_group_id,
    transfer_direction,
    occurred_at,
    committed_at,
    note,
    metadata
  )
  values (
    v_transaction_id,
    v_collection.workspace_id,
    p_collection_id,
    p_source,
    p_actor_user_id,
    p_device_id,
    p_import_job_id,
    btrim(p_idempotency_key),
    nullif(btrim(p_external_reference), ''),
    p_reverses_transaction_id,
    p_transfer_group_id,
    p_transfer_direction,
    p_occurred_at,
    v_committed_at,
    nullif(p_note, ''),
    p_metadata
  );

  insert into public.inventory_transaction_lines (
    transaction_id,
    workspace_id,
    collection_id,
    line_number,
    client_line_ids,
    printing_id,
    finish,
    condition,
    quantity_delta,
    quantity_before,
    quantity_after,
    created_at
  )
  select
    v_transaction_id,
    v_collection.workspace_id,
    p_collection_id,
    row_number() over (
      order by
        line.printing_id,
        line.finish::text,
        line.condition::text
    )::integer,
    line.line_ids,
    line.printing_id,
    line.finish,
    line.condition,
    line.quantity_delta,
    coalesce(balance.quantity, 0),
    coalesce(balance.quantity, 0) + line.quantity_delta,
    v_committed_at
  from jsonb_to_recordset(p_normalized_lines) as line(
      line_ids text[],
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity_delta integer,
      expected_quantity_before integer
    )
  left join public.inventory_balances as balance
    on balance.collection_id = p_collection_id
    and balance.printing_id = line.printing_id
    and balance.finish = line.finish
    and balance.condition = line.condition;

  insert into public.inventory_balances (
    workspace_id,
    collection_id,
    printing_id,
    finish,
    condition,
    quantity,
    last_transaction_id,
    created_at,
    updated_at
  )
  select
    transaction_line.workspace_id,
    transaction_line.collection_id,
    transaction_line.printing_id,
    transaction_line.finish,
    transaction_line.condition,
    transaction_line.quantity_after,
    v_transaction_id,
    v_committed_at,
    v_committed_at
  from public.inventory_transaction_lines as transaction_line
  where transaction_line.transaction_id = v_transaction_id
  order by transaction_line.line_number
  on conflict (collection_id, printing_id, finish, condition)
  do update set
    quantity = excluded.quantity,
    last_transaction_id = excluded.last_transaction_id,
    updated_at = excluded.updated_at;

  select
    count(*)::integer,
    coalesce(
      sum(greatest(transaction_line.quantity_delta, 0)),
      0
    ),
    coalesce(
      sum(greatest(-transaction_line.quantity_delta, 0)),
      0
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'line_number', transaction_line.line_number,
          'line_ids', transaction_line.client_line_ids,
          'printing_id', transaction_line.printing_id,
          'finish', transaction_line.finish,
          'condition', transaction_line.condition,
          'quantity_delta', transaction_line.quantity_delta,
          'quantity_before', transaction_line.quantity_before,
          'quantity_after', transaction_line.quantity_after
        )
        order by transaction_line.line_number
      ),
      '[]'::jsonb
    )
  into
    v_line_number,
    v_quantity_added,
    v_quantity_removed,
    v_result_lines
  from public.inventory_transaction_lines as transaction_line
  where transaction_line.transaction_id = v_transaction_id;

  v_result := jsonb_build_object(
    'transaction_id', v_transaction_id,
    'collection_id', p_collection_id,
    'source', p_source,
    'occurred_at', p_occurred_at,
    'committed_at', v_committed_at,
    'replayed', false,
    'lines', v_result_lines,
    'totals', jsonb_build_object(
      'line_count', v_line_number,
      'quantity_added', v_quantity_added,
      'quantity_removed', v_quantity_removed
    )
  );

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
    response_payload,
    created_at
  )
  values (
    p_operation_type,
    p_principal_kind,
    p_principal_id,
    p_actor_user_id,
    v_collection.workspace_id,
    p_scope_id,
    btrim(p_idempotency_key),
    v_request_hash,
    array[v_transaction_id],
    v_result,
    v_committed_at
  );

  return v_result;
end;
$$;

create function public.collection_create(
  p_workspace_id uuid,
  p_name text,
  p_description text default null,
  p_cover_printing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_collection_id uuid := gen_random_uuid();
  v_game_id uuid;
  v_slug text;
begin
  if not app_api.is_admitted_user(v_user_id)
    or not app_api.has_workspace_role(
      p_workspace_id,
      'editor'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_collection_create_denied';
  end if;

  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 120
    or p_description is not null and char_length(p_description) > 4000
  then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_input_invalid';
  end if;

  select game.id
  into v_game_id
  from public.games as game
  join public.workspaces as workspace
    on workspace.id = p_workspace_id
  where game.code = 'mtg'
    and game.active
    and workspace.status = 'active'::public.resource_status;

  if v_game_id is null then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_workspace_or_game_unavailable';
  end if;

  v_slug := app_private.collection_slug_base(p_name)
    || '-'
    || left(v_collection_id::text, 8);

  insert into public.collections (
    id,
    workspace_id,
    game_id,
    name,
    slug,
    description,
    cover_printing_id,
    visibility,
    status,
    created_by_user_id
  )
  values (
    v_collection_id,
    p_workspace_id,
    v_game_id,
    btrim(p_name),
    v_slug,
    nullif(btrim(p_description), ''),
    p_cover_printing_id,
    'private'::public.visibility,
    'active'::public.resource_status,
    v_user_id
  );

  return jsonb_build_object(
    'collection',
    app_private.collection_mutation_json(v_collection_id),
    'replayed',
    false
  );
end;
$$;

create function public.collection_update(
  p_collection_id uuid,
  p_name text,
  p_description text,
  p_cover_printing_id uuid,
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
    'editor'::public.membership_role,
    false
  );

  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 120
    or p_description is not null and char_length(p_description) > 4000
    or p_expected_updated_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_input_invalid';
  end if;

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
  for update;

  if v_collection.status = 'deleted'::public.resource_status then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_deleted_terminal';
  end if;

  if v_collection.updated_at <> p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'talence_collection_stale';
  end if;

  update public.collections
  set
    name = btrim(p_name),
    description = nullif(btrim(p_description), ''),
    cover_printing_id = p_cover_printing_id
  where id = p_collection_id;

  return jsonb_build_object(
    'collection',
    app_private.collection_mutation_json(p_collection_id),
    'replayed',
    false
  );
end;
$$;

create function public.collection_archive(
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
    'editor'::public.membership_role,
    true
  );

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
    status = 'archived'::public.resource_status,
    archived_at = statement_timestamp(),
    deleted_at = null
  where id = p_collection_id;

  return jsonb_build_object(
    'collection',
    app_private.collection_mutation_json(p_collection_id),
    'replayed',
    false
  );
end;
$$;

create function public.collection_restore(
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
    'editor'::public.membership_role,
    false
  );

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
  for update;

  if v_collection.status <> 'archived'::public.resource_status then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_restore_requires_archived';
  end if;

  if p_expected_updated_at is null
    or v_collection.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_collection_stale';
  end if;

  update public.collections
  set
    status = 'active'::public.resource_status,
    archived_at = null,
    deleted_at = null
  where id = p_collection_id;

  return jsonb_build_object(
    'collection',
    app_private.collection_mutation_json(p_collection_id),
    'replayed',
    false
  );
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
declare
  v_collection public.collections;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'owner'::public.membership_role,
    false
  );

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

create function public.apply_inventory_transaction(
  p_collection_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz,
  p_lines jsonb,
  p_note text default null,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_lines jsonb;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'editor'::public.membership_role,
    false
  );
  v_lines := app_private.normalize_inventory_delta_lines(p_lines);

  return app_private.apply_inventory_transaction_core(
    'human',
    v_user_id,
    v_user_id,
    null,
    p_collection_id,
    'manual'::public.inventory_source,
    'apply',
    p_collection_id,
    p_idempotency_key,
    p_occurred_at,
    v_lines,
    p_note,
    p_external_reference,
    p_metadata,
    null,
    null,
    null,
    null
  );
end;
$$;

revoke all on function app_private.inventory_request_hash(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.normalize_inventory_delta_lines(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.collection_slug_base(text)
  from public, anon, authenticated;
revoke all on function app_private.collection_mutation_json(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_human_collection_role(
  uuid,
  public.membership_role,
  boolean
)
  from public, anon, authenticated;
revoke all on function app_private.apply_inventory_transaction_core(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  public.inventory_source,
  text,
  uuid,
  text,
  timestamptz,
  jsonb,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  uuid,
  public.inventory_transfer_direction
)
  from public, anon, authenticated;

revoke all on function public.collection_create(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_update(
  uuid,
  text,
  text,
  uuid,
  timestamptz
)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_archive(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_restore(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_delete(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_inventory_transaction(
  uuid,
  text,
  timestamptz,
  jsonb,
  text,
  text,
  jsonb
)
  from public, anon, authenticated, service_role;
