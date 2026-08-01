-- Collection inventory reuses the same validated filter tree and rule evaluator,
-- but evaluates finish/condition/quantity against owned balance rows.

create function app_private.collection_filtered_valued_rows(
  p_collection_id uuid,
  p_currency text,
  p_query text,
  p_filters jsonb
)
returns table (
  printing_id uuid, card_id uuid, set_id uuid, set_code text, set_name text,
  display_name text, normalized_name text, colors text[], color_identity text[],
  rarity text, finish public.card_finish, condition public.card_condition,
  quantity integer, last_transaction_id uuid, updated_at timestamptz,
  price_provider text, price_currency text, price_amount numeric,
  price_observed_at timestamptz, price_ingested_at timestamptz,
  price_stale_after timestamptz, price_is_stale boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select row.*
  from app_private.collection_inventory_valued_rows(p_collection_id, p_currency) as row
  where (
    p_query is null
    or row.normalized_name like '%' || app_private.catalog_escape_like(
      app_private.normalize_catalog_search_text(p_query)
    ) || '%' escape E'\\'
  )
    and app_private.catalog_filter_matches(
      p_filters, row.printing_id, row.card_id, row.finish, row.condition, row.quantity
    )
$$;

create function public.collection_inventory_filter_page(
  p_collection_id uuid,
  p_query text default null,
  p_filters jsonb default '{"id":"root","operator":"and","children":[]}'::jsonb,
  p_sort text default 'name',
  p_after text default null,
  p_limit integer default 50,
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
  v_sort text := lower(nullif(btrim(p_sort), ''));
  v_currency text;
  v_scope text;
  v_cursor jsonb;
  v_after_rank bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_total_count bigint;
  v_has_more boolean := false;
  v_next_cursor text;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id, 'viewer'::public.membership_role, false
  );
  if not app_private.catalog_filter_valid(p_filters)
    or v_sort not in ('name', 'updated_desc', 'quantity_desc', 'value_desc')
    or p_limit not between 1 and 100
    or v_query is not null and char_length(v_query) not between 2 and 200
  then raise exception using errcode = '22023', message = 'talence_collection_filter_invalid'; end if;
  v_currency := app_private.current_catalog_currency(p_currency);
  v_scope := md5(jsonb_build_object(
    'collection', p_collection_id, 'query', v_query, 'filters', p_filters,
    'sort', v_sort, 'currency', v_currency
  )::text);

  if p_after is not null then
    v_cursor := app_private.inventory_decode_cursor(p_after);
    begin
      if v_cursor ->> 'v' <> '2' or v_cursor ->> 'scope' is distinct from v_scope then
        raise exception 'scope mismatch';
      end if;
      v_after_rank := (v_cursor ->> 'rank')::bigint;
    exception when others then
      raise exception using errcode = '22023', message = 'talence_inventory_cursor_invalid';
    end;
  end if;

  select count(*) into v_total_count
  from app_private.collection_filtered_valued_rows(
    p_collection_id, v_currency, v_query, p_filters
  );

  for v_row in
    with ranked as (
      select row.*, row_number() over (
        order by
          case when v_sort = 'name' then row.normalized_name end,
          case when v_sort = 'updated_desc' then row.updated_at end desc,
          case when v_sort = 'quantity_desc' then row.quantity end desc,
          case when v_sort = 'value_desc' then (row.price_amount is null)::integer end,
          case when v_sort = 'value_desc' then row.price_amount * row.quantity end desc,
          row.printing_id, row.finish::text, row.condition::text
      ) as row_rank
      from app_private.collection_filtered_valued_rows(
        p_collection_id, v_currency, v_query, p_filters
      ) as row
    )
    select * from ranked where row_rank > v_after_rank order by row_rank limit p_limit + 1
  loop
    if v_count = p_limit then v_has_more := true; exit; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'printing_id', v_row.printing_id,
      'finish', v_row.finish,
      'condition', v_row.condition,
      'quantity', v_row.quantity,
      'last_transaction_id', v_row.last_transaction_id,
      'updated_at', v_row.updated_at,
      'printing', app_private.inventory_printing_to_json(
        v_row.printing_id, v_currency, v_row.finish
      ),
      'current_price', case when v_row.price_amount is null then null else jsonb_build_object(
        'provider', v_row.price_provider, 'currency', v_row.price_currency,
        'finish', v_row.finish, 'amount', v_row.price_amount::text,
        'observed_at', v_row.price_observed_at, 'ingested_at', v_row.price_ingested_at,
        'stale_after', v_row.price_stale_after, 'is_stale', v_row.price_is_stale
      ) end,
      'total_estimate', case when v_row.price_amount is null then null
        else round(v_row.price_amount * v_row.quantity, 4)::text end
    ));
    v_count := v_count + 1;
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object('v', 2, 'scope', v_scope, 'rank', v_row.row_rank)
    );
  end loop;

  return jsonb_build_object(
    'collection_id', p_collection_id, 'currency', v_currency, 'items', v_items,
    'result_count', v_count, 'total_count', v_total_count,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.collection_filter_analytics(
  p_collection_id uuid,
  p_query text default null,
  p_filters jsonb default '{"id":"root","operator":"and","children":[]}'::jsonb,
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
  v_currency text;
  v_result jsonb;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id, 'viewer'::public.membership_role, false
  );
  if not app_private.catalog_filter_valid(p_filters)
    or v_query is not null and char_length(v_query) not between 2 and 200
  then raise exception using errcode = '22023', message = 'talence_collection_filter_invalid'; end if;
  v_currency := app_private.current_catalog_currency(p_currency);

  with valued as materialized (
    select row.* from app_private.collection_filtered_valued_rows(
      p_collection_id, v_currency, v_query, p_filters
    ) as row
  ), summary as (
    select
      coalesce(sum(quantity), 0) as quantity_total,
      coalesce(sum(quantity) filter (where price_amount is not null), 0) as priced_quantity,
      coalesce(sum(quantity) filter (where price_amount is null), 0) as unpriced_quantity,
      coalesce(sum(quantity) filter (where price_amount is not null and price_is_stale), 0)
        as stale_quantity,
      case when count(*) filter (where price_amount is not null) = 0 then null
        else round(sum(price_amount * quantity) filter (where price_amount is not null), 4)::text end
        as estimated_value,
      coalesce(array_agg(distinct price_provider order by price_provider)
        filter (where price_provider is not null), '{}'::text[]) as price_providers,
      min(price_observed_at) as oldest_price_observed_at,
      max(price_observed_at) as latest_price_observed_at,
      min(price_ingested_at) as oldest_price_ingested_at,
      max(price_ingested_at) as latest_price_ingested_at
    from valued
  ), dimension_rows as (
    select 'sets'::text as dimension, set_code as sort_key,
      jsonb_build_object('set_id', set_id, 'set_code', set_code, 'set_name', set_name) as group_key,
      valued.* from valued
    union all select 'colors', array_to_string(colors, ''), jsonb_build_object('colors', colors), valued.* from valued
    union all select 'color_identities', array_to_string(color_identity, ''),
      jsonb_build_object('color_identity', color_identity), valued.* from valued
    union all select 'rarities', coalesce(rarity, ''), jsonb_build_object('rarity', rarity), valued.* from valued
    union all select 'finishes', finish::text, jsonb_build_object('finish', finish), valued.* from valued
    union all select 'conditions', condition::text, jsonb_build_object('condition', condition), valued.* from valued
    union all select 'value_tiers', case
        when price_amount is null then 'unpriced'
        when price_amount < 1 then 'under_1'
        when price_amount < 5 then '1_to_5'
        when price_amount < 25 then '5_to_25'
        else '25_plus' end,
      jsonb_build_object('value_tier', case
        when price_amount is null then 'unpriced'
        when price_amount < 1 then 'under_1'
        when price_amount < 5 then '1_to_5'
        when price_amount < 25 then '5_to_25'
        else '25_plus' end), valued.* from valued
  ), grouped as (
    select dimension, sort_key, group_key,
      sum(quantity) as quantity_total,
      coalesce(sum(quantity) filter (where price_amount is not null), 0) as priced_quantity,
      coalesce(sum(quantity) filter (where price_amount is null), 0) as unpriced_quantity,
      coalesce(sum(quantity) filter (where price_amount is not null and price_is_stale), 0)
        as stale_quantity,
      case when count(*) filter (where price_amount is not null) = 0 then null
        else round(sum(price_amount * quantity) filter (where price_amount is not null), 4)::text end
        as estimated_value,
      coalesce(array_agg(distinct price_provider order by price_provider)
        filter (where price_provider is not null), '{}'::text[]) as price_providers,
      min(price_observed_at) as oldest_price_observed_at,
      max(price_observed_at) as latest_price_observed_at,
      min(price_ingested_at) as oldest_price_ingested_at,
      max(price_ingested_at) as latest_price_ingested_at
    from dimension_rows group by dimension, sort_key, group_key
  ), group_map as (
    select dimension, jsonb_agg(group_key || jsonb_build_object(
      'quantity_total', quantity_total, 'priced_quantity', priced_quantity,
      'unpriced_quantity', unpriced_quantity, 'stale_quantity', stale_quantity,
      'estimated_value', estimated_value, 'price_providers', price_providers,
      'oldest_price_observed_at', oldest_price_observed_at,
      'latest_price_observed_at', latest_price_observed_at,
      'oldest_price_ingested_at', oldest_price_ingested_at,
      'latest_price_ingested_at', latest_price_ingested_at
    ) order by sort_key, group_key) as items
    from grouped group by dimension
  ), groups as (
    select coalesce(jsonb_object_agg(dimension, items), '{}'::jsonb) as value from group_map
  )
  select jsonb_build_object(
    'collection_id', p_collection_id, 'currency', v_currency,
    'filters', jsonb_build_object('query', v_query, 'expression', p_filters),
    'quantity_total', summary.quantity_total,
    'priced_quantity', summary.priced_quantity,
    'unpriced_quantity', summary.unpriced_quantity,
    'stale_quantity', summary.stale_quantity,
    'estimated_value', summary.estimated_value,
    'price_providers', summary.price_providers,
    'oldest_price_observed_at', summary.oldest_price_observed_at,
    'latest_price_observed_at', summary.latest_price_observed_at,
    'oldest_price_ingested_at', summary.oldest_price_ingested_at,
    'latest_price_ingested_at', summary.latest_price_ingested_at,
    'groups', jsonb_build_object(
      'sets', coalesce(groups.value -> 'sets', '[]'::jsonb),
      'colors', coalesce(groups.value -> 'colors', '[]'::jsonb),
      'color_identities', coalesce(groups.value -> 'color_identities', '[]'::jsonb),
      'rarities', coalesce(groups.value -> 'rarities', '[]'::jsonb),
      'finishes', coalesce(groups.value -> 'finishes', '[]'::jsonb),
      'conditions', coalesce(groups.value -> 'conditions', '[]'::jsonb),
      'value_tiers', coalesce(groups.value -> 'value_tiers', '[]'::jsonb)
    )
  ) into v_result from summary cross join groups;
  return v_result;
end;
$$;

revoke all on function app_private.collection_filtered_valued_rows(
  uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.collection_inventory_filter_page(
  uuid, text, jsonb, text, text, integer, text
) from public, anon, service_role;
grant execute on function public.collection_inventory_filter_page(
  uuid, text, jsonb, text, text, integer, text
) to authenticated;
revoke all on function public.collection_filter_analytics(uuid, text, jsonb, text)
  from public, anon, service_role;
grant execute on function public.collection_filter_analytics(uuid, text, jsonb, text)
  to authenticated;

comment on function public.collection_inventory_filter_page(
  uuid, text, jsonb, text, text, integer, text
) is 'Filters owned printing/finish/condition/quantity rows with the shared validated expression.';
