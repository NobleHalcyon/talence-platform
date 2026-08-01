-- Harden the shared filter evaluator after populated-catalog query-plan review.
-- This migration changes functions only; it does not mutate catalog or auth rows.

alter function app_private.catalog_filter_rule_matches(
  jsonb, uuid, uuid, public.card_finish, public.card_condition, integer
) rename to catalog_filter_rule_matches_pre_hardening;

create function app_private.catalog_filter_rule_matches(
  p_rule jsonb,
  p_printing_id uuid,
  p_card_id uuid,
  p_owned_finish public.card_finish default null,
  p_condition public.card_condition default null,
  p_quantity integer default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_field text := p_rule ->> 'field';
  v_comparator text := p_rule ->> 'comparator';
  v_selected text[];
  v_actual text[];
  v_value jsonb := p_rule -> 'value';
  v_result boolean;
begin
  if v_field in ('cardColor', 'colorIdentity') then
    select array_agg(upper(value) order by upper(value))
    into v_selected
    from jsonb_array_elements_text(v_value) as value;

    if v_field = 'cardColor' then
      select case
        when card.id is not null and cardinality(card.colors) > 0 then card.colors
        else coalesce((
          select array_agg(distinct color order by color)
          from public.catalog_faces as face
          cross join lateral unnest(face.colors) as color
          where face.printing_id = p_printing_id
        ), '{}'::text[])
      end into v_actual
      from public.catalog_printings as printing
      left join public.catalog_cards as card on card.id = printing.card_id
      where printing.id = p_printing_id;
    else
      select case when card.id is not null then card.color_identity else printing.color_identity end
      into v_actual
      from public.catalog_printings as printing
      left join public.catalog_cards as card on card.id = printing.card_id
      where printing.id = p_printing_id;
    end if;

    v_actual := array(select upper(value) from unnest(coalesce(v_actual, '{}'::text[])) as value);
    if 'C' = any(v_selected) then
      v_selected := array_remove(v_selected, 'C');
      if v_comparator = 'any' then
        return cardinality(v_actual) = 0 or v_actual && v_selected;
      elsif v_comparator in ('all', 'exactly') then
        return cardinality(v_selected) = 0 and cardinality(v_actual) = 0;
      elsif v_comparator = 'excludes' then
        return cardinality(v_actual) > 0 and not (v_actual && v_selected);
      end if;
    end if;
    return app_private.catalog_filter_array_matches(v_actual, v_comparator, v_selected);
  end if;

  if v_field = 'legality' then
    select bool_and(exists (
      select 1
      from public.catalog_legalities as legality
      where legality.card_id = p_card_id
        and legality.legality = v_value ->> 'state'
        and legality.format_code = lower(format_code)
    )) into v_result
    from jsonb_array_elements_text(v_value -> 'formats') as format_code;
    v_result := coalesce(v_result, false);
    return case when v_comparator = 'isNot' then not v_result else v_result end;
  end if;

  return app_private.catalog_filter_rule_matches_pre_hardening(
    p_rule, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity
  );
end;
$$;

revoke all on function app_private.catalog_filter_rule_matches_pre_hardening(
  jsonb, uuid, uuid, public.card_finish, public.card_condition, integer
) from public, anon, authenticated;
revoke all on function app_private.catalog_filter_rule_matches(
  jsonb, uuid, uuid, public.card_finish, public.card_condition, integer
) from public, anon, authenticated;

create or replace function app_private.catalog_filtered_keys(
  p_query text,
  p_filters jsonb,
  p_game_code text,
  p_currency text,
  p_include_digital boolean,
  p_include_nondefault boolean,
  p_return_all_variants boolean
)
returns table (
  printing_id uuid,
  sort_name text,
  sort_release date,
  set_code text,
  collector_number text,
  sort_price numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if jsonb_array_length(p_filters -> 'children') = 0 then
    return query
    select key_row.*
    from app_private.catalog_search_mode_keys(
      p_query, p_game_code, null, 'en', null, null, null, null, null, null,
      p_currency, null, null, null, null, p_include_digital,
      p_include_nondefault, p_return_all_variants
    ) as key_row;
    return;
  end if;

  return query
  with eligible as materialized (
    select
      printing.id as printing_id,
      printing.card_id,
      coalesce(card.normalized_name, printing.normalized_name, first_face.normalized_name) as sort_name,
      coalesce(printing.released_at, date '0001-01-01') as sort_release,
      catalog_set.code as set_code,
      printing.collector_number,
      best_price.amount as sort_price,
      row_number() over (
        partition by coalesce(printing.card_id, printing.id)
        order by printing.is_default_browse desc, printing.released_at desc nulls last,
          printing.variation, printing.promo, printing.id
      ) as representative_rank
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set on catalog_set.id = printing.set_id and catalog_set.active
    join public.games as game on game.id = printing.game_id and game.active
    left join public.catalog_cards as card on card.id = printing.card_id
    left join lateral (
      select face.normalized_name from public.catalog_faces as face
      where face.printing_id = printing.id order by face.face_index limit 1
    ) as first_face on true
    left join lateral (
      select price.amount from public.current_prices as price
      where price.printing_id = printing.id and price.currency = p_currency
      order by price.amount, price.provider limit 1
    ) as best_price on true
    where printing.active and (card.id is null or card.active)
      and game.code = p_game_code
      and (p_include_digital or not printing.digital)
      and (p_include_nondefault or printing.is_default_browse)
      and (app_private.catalog_filter_contains_field(p_filters, 'language') or printing.language = 'en')
      and (
        p_query is null or printing.id in (
          select match.printing_id from app_private.catalog_query_matching_printings(p_query) as match
        )
      )
      and app_private.catalog_filter_matches(p_filters, printing.id, printing.card_id)
  )
  select eligible.printing_id, eligible.sort_name, eligible.sort_release,
    eligible.set_code, eligible.collector_number, eligible.sort_price
  from eligible
  where p_return_all_variants or eligible.representative_rank = 1;
end;
$$;

revoke all on function app_private.catalog_filtered_keys(
  text, jsonb, text, text, boolean, boolean, boolean
) from public, anon, authenticated;

create or replace function public.catalog_filter_search(
  p_query text default null,
  p_filters jsonb default '{"id":"root","operator":"and","children":[]}'::jsonb,
  p_game_code text default 'mtg',
  p_currency text default null,
  p_include_digital boolean default false,
  p_include_nondefault boolean default false,
  p_return_all_variants boolean default false,
  p_sort text default 'name',
  p_after text default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_game_code text := lower(nullif(btrim(p_game_code), ''));
  v_sort text := lower(nullif(btrim(p_sort), ''));
  v_currency text;
  v_scope text;
  v_catalog_version text;
  v_search_index_version text;
  v_cursor jsonb;
  v_cursor_id uuid;
  v_cursor_name text;
  v_cursor_release date;
  v_cursor_set text;
  v_cursor_collector text;
  v_cursor_price numeric;
  v_total_count bigint;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_id uuid;
  v_row record;
begin
  perform app_private.assert_catalog_reader();
  if not app_private.catalog_filter_valid(p_filters)
    or v_game_code !~ '^[a-z0-9][a-z0-9_-]{1,31}$'
    or v_sort not in ('name', 'newest', 'price_asc', 'price_desc')
    or p_limit not between 1 and 100
    or v_query is not null and char_length(v_query) not between 2 and 200
  then raise exception using errcode = '22023', message = 'talence_catalog_filter_invalid'; end if;

  v_currency := app_private.current_catalog_currency(p_currency);
  select active_catalog_version, current_search_index_version
  into v_catalog_version, v_search_index_version
  from public.catalog_state where singleton_id = 1;
  v_scope := md5(jsonb_build_object(
    'query', v_query, 'filters', p_filters, 'game', v_game_code, 'currency', v_currency,
    'digital', p_include_digital, 'nondefault', p_include_nondefault,
    'variants', p_return_all_variants, 'sort', v_sort,
    'catalog', v_catalog_version, 'search', v_search_index_version
  )::text);

  if p_after is not null then
    v_cursor := app_private.catalog_decode_cursor(p_after);
    begin v_cursor_id := (v_cursor ->> 'id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'talence_catalog_cursor_invalid';
    end;
    if v_cursor ->> 'v' <> '2' or v_cursor ->> 'scope' is distinct from v_scope then
      raise exception using errcode = '22023', message = 'talence_catalog_cursor_invalid';
    end if;
    select sort_name, sort_release, set_code, collector_number, sort_price
    into v_cursor_name, v_cursor_release, v_cursor_set, v_cursor_collector, v_cursor_price
    from app_private.catalog_filtered_keys(
      v_query, p_filters, v_game_code, v_currency, p_include_digital,
      p_include_nondefault, p_return_all_variants
    ) where printing_id = v_cursor_id;
    if not found then raise exception using errcode = '22023', message = 'talence_catalog_cursor_invalid'; end if;
  end if;

  select count(*) into v_total_count
  from app_private.catalog_filtered_keys(
    v_query, p_filters, v_game_code, v_currency, p_include_digital,
    p_include_nondefault, p_return_all_variants
  );

  for v_row in
    select key_row.*
    from app_private.catalog_filtered_keys(
      v_query, p_filters, v_game_code, v_currency, p_include_digital,
      p_include_nondefault, p_return_all_variants
    ) as key_row
    where p_after is null or case v_sort
      when 'name' then key_row.sort_name > v_cursor_name
        or key_row.sort_name = v_cursor_name and key_row.sort_release < v_cursor_release
        or key_row.sort_name = v_cursor_name and key_row.sort_release = v_cursor_release
          and key_row.set_code > v_cursor_set
        or key_row.sort_name = v_cursor_name and key_row.sort_release = v_cursor_release
          and key_row.set_code = v_cursor_set and key_row.collector_number > v_cursor_collector
        or key_row.sort_name = v_cursor_name and key_row.sort_release = v_cursor_release
          and key_row.set_code = v_cursor_set and key_row.collector_number = v_cursor_collector
          and key_row.printing_id > v_cursor_id
      when 'newest' then key_row.sort_release < v_cursor_release
        or key_row.sort_release = v_cursor_release and key_row.sort_name > v_cursor_name
        or key_row.sort_release = v_cursor_release and key_row.sort_name = v_cursor_name
          and key_row.set_code > v_cursor_set
        or key_row.sort_release = v_cursor_release and key_row.sort_name = v_cursor_name
          and key_row.set_code = v_cursor_set and key_row.collector_number > v_cursor_collector
        or key_row.sort_release = v_cursor_release and key_row.sort_name = v_cursor_name
          and key_row.set_code = v_cursor_set and key_row.collector_number = v_cursor_collector
          and key_row.printing_id > v_cursor_id
      when 'price_asc' then case when v_cursor_price is null then
        key_row.sort_price is null and (key_row.sort_name, key_row.set_code,
          key_row.collector_number, key_row.printing_id)
          > (v_cursor_name, v_cursor_set, v_cursor_collector, v_cursor_id)
        else key_row.sort_price is null or key_row.sort_price > v_cursor_price
          or key_row.sort_price = v_cursor_price and (key_row.sort_name, key_row.set_code,
            key_row.collector_number, key_row.printing_id)
            > (v_cursor_name, v_cursor_set, v_cursor_collector, v_cursor_id) end
      when 'price_desc' then case when v_cursor_price is null then
        key_row.sort_price is null and (key_row.sort_name, key_row.set_code,
          key_row.collector_number, key_row.printing_id)
          > (v_cursor_name, v_cursor_set, v_cursor_collector, v_cursor_id)
        else key_row.sort_price is null or key_row.sort_price < v_cursor_price
          or key_row.sort_price = v_cursor_price and (key_row.sort_name, key_row.set_code,
            key_row.collector_number, key_row.printing_id)
            > (v_cursor_name, v_cursor_set, v_cursor_collector, v_cursor_id) end
    end
    order by
      case when v_sort = 'name' then key_row.sort_name end,
      case when v_sort = 'name' then key_row.sort_release end desc,
      case when v_sort = 'newest' then key_row.sort_release end desc,
      case when v_sort = 'newest' then key_row.sort_name end,
      case when v_sort = 'price_asc' then key_row.sort_price end asc nulls last,
      case when v_sort = 'price_desc' then key_row.sort_price end desc nulls last,
      case when v_sort in ('price_asc', 'price_desc') then key_row.sort_name end,
      key_row.set_code, key_row.collector_number, key_row.printing_id
    limit p_limit + 1
  loop
    if v_count = p_limit then v_has_more := true; exit; end if;
    v_items := v_items || jsonb_build_array(
      app_private.catalog_printing_to_json(v_row.printing_id, v_currency, null)
    );
    v_count := v_count + 1;
    v_last_id := v_row.printing_id;
  end loop;

  return jsonb_build_object(
    'items', v_items, 'total_count', v_total_count, 'result_count', v_count,
    'next_cursor', case when v_has_more then app_private.catalog_encode_cursor(
      jsonb_build_object('v', 2, 'scope', v_scope, 'id', v_last_id)
    ) else null end,
    'currency', v_currency, 'sort', v_sort, 'limit', p_limit,
    'return_all_variants', p_return_all_variants,
    'catalog', app_private.catalog_context_json()
  );
end;
$$;

revoke all on function public.catalog_filter_search(
  text, jsonb, text, text, boolean, boolean, boolean, text, text, integer
) from public, anon, service_role;
grant execute on function public.catalog_filter_search(
  text, jsonb, text, text, boolean, boolean, boolean, text, text, integer
) to authenticated;
