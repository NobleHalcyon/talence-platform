-- Phase 3: filter-aligned non-double-counting analytics, immutable history
-- reads, and bounded formula-safe collection export data.

create function app_private.csv_safe_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null then null
    when left(p_value, 1) in ('=', '+', '-', '@')
      then '''' || p_value
    else p_value
  end
$$;

create function app_private.collection_analytics_internal(
  p_collection_id uuid,
  p_currency text,
  p_normalized_query text,
  p_set_code text,
  p_finish public.card_finish,
  p_condition public.card_condition
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_summary jsonb;
  v_group_map jsonb;
begin
  v_summary := app_private.calculate_collection_summary_internal(
    p_collection_id,
    p_currency,
    p_normalized_query,
    p_set_code,
    p_finish,
    p_condition
  );

  with valued as materialized (
    select row.*
    from app_private.collection_inventory_valued_rows(
      p_collection_id,
      p_currency
    ) as row
    where (
      p_normalized_query is null
      or row.normalized_name like
        '%' || app_private.catalog_escape_like(p_normalized_query) || '%'
        escape E'\\'
    )
      and (p_set_code is null or row.set_code = p_set_code)
      and (p_finish is null or row.finish = p_finish)
      and (p_condition is null or row.condition = p_condition)
  ),
  dimension_rows as (
    select
      'sets'::text as dimension,
      row.set_code as sort_key,
      jsonb_build_object(
        'set_id', row.set_id,
        'set_code', row.set_code,
        'set_name', row.set_name
      ) as group_key,
      row.*
    from valued as row
    union all
    select
      'colors',
      array_to_string(row.colors, ''),
      jsonb_build_object('colors', row.colors),
      row.*
    from valued as row
    union all
    select
      'color_identities',
      array_to_string(row.color_identity, ''),
      jsonb_build_object('color_identity', row.color_identity),
      row.*
    from valued as row
    union all
    select
      'rarities',
      coalesce(row.rarity, ''),
      jsonb_build_object('rarity', row.rarity),
      row.*
    from valued as row
    union all
    select
      'finishes',
      row.finish::text,
      jsonb_build_object('finish', row.finish),
      row.*
    from valued as row
    union all
    select
      'conditions',
      row.condition::text,
      jsonb_build_object('condition', row.condition),
      row.*
    from valued as row
  ),
  grouped as (
    select
      dimension_rows.dimension,
      dimension_rows.sort_key,
      dimension_rows.group_key,
      sum(dimension_rows.quantity) as quantity_total,
      coalesce(
        sum(dimension_rows.quantity) filter (
          where dimension_rows.price_amount is not null
        ),
        0
      ) as priced_quantity,
      coalesce(
        sum(dimension_rows.quantity) filter (
          where dimension_rows.price_amount is null
        ),
        0
      ) as unpriced_quantity,
      coalesce(
        sum(dimension_rows.quantity) filter (
          where dimension_rows.price_amount is not null
            and dimension_rows.price_is_stale
        ),
        0
      ) as stale_quantity,
      case
        when count(*) filter (
          where dimension_rows.price_amount is not null
        ) = 0
        then null
        else round(
          sum(
            dimension_rows.price_amount * dimension_rows.quantity
          ) filter (
            where dimension_rows.price_amount is not null
          ),
          4
        )::text
      end as estimated_value,
      coalesce(
        array_agg(
          distinct dimension_rows.price_provider
          order by dimension_rows.price_provider
        ) filter (where dimension_rows.price_provider is not null),
        '{}'::text[]
      ) as price_providers,
      min(dimension_rows.price_observed_at)
        as oldest_price_observed_at,
      max(dimension_rows.price_observed_at)
        as latest_price_observed_at,
      min(dimension_rows.price_ingested_at)
        as oldest_price_ingested_at,
      max(dimension_rows.price_ingested_at)
        as latest_price_ingested_at
    from dimension_rows
    group by
      dimension_rows.dimension,
      dimension_rows.sort_key,
      dimension_rows.group_key
  ),
  aggregated as (
    select
      grouped.dimension,
      jsonb_agg(
        grouped.group_key || jsonb_build_object(
          'quantity_total', grouped.quantity_total,
          'priced_quantity', grouped.priced_quantity,
          'unpriced_quantity', grouped.unpriced_quantity,
          'stale_quantity', grouped.stale_quantity,
          'estimated_value', grouped.estimated_value,
          'price_providers', grouped.price_providers,
          'oldest_price_observed_at',
            grouped.oldest_price_observed_at,
          'latest_price_observed_at',
            grouped.latest_price_observed_at,
          'oldest_price_ingested_at',
            grouped.oldest_price_ingested_at,
          'latest_price_ingested_at',
            grouped.latest_price_ingested_at
        )
        order by grouped.sort_key, grouped.group_key
      ) as items
    from grouped
    group by grouped.dimension
  )
  select coalesce(
    jsonb_object_agg(aggregated.dimension, aggregated.items),
    '{}'::jsonb
  )
  into v_group_map
  from aggregated;

  return jsonb_build_object(
    'collection_id', p_collection_id,
    'currency', p_currency,
    'filters',
    jsonb_build_object(
      'query', p_normalized_query,
      'set_code', p_set_code,
      'finish', p_finish,
      'condition', p_condition
    ),
    'quantity_total', v_summary -> 'quantity_total',
    'priced_quantity', v_summary -> 'priced_quantity',
    'unpriced_quantity', v_summary -> 'unpriced_quantity',
    'stale_quantity', v_summary -> 'stale_quantity',
    'estimated_value', v_summary -> 'estimated_value',
    'price_providers', v_summary -> 'price_providers',
    'oldest_price_observed_at',
      v_summary -> 'oldest_price_observed_at',
    'latest_price_observed_at',
      v_summary -> 'latest_price_observed_at',
    'oldest_price_ingested_at',
      v_summary -> 'oldest_price_ingested_at',
    'latest_price_ingested_at',
      v_summary -> 'latest_price_ingested_at',
    'groups',
    jsonb_build_object(
      'sets', coalesce(v_group_map -> 'sets', '[]'::jsonb),
      'colors', coalesce(v_group_map -> 'colors', '[]'::jsonb),
      'color_identities',
        coalesce(v_group_map -> 'color_identities', '[]'::jsonb),
      'rarities', coalesce(v_group_map -> 'rarities', '[]'::jsonb),
      'finishes', coalesce(v_group_map -> 'finishes', '[]'::jsonb),
      'conditions', coalesce(v_group_map -> 'conditions', '[]'::jsonb),
      'value_tiers', coalesce(
        v_summary #> '{value_tiers,items}',
        '[]'::jsonb
      )
    )
  );
end;
$$;

create function public.collection_analytics(
  p_collection_id uuid,
  p_query text default null,
  p_set_code text default null,
  p_finish public.card_finish default null,
  p_condition public.card_condition default null,
  p_currency text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_normalized_query text;
  v_set_code text := lower(nullif(btrim(p_set_code), ''));
  v_currency text;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'viewer'::public.membership_role,
    false
  );

  if v_query is not null and char_length(v_query) not between 2 and 200
    or v_set_code is not null
      and v_set_code !~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_inventory_filter_invalid';
  end if;

  v_normalized_query := case
    when v_query is null then null
    else app_private.normalize_catalog_search_text(v_query)
  end;
  v_currency := app_private.current_catalog_currency(p_currency);

  return app_private.collection_analytics_internal(
    p_collection_id,
    v_currency,
    v_normalized_query,
    v_set_code,
    p_finish,
    p_condition
  );
end;
$$;

create function app_private.inventory_transaction_line_json(
  p_transaction_line_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'line_number', line.line_number,
    'client_line_count', cardinality(line.client_line_ids),
    'client_line_ids_preview', line.client_line_ids[1:5],
    'printing_id', line.printing_id,
    'finish', line.finish,
    'condition', line.condition,
    'quantity_delta', line.quantity_delta,
    'quantity_before', line.quantity_before,
    'quantity_after', line.quantity_after,
    'display_name', coalesce(
      printing.printed_name,
      card.name,
      first_face.name,
      printing.collector_number
    ),
    'set_code', catalog_set.code,
    'collector_number', printing.collector_number,
    'language', printing.language
  )
  from public.inventory_transaction_lines as line
  join public.catalog_printings as printing
    on printing.id = line.printing_id
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  left join lateral (
    select face.name
    from public.catalog_faces as face
    where face.printing_id = printing.id
    order by face.face_index
    limit 1
  ) as first_face on true
  where line.id = p_transaction_line_id
$$;

create function public.collection_transaction_history(
  p_collection_id uuid,
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
  v_after_occurred_at timestamptz;
  v_after_committed_at timestamptz;
  v_after_id uuid;
  v_cursor_collection_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_paired_transaction_id uuid;
  v_reversed_by_transaction_id uuid;
  v_actor_label text;
  v_idempotency_hash text;
  v_line_count integer;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'viewer'::public.membership_role,
    false
  );

  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_history_limit_invalid';
  end if;

  if p_after is not null then
    v_cursor := app_private.inventory_decode_cursor(p_after);
    begin
      v_after_occurred_at :=
        (v_cursor ->> 'occurred_at')::timestamptz;
      v_after_committed_at :=
        (v_cursor ->> 'committed_at')::timestamptz;
      v_after_id := (v_cursor ->> 'transaction_id')::uuid;
      v_cursor_collection_id :=
        (v_cursor ->> 'collection_id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_cursor_invalid';
    end;

    if v_after_occurred_at is null
      or v_after_committed_at is null
      or v_after_id is null
      or v_cursor_collection_id <> p_collection_id
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_cursor_invalid';
    end if;
  end if;

  for v_row in
    select transaction.*
    from public.inventory_transactions as transaction
    where transaction.collection_id = p_collection_id
      and (
        v_after_id is null
        or (
          transaction.occurred_at,
          transaction.committed_at,
          transaction.id
        ) < (
          v_after_occurred_at,
          v_after_committed_at,
          v_after_id
        )
      )
    order by
      transaction.occurred_at desc,
      transaction.committed_at desc,
      transaction.id desc
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    select count(*)::integer
    into v_line_count
    from public.inventory_transaction_lines as line
    where line.transaction_id = v_row.id;

    select coalesce(
      jsonb_agg(
        app_private.inventory_transaction_line_json(preview.id)
        order by preview.line_number
      ),
      '[]'::jsonb
    )
    into v_lines
    from (
      select line.id, line.line_number
      from public.inventory_transaction_lines as line
      where line.transaction_id = v_row.id
      order by line.line_number
      limit 5
    ) as preview;

    select paired.id
    into v_paired_transaction_id
    from public.inventory_transactions as paired
    where v_row.transfer_group_id is not null
      and paired.transfer_group_id = v_row.transfer_group_id
      and paired.id <> v_row.id
    limit 1;

    select reversal.id
    into v_reversed_by_transaction_id
    from public.inventory_transactions as reversal
    where reversal.reverses_transaction_id = v_row.id
    limit 1;

    if v_row.actor_user_id is not null then
      select coalesce(
        nullif(btrim(profile.display_name), ''),
        nullif(btrim(profile.handle), ''),
        'User ' || left(v_row.actor_user_id::text, 8)
      )
      into v_actor_label
      from public.profiles as profile
      where profile.user_id = v_row.actor_user_id;

      v_actor_label := coalesce(
        v_actor_label,
        'User ' || left(v_row.actor_user_id::text, 8)
      );
    elsif v_row.device_id is not null then
      v_actor_label := 'Device ' || left(v_row.device_id::text, 8);
    else
      v_actor_label := 'System';
    end if;

    v_idempotency_hash := encode(
      extensions.digest(
        convert_to(v_row.idempotency_key, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'transaction_id', v_row.id,
        'workspace_id', v_row.workspace_id,
        'collection_id', v_row.collection_id,
        'source', v_row.source,
        'actor_user_id', v_row.actor_user_id,
        'actor_label', v_actor_label,
        'device_id', v_row.device_id,
        'import_job_id', v_row.import_job_id,
        'idempotency_reference',
          v_row.source::text
          || '_••••'
          || left(v_idempotency_hash, 8)
          || right(v_idempotency_hash, 8),
        'external_reference', v_row.external_reference,
        'reverses_transaction_id', v_row.reverses_transaction_id,
        'reversed_by_transaction_id', v_reversed_by_transaction_id,
        'transfer_group_id', v_row.transfer_group_id,
        'transfer_direction', v_row.transfer_direction,
        'paired_transaction_id', v_paired_transaction_id,
        'occurred_at', v_row.occurred_at,
        'committed_at', v_row.committed_at,
        'note', v_row.note,
        'line_count', v_line_count,
        'lines_truncated', v_line_count > 5,
        'lines', v_lines
      )
    );
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'collection_id', p_collection_id,
        'occurred_at', v_row.occurred_at,
        'committed_at', v_row.committed_at,
        'transaction_id', v_row.id
      )
    );
  end loop;

  return jsonb_build_object(
    'collection_id', p_collection_id,
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.collection_transaction_lines(
  p_transaction_id uuid,
  p_after_line_number integer default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_transaction public.inventory_transactions;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_after_line_number integer;
  v_line_count integer;
begin
  select transaction.*
  into v_transaction
  from public.inventory_transactions as transaction
  where transaction.id = p_transaction_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_inventory_transaction_not_found';
  end if;

  perform app_private.assert_human_collection_role(
    v_transaction.collection_id,
    'viewer'::public.membership_role,
    false
  );

  if p_after_line_number is null
    or p_after_line_number not between 0 and 5000
    or p_limit is null
    or p_limit not between 1 and 200
    or (
      p_after_line_number > 0
      and not exists (
        select 1
        from public.inventory_transaction_lines as line
        where line.transaction_id = p_transaction_id
          and line.line_number = p_after_line_number
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_transaction_lines_page_invalid';
  end if;

  select count(*)::integer
  into v_line_count
  from public.inventory_transaction_lines as line
  where line.transaction_id = p_transaction_id;

  for v_row in
    select line.id, line.line_number
    from public.inventory_transaction_lines as line
    where line.transaction_id = p_transaction_id
      and line.line_number > p_after_line_number
    order by line.line_number
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      app_private.inventory_transaction_line_json(v_row.id)
    );
    v_next_after_line_number := v_row.line_number;
  end loop;

  return jsonb_build_object(
    'transaction_id', p_transaction_id,
    'collection_id', v_transaction.collection_id,
    'line_count', v_line_count,
    'after_line_number', p_after_line_number,
    'items', v_items,
    'next_after_line_number',
      case when v_has_more then v_next_after_line_number else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.collection_inventory_export(
  p_collection_id uuid,
  p_after text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
  v_cursor jsonb;
  v_after_printing_id uuid;
  v_after_finish public.card_finish;
  v_after_condition public.card_condition;
  v_cursor_collection_id uuid;
  v_cursor_currency text;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'viewer'::public.membership_role,
    false
  );

  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_export_limit_invalid';
  end if;

  v_currency := app_private.current_catalog_currency(null);

  if p_after is not null then
    v_cursor := app_private.inventory_decode_cursor(p_after);
    begin
      v_after_printing_id := (v_cursor ->> 'printing_id')::uuid;
      v_after_finish := (v_cursor ->> 'finish')::public.card_finish;
      v_after_condition :=
        (v_cursor ->> 'condition')::public.card_condition;
      v_cursor_collection_id :=
        (v_cursor ->> 'collection_id')::uuid;
      v_cursor_currency := v_cursor ->> 'currency';
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_cursor_invalid';
    end;

    if v_after_printing_id is null
      or v_after_finish is null
      or v_after_condition is null
      or v_cursor_collection_id <> p_collection_id
      or v_cursor_currency <> v_currency
    then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_cursor_invalid';
    end if;
  end if;

  for v_row in
    select
      valued.*,
      balance.last_transaction_id,
      printing.source_provider as printing_source_provider,
      printing.source_id as printing_source_id,
      printing.collector_number,
      printing.language,
      printing.printed_name,
      card.source_provider as card_source_provider,
      card.source_id as card_source_id,
      card.name as card_name
    from app_private.collection_inventory_valued_rows(
      p_collection_id,
      v_currency
    ) as valued
    join public.inventory_balances as balance
      on balance.collection_id = p_collection_id
      and balance.printing_id = valued.printing_id
      and balance.finish = valued.finish
      and balance.condition = valued.condition
    join public.catalog_printings as printing
      on printing.id = valued.printing_id
    left join public.catalog_cards as card
      on card.id = printing.card_id
    where (
      v_after_printing_id is null
      or (
        valued.printing_id,
        valued.finish::text,
        valued.condition::text
      ) > (
        v_after_printing_id,
        v_after_finish::text,
        v_after_condition::text
      )
    )
    order by
      valued.printing_id,
      valued.finish::text,
      valued.condition::text
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'printing_id', v_row.printing_id,
        'scryfall_id', case
          when v_row.printing_source_provider = 'scryfall'
            then v_row.printing_source_id
          else null
        end,
        'oracle_card_id', v_row.card_id,
        'oracle_id', case
          when v_row.card_source_provider = 'scryfall'
            then v_row.card_source_id
          else null
        end,
        'set_id', v_row.set_id,
        'set_code', v_row.set_code,
        'set_name', v_row.set_name,
        'collector_number', v_row.collector_number,
        'language', v_row.language,
        'card_name', v_row.card_name,
        'printed_name', v_row.printed_name,
        'display_name', v_row.display_name,
        'name', v_row.display_name,
        'finish', v_row.finish,
        'condition', v_row.condition,
        'quantity', v_row.quantity,
        'last_transaction_id', v_row.last_transaction_id,
        'current_price', case
          when v_row.price_amount is null then null
          else jsonb_build_object(
            'provider', v_row.price_provider,
            'currency', v_row.price_currency,
            'finish', v_row.finish,
            'amount', v_row.price_amount::text,
            'observed_at', v_row.price_observed_at,
            'ingested_at', v_row.price_ingested_at,
            'stale_after', v_row.price_stale_after,
            'is_stale', v_row.price_is_stale
          )
        end,
        'total_estimate', case
          when v_row.price_amount is null then null
          else round(v_row.price_amount * v_row.quantity, 4)::text
        end
      )
    );
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'collection_id', p_collection_id,
        'currency', v_currency,
        'printing_id', v_row.printing_id,
        'finish', v_row.finish,
        'condition', v_row.condition
      )
    );
  end loop;

  return jsonb_build_object(
    'collection_id', p_collection_id,
    'currency', v_currency,
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

revoke all on function app_private.csv_safe_text(text)
  from public, anon, authenticated;
revoke all on function app_private.collection_analytics_internal(
  uuid,
  text,
  text,
  text,
  public.card_finish,
  public.card_condition
)
  from public, anon, authenticated;
revoke all on function app_private.inventory_transaction_line_json(uuid)
  from public, anon, authenticated;
revoke all on function public.collection_analytics(
  uuid,
  text,
  text,
  public.card_finish,
  public.card_condition,
  text
)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_transaction_history(
  uuid,
  text,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_transaction_lines(
  uuid,
  integer,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_inventory_export(
  uuid,
  text,
  integer
)
  from public, anon, authenticated, service_role;
