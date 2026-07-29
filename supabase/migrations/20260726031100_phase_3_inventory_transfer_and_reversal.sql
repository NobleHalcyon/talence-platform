-- Phase 3: atomic paired collection transfers and full compensating reversals.

create function app_private.normalize_inventory_transfer_lines(p_lines jsonb)
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
  v_quantity integer;
  v_expected_source integer;
  v_expected_destination integer;
begin
  if p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 500
    or pg_column_size(p_lines) > 262144
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_transfer_lines_invalid';
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
          'quantity',
          'expected_source_quantity_before',
          'expected_destination_quantity_before'
        )
      )
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_transfer_line_shape_invalid';
    end if;

    begin
      v_line_id := btrim(v_item ->> 'line_id');
      v_printing_id := (v_item ->> 'printing_id')::uuid;
      v_finish := (v_item ->> 'finish')::public.card_finish;
      v_condition := (v_item ->> 'condition')::public.card_condition;
      v_quantity := (v_item ->> 'quantity')::integer;
      v_expected_source := case
        when v_item ? 'expected_source_quantity_before'
          and jsonb_typeof(
            v_item -> 'expected_source_quantity_before'
          ) <> 'null'
        then (v_item ->> 'expected_source_quantity_before')::integer
        else null
      end;
      v_expected_destination := case
        when v_item ? 'expected_destination_quantity_before'
          and jsonb_typeof(
            v_item -> 'expected_destination_quantity_before'
          ) <> 'null'
        then (v_item ->> 'expected_destination_quantity_before')::integer
        else null
      end;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
        or null_value_not_allowed
      then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_transfer_line_value_invalid';
    end;

    if v_line_id is null
      or char_length(v_line_id) not between 1 and 128
      or v_printing_id is null
      or v_finish is null
      or v_finish = 'unknown'::public.card_finish
      or v_condition is null
      or v_condition = 'unknown'::public.card_condition
      or v_quantity is null
      or v_quantity not between 1 and 10000
      or v_expected_source is not null and v_expected_source < 0
      or v_expected_destination is not null and v_expected_destination < 0
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_transfer_line_value_invalid';
    end if;

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_id,
        'printing_id', v_printing_id,
        'finish', v_finish,
        'condition', v_condition,
        'quantity', v_quantity,
        'expected_source_quantity_before', v_expected_source,
        'expected_destination_quantity_before', v_expected_destination
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
      expected_source_quantity_before integer,
      expected_destination_quantity_before integer
    )
    group by line.printing_id, line.finish, line.condition
    having count(
      distinct coalesce(line.expected_source_quantity_before, -1)
    ) > 1
      or count(
        distinct coalesce(line.expected_destination_quantity_before, -1)
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
      quantity integer
    )
    group by line.printing_id, line.finish, line.condition
    having sum(line.quantity) not between 1 and 50000000
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_transfer_aggregate_invalid';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'line_ids', grouped.line_ids,
      'printing_id', grouped.printing_id,
      'finish', grouped.finish,
      'condition', grouped.condition,
      'quantity', grouped.quantity,
      'expected_source_quantity_before',
        grouped.expected_source_quantity_before,
      'expected_destination_quantity_before',
        grouped.expected_destination_quantity_before
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
      sum(line.quantity)::integer as quantity,
      min(line.expected_source_quantity_before)
        as expected_source_quantity_before,
      min(line.expected_destination_quantity_before)
        as expected_destination_quantity_before
    from jsonb_to_recordset(v_rows) as line(
      line_id text,
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity integer,
      expected_source_quantity_before integer,
      expected_destination_quantity_before integer
    )
    group by line.printing_id, line.finish, line.condition
  ) as grouped;

  return v_result;
end;
$$;

create function app_private.transfer_inventory_core(
  p_principal_kind text,
  p_principal_id uuid,
  p_actor_user_id uuid,
  p_source_collection_id uuid,
  p_destination_collection_id uuid,
  p_source public.inventory_source,
  p_operation_type text,
  p_scope_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz,
  p_normalized_lines jsonb,
  p_note text,
  p_metadata jsonb,
  p_reverses_out_transaction_id uuid,
  p_reverses_in_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source_collection public.collections;
  v_destination_collection public.collections;
  v_existing app_private.inventory_operation_requests;
  v_canonical_request jsonb;
  v_request_hash text;
  v_transfer_group_id uuid := gen_random_uuid();
  v_source_transaction_id uuid := gen_random_uuid();
  v_destination_transaction_id uuid := gen_random_uuid();
  v_committed_at timestamptz := statement_timestamp();
  v_prepared_lines jsonb := '[]'::jsonb;
  v_result_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_lock_collection_id uuid;
  v_line record;
  v_source_before integer;
  v_source_after integer;
  v_destination_before integer;
  v_destination_after integer;
  v_line_number integer := 0;
  v_quantity_transferred bigint := 0;
begin
  if p_principal_kind <> 'human'
    or p_principal_id is null
    or p_actor_user_id is null
    or p_actor_user_id <> p_principal_id
    or p_source_collection_id is null
    or p_destination_collection_id is null
    or p_source_collection_id = p_destination_collection_id
    or p_source not in (
      'transfer'::public.inventory_source,
      'reversal'::public.inventory_source
    )
    or p_operation_type not in ('transfer', 'reversal')
    or p_scope_id is null
    or p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 8 and 200
    or p_occurred_at is null
    or p_occurred_at > statement_timestamp() + interval '5 minutes'
    or p_normalized_lines is null
    or jsonb_typeof(p_normalized_lines) <> 'array'
    or jsonb_array_length(p_normalized_lines) not between 1 and 500
    or p_note is not null and char_length(p_note) > 4000
    or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 16384
    or (
      p_source = 'transfer'::public.inventory_source
      and (
        p_reverses_out_transaction_id is not null
        or p_reverses_in_transaction_id is not null
      )
    )
    or (
      p_source = 'reversal'::public.inventory_source
      and (
        p_reverses_out_transaction_id is null
        or p_reverses_in_transaction_id is null
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_transfer_request_invalid';
  end if;

  v_canonical_request := jsonb_build_object(
    'version', 1,
    'operation_type', p_operation_type,
    'source_collection_id', p_source_collection_id,
    'destination_collection_id', p_destination_collection_id,
    'source', p_source,
    'occurred_at_utc', to_char(
      p_occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'lines', p_normalized_lines,
    'note', p_note,
    'metadata', p_metadata,
    'reverses_out_transaction_id', p_reverses_out_transaction_id,
    'reverses_in_transaction_id', p_reverses_in_transaction_id
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

  perform 1
  from public.collections as collection
  where collection.id in (
    p_source_collection_id,
    p_destination_collection_id
  )
  order by collection.id
  for update;

  select collection.*
  into v_source_collection
  from public.collections as collection
  where collection.id = p_source_collection_id;

  select collection.*
  into v_destination_collection
  from public.collections as collection
  where collection.id = p_destination_collection_id;

  if v_source_collection.id is null
    or v_destination_collection.id is null
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_collection_not_found';
  end if;

  if v_source_collection.status <> 'active'::public.resource_status
    or v_destination_collection.status <> 'active'::public.resource_status
  then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_not_active';
  end if;

  if v_source_collection.workspace_id <> v_destination_collection.workspace_id
    or v_source_collection.game_id <> v_destination_collection.game_id
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_transfer_scope_mismatch';
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

  if p_source = 'reversal'::public.inventory_source
    and exists (
      select 1
      from public.inventory_transactions as reversal
      where reversal.reverses_transaction_id in (
        p_reverses_out_transaction_id,
        p_reverses_in_transaction_id
      )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_transaction_already_reversed';
  end if;

  for v_lock_collection_id in
    select collection_id
    from unnest(
      array[
        p_source_collection_id,
        p_destination_collection_id
      ]
    ) as lock_collection(collection_id)
    order by collection_id
  loop
    for v_line in
      select line.*
      from jsonb_to_recordset(p_normalized_lines) as line(
        line_ids text[],
        printing_id uuid,
        finish public.card_finish,
        condition public.card_condition,
        quantity integer,
        expected_source_quantity_before integer,
        expected_destination_quantity_before integer
      )
      order by
        line.printing_id,
        line.finish::text,
        line.condition::text
    loop
      perform pg_advisory_xact_lock(
        hashtextextended(
          'talence.inventory:'
            || v_lock_collection_id::text
            || ':'
            || v_line.printing_id::text
            || ':'
            || v_line.finish::text
            || ':'
            || v_line.condition::text,
          0
        )
      );
    end loop;
  end loop;

  for v_line in
    select line.*
    from jsonb_to_recordset(p_normalized_lines) as line(
      line_ids text[],
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity integer,
      expected_source_quantity_before integer,
      expected_destination_quantity_before integer
    )
    order by
      line.printing_id,
      line.finish::text,
      line.condition::text
  loop
    if v_line.line_ids is null
      or cardinality(v_line.line_ids) not between 1 and 500
      or array_position(v_line.line_ids, null) is not null
      or v_line.quantity is null
      or v_line.quantity not between 1 and 50000000
      or v_line.finish is null
      or v_line.finish = 'unknown'::public.card_finish
      or v_line.condition is null
      or v_line.condition = 'unknown'::public.card_condition
      or v_line.expected_source_quantity_before is not null
        and v_line.expected_source_quantity_before < 0
      or v_line.expected_destination_quantity_before is not null
        and v_line.expected_destination_quantity_before < 0
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_transfer_normalized_line_invalid';
    end if;

    perform 1
    from public.catalog_printings as printing
    where printing.id = v_line.printing_id
      and printing.game_id = v_source_collection.game_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'talence_catalog_printing_unknown';
    end if;

    select balance.quantity
    into v_source_before
    from public.inventory_balances as balance
    where balance.collection_id = p_source_collection_id
      and balance.printing_id = v_line.printing_id
      and balance.finish = v_line.finish
      and balance.condition = v_line.condition
    for update;
    v_source_before := coalesce(v_source_before, 0);

    select balance.quantity
    into v_destination_before
    from public.inventory_balances as balance
    where balance.collection_id = p_destination_collection_id
      and balance.printing_id = v_line.printing_id
      and balance.finish = v_line.finish
      and balance.condition = v_line.condition
    for update;
    v_destination_before := coalesce(v_destination_before, 0);

    if v_line.expected_source_quantity_before is not null
      and v_line.expected_source_quantity_before <> v_source_before
    then
      raise exception using
        errcode = '40001',
        message = 'talence_inventory_stale_source_quantity';
    end if;

    if v_line.expected_destination_quantity_before is not null
      and v_line.expected_destination_quantity_before <> v_destination_before
    then
      raise exception using
        errcode = '40001',
        message = 'talence_inventory_stale_destination_quantity';
    end if;

    v_source_after := v_source_before - v_line.quantity;
    v_destination_after := v_destination_before + v_line.quantity;

    if v_source_after < 0 then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_quantity_negative';
    end if;

    v_prepared_lines := v_prepared_lines || jsonb_build_array(
      jsonb_build_object(
        'line_ids', v_line.line_ids,
        'printing_id', v_line.printing_id,
        'finish', v_line.finish,
        'condition', v_line.condition,
        'quantity', v_line.quantity,
        'source_quantity_before', v_source_before,
        'source_quantity_after', v_source_after,
        'destination_quantity_before', v_destination_before,
        'destination_quantity_after', v_destination_after
      )
    );
  end loop;

  insert into public.inventory_transactions (
    id,
    workspace_id,
    collection_id,
    source,
    actor_user_id,
    idempotency_key,
    reverses_transaction_id,
    transfer_group_id,
    transfer_direction,
    occurred_at,
    committed_at,
    note,
    metadata
  )
  values
    (
      v_source_transaction_id,
      v_source_collection.workspace_id,
      p_source_collection_id,
      p_source,
      p_actor_user_id,
      btrim(p_idempotency_key),
      p_reverses_out_transaction_id,
      v_transfer_group_id,
      'out'::public.inventory_transfer_direction,
      p_occurred_at,
      v_committed_at,
      nullif(p_note, ''),
      p_metadata
    ),
    (
      v_destination_transaction_id,
      v_destination_collection.workspace_id,
      p_destination_collection_id,
      p_source,
      p_actor_user_id,
      btrim(p_idempotency_key),
      p_reverses_in_transaction_id,
      v_transfer_group_id,
      'in'::public.inventory_transfer_direction,
      p_occurred_at,
      v_committed_at,
      nullif(p_note, ''),
      p_metadata
    );

  for v_line in
    select line.*
    from jsonb_to_recordset(v_prepared_lines) as line(
      line_ids text[],
      printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      quantity integer,
      source_quantity_before integer,
      source_quantity_after integer,
      destination_quantity_before integer,
      destination_quantity_after integer
    )
    order by
      line.printing_id,
      line.finish::text,
      line.condition::text
  loop
    v_line_number := v_line_number + 1;

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
    values
      (
        v_source_transaction_id,
        v_source_collection.workspace_id,
        p_source_collection_id,
        v_line_number,
        v_line.line_ids,
        v_line.printing_id,
        v_line.finish,
        v_line.condition,
        -v_line.quantity,
        v_line.source_quantity_before,
        v_line.source_quantity_after,
        v_committed_at
      ),
      (
        v_destination_transaction_id,
        v_destination_collection.workspace_id,
        p_destination_collection_id,
        v_line_number,
        v_line.line_ids,
        v_line.printing_id,
        v_line.finish,
        v_line.condition,
        v_line.quantity,
        v_line.destination_quantity_before,
        v_line.destination_quantity_after,
        v_committed_at
      );

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
    values
      (
        v_source_collection.workspace_id,
        p_source_collection_id,
        v_line.printing_id,
        v_line.finish,
        v_line.condition,
        v_line.source_quantity_after,
        v_source_transaction_id,
        v_committed_at,
        v_committed_at
      ),
      (
        v_destination_collection.workspace_id,
        p_destination_collection_id,
        v_line.printing_id,
        v_line.finish,
        v_line.condition,
        v_line.destination_quantity_after,
        v_destination_transaction_id,
        v_committed_at,
        v_committed_at
      )
    on conflict (collection_id, printing_id, finish, condition)
    do update set
      quantity = excluded.quantity,
      last_transaction_id = excluded.last_transaction_id,
      updated_at = excluded.updated_at;

    v_quantity_transferred := v_quantity_transferred + v_line.quantity;
    v_result_lines := v_result_lines || jsonb_build_array(
      jsonb_build_object(
        'line_number', v_line_number,
        'line_ids', v_line.line_ids,
        'printing_id', v_line.printing_id,
        'finish', v_line.finish,
        'condition', v_line.condition,
        'quantity', v_line.quantity,
        'source_quantity_before', v_line.source_quantity_before,
        'source_quantity_after', v_line.source_quantity_after,
        'destination_quantity_before', v_line.destination_quantity_before,
        'destination_quantity_after', v_line.destination_quantity_after
      )
    );
  end loop;

  v_result := jsonb_build_object(
    'transfer_group_id', v_transfer_group_id,
    'source_transaction_id', v_source_transaction_id,
    'destination_transaction_id', v_destination_transaction_id,
    'source_collection_id', p_source_collection_id,
    'destination_collection_id', p_destination_collection_id,
    'source', p_source,
    'occurred_at', p_occurred_at,
    'committed_at', v_committed_at,
    'replayed', false,
    'lines', v_result_lines,
    'totals', jsonb_build_object(
      'line_count', v_line_number,
      'quantity_transferred', v_quantity_transferred
    )
  );

  if p_source = 'reversal'::public.inventory_source then
    v_result := v_result || jsonb_build_object(
      'reversed_transaction_ids',
      to_jsonb(
        array[
          p_reverses_out_transaction_id,
          p_reverses_in_transaction_id
        ]
      )
    );
  end if;

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
    v_source_collection.workspace_id,
    p_scope_id,
    btrim(p_idempotency_key),
    v_request_hash,
    array[v_source_transaction_id, v_destination_transaction_id],
    v_result,
    v_committed_at
  );

  return v_result;
end;
$$;

create function public.transfer_inventory(
  p_source_collection_id uuid,
  p_destination_collection_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz,
  p_lines jsonb,
  p_note text default null,
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
    p_source_collection_id,
    'editor'::public.membership_role,
    false
  );
  perform app_private.assert_human_collection_role(
    p_destination_collection_id,
    'editor'::public.membership_role,
    false
  );
  v_lines := app_private.normalize_inventory_transfer_lines(p_lines);

  return app_private.transfer_inventory_core(
    'human',
    v_user_id,
    v_user_id,
    p_source_collection_id,
    p_destination_collection_id,
    'transfer'::public.inventory_source,
    'transfer',
    p_source_collection_id,
    p_idempotency_key,
    p_occurred_at,
    v_lines,
    p_note,
    p_metadata,
    null,
    null
  );
end;
$$;

create function public.reverse_inventory_transaction(
  p_transaction_id uuid,
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
  v_target public.inventory_transactions;
  v_original_out public.inventory_transactions;
  v_original_in public.inventory_transactions;
  v_lines jsonb;
  v_result jsonb;
  v_reversed_ids uuid[];
begin
  if p_transaction_id is null then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_reversal_request_invalid';
  end if;

  select transaction.*
  into v_target
  from public.inventory_transactions as transaction
  where transaction.id = p_transaction_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_transaction_not_found';
  end if;

  perform app_private.assert_human_collection_role(
    v_target.collection_id,
    'editor'::public.membership_role,
    false
  );

  if v_target.source = 'reversal'::public.inventory_source then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_reversal_of_reversal_denied';
  end if;

  if v_target.transfer_group_id is null then
    select jsonb_agg(
      jsonb_build_object(
        'line_ids',
          array['reverse:' || line.id::text],
        'printing_id', line.printing_id,
        'finish', line.finish,
        'condition', line.condition,
        'quantity_delta', -line.quantity_delta,
        'expected_quantity_before', null
      )
      order by line.line_number
    )
    into v_lines
    from public.inventory_transaction_lines as line
    where line.transaction_id = v_target.id;

    if v_lines is null then
      raise exception using
        errcode = '55000',
        message = 'talence_inventory_transaction_has_no_lines';
    end if;

    v_result := app_private.apply_inventory_transaction_core(
      'human',
      v_user_id,
      v_user_id,
      null,
      v_target.collection_id,
      'reversal'::public.inventory_source,
      'reversal',
      v_target.id,
      p_idempotency_key,
      p_occurred_at,
      v_lines,
      p_note,
      null,
      jsonb_build_object('reversal_of_transaction_id', v_target.id),
      null,
      v_target.id,
      null,
      null
    );

    return v_result || jsonb_build_object(
      'reversed_transaction_ids',
      to_jsonb(array[v_target.id])
    );
  end if;

  select transaction.*
  into v_original_out
  from public.inventory_transactions as transaction
  where transaction.transfer_group_id = v_target.transfer_group_id
    and transaction.transfer_direction = 'out'
    and transaction.source = 'transfer'::public.inventory_source;

  select transaction.*
  into v_original_in
  from public.inventory_transactions as transaction
  where transaction.transfer_group_id = v_target.transfer_group_id
    and transaction.transfer_direction = 'in'
    and transaction.source = 'transfer'::public.inventory_source;

  if v_original_out.id is null or v_original_in.id is null then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_transfer_pair_invalid';
  end if;

  perform app_private.assert_human_collection_role(
    v_original_out.collection_id,
    'editor'::public.membership_role,
    false
  );
  perform app_private.assert_human_collection_role(
    v_original_in.collection_id,
    'editor'::public.membership_role,
    false
  );

  select jsonb_agg(
    jsonb_build_object(
      'line_ids',
        array['reverse:' || line.id::text],
      'printing_id', line.printing_id,
      'finish', line.finish,
      'condition', line.condition,
      'quantity', -line.quantity_delta,
      'expected_source_quantity_before', null,
      'expected_destination_quantity_before', null
    )
    order by line.line_number
  )
  into v_lines
  from public.inventory_transaction_lines as line
  where line.transaction_id = v_original_out.id;

  if v_lines is null then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_transaction_has_no_lines';
  end if;

  v_reversed_ids := array[v_original_in.id, v_original_out.id];

  return app_private.transfer_inventory_core(
    'human',
    v_user_id,
    v_user_id,
    v_original_in.collection_id,
    v_original_out.collection_id,
    'reversal'::public.inventory_source,
    'reversal',
    v_target.id,
    p_idempotency_key,
    p_occurred_at,
    v_lines,
    p_note,
    jsonb_build_object(
      'reversal_of_transaction_ids',
      to_jsonb(v_reversed_ids)
    ),
    v_original_in.id,
    v_original_out.id
  );
end;
$$;

revoke all on function app_private.normalize_inventory_transfer_lines(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.transfer_inventory_core(
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
  jsonb,
  uuid,
  uuid
)
  from public, anon, authenticated;
revoke all on function public.transfer_inventory(
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb,
  text,
  jsonb
)
  from public, anon, authenticated, service_role;
revoke all on function public.reverse_inventory_transaction(
  uuid,
  text,
  timestamptz,
  text
)
  from public, anon, authenticated, service_role;
