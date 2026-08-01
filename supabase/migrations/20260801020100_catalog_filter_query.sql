-- Validated JSON filter trees and catalog-side query/facet contracts.

create function app_private.catalog_filter_contains_field(p_node jsonb, p_field text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when jsonb_typeof(p_node -> 'children') = 'array' then exists (
      select 1
      from jsonb_array_elements(p_node -> 'children') as child(node)
      where app_private.catalog_filter_contains_field(child.node, p_field)
    )
    else p_node ->> 'field' = p_field
  end
$$;

create function app_private.catalog_filter_valid(p_node jsonb, p_depth integer default 0)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_child jsonb;
  v_field text;
  v_comparator text;
  v_value jsonb;
begin
  if p_node is null or jsonb_typeof(p_node) <> 'object' then return false; end if;
  if p_node ? 'children' then
    if p_depth > 2
      or p_node ->> 'operator' not in ('and', 'or')
      or jsonb_typeof(p_node -> 'children') <> 'array'
      or jsonb_array_length(p_node -> 'children') > 50
      or p_node ? 'negated' and jsonb_typeof(p_node -> 'negated') <> 'boolean'
    then return false; end if;
    for v_child in select value from jsonb_array_elements(p_node -> 'children') loop
      if not app_private.catalog_filter_valid(v_child, p_depth + 1) then return false; end if;
    end loop;
    return true;
  end if;

  v_field := p_node ->> 'field';
  v_comparator := p_node ->> 'comparator';
  v_value := p_node -> 'value';
  if p_node ? 'negated' and jsonb_typeof(p_node -> 'negated') <> 'boolean' then
    return false;
  end if;
  if v_field not in (
    'set', 'language', 'cardColor', 'colorIdentity', 'supertype', 'cardType',
    'subtype', 'manaValue', 'power', 'toughness', 'loyalty', 'legality',
    'artist', 'keyword', 'rulesText', 'rarity', 'finish', 'releasedAt',
    'digital', 'defaultObject', 'condition', 'ownedQuantity'
  ) then return false; end if;
  if v_comparator not in (
    'is', 'isNot', 'any', 'all', 'exactly', 'excludes', 'between',
    'contains', 'doesNotContain', 'exactPhrase'
  ) then return false; end if;
  if v_field in (
    'set', 'language', 'cardColor', 'colorIdentity', 'supertype', 'cardType',
    'subtype', 'artist', 'keyword', 'rarity', 'finish', 'condition'
  ) then
    return v_comparator in ('is', 'isNot', 'any', 'all', 'exactly', 'excludes')
      and jsonb_typeof(v_value) = 'array'
      and jsonb_array_length(v_value) between 1 and 50
      and not exists (
        select 1 from jsonb_array_elements(v_value) as item(value)
        where jsonb_typeof(item.value) <> 'string'
          or char_length(item.value #>> '{}') not between 1 and 200
      );
  elsif v_field in ('manaValue', 'power', 'toughness', 'loyalty', 'releasedAt', 'ownedQuantity') then
    return v_comparator = 'between'
      and jsonb_typeof(v_value) = 'object'
      and (not v_value ? 'min' or jsonb_typeof(v_value -> 'min') in ('number', 'null'))
      and (not v_value ? 'max' or jsonb_typeof(v_value -> 'max') in ('number', 'null'));
  elsif v_field in ('digital', 'defaultObject') then
    return v_comparator in ('is', 'isNot') and jsonb_typeof(v_value) = 'boolean';
  elsif v_field = 'rulesText' then
    return v_comparator in ('contains', 'doesNotContain', 'exactPhrase')
      and jsonb_typeof(v_value) = 'string'
      and char_length(v_value #>> '{}') between 1 and 200;
  elsif v_field = 'legality' then
    return v_comparator in ('is', 'isNot')
      and jsonb_typeof(v_value) = 'object'
      and v_value ->> 'state' in ('legal', 'restricted', 'banned', 'not_legal')
      and jsonb_typeof(v_value -> 'formats') = 'array'
      and jsonb_array_length(v_value -> 'formats') between 1 and 50;
  end if;
  return false;
end;
$$;

create function app_private.catalog_filter_array_matches(
  p_actual text[], p_comparator text, p_selected text[]
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_comparator
    when 'is' then coalesce(p_actual, '{}'::text[]) && p_selected
    when 'any' then coalesce(p_actual, '{}'::text[]) && p_selected
    when 'isNot' then not (coalesce(p_actual, '{}'::text[]) && p_selected)
    when 'excludes' then not (coalesce(p_actual, '{}'::text[]) && p_selected)
    when 'all' then coalesce(p_actual, '{}'::text[]) @> p_selected
    when 'exactly' then coalesce(p_actual, '{}'::text[]) @> p_selected
      and p_selected @> coalesce(p_actual, '{}'::text[])
    else false
  end
$$;

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
  v_min numeric;
  v_max numeric;
  v_bool boolean;
  v_result boolean := false;
  v_text text;
begin
  if jsonb_typeof(v_value) = 'array' then
    select array_agg(value order by value) into v_selected
    from jsonb_array_elements_text(v_value) as value;
  end if;

  if v_field = 'set' then
    select array[upper(catalog_set.code)] into v_actual
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set on catalog_set.id = printing.set_id
    where printing.id = p_printing_id;
    v_selected := array(select upper(value) from unnest(v_selected) as value);
    return app_private.catalog_filter_array_matches(v_actual, v_comparator, v_selected);
  elsif v_field = 'language' then
    select array[lower(printing.language)] into v_actual
    from public.catalog_printings as printing where printing.id = p_printing_id;
  elsif v_field = 'rarity' then
    select array[lower(printing.rarity)] into v_actual
    from public.catalog_printings as printing where printing.id = p_printing_id;
  elsif v_field = 'finish' then
    if p_owned_finish is not null then v_actual := array[p_owned_finish::text];
    else select printing.finishes::text[] into v_actual
      from public.catalog_printings as printing where printing.id = p_printing_id;
    end if;
  elsif v_field = 'condition' then
    if p_condition is null then return false; end if;
    v_actual := array[p_condition::text];
  elsif v_field in ('cardColor', 'colorIdentity') then
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
    if 'C' = any(v_selected) then
      v_selected := array_remove(v_selected, 'C');
      if v_comparator = 'any' then
        return cardinality(v_actual) = 0
          or v_actual && v_selected;
      elsif v_comparator = 'all' or v_comparator = 'exactly' then
        return cardinality(v_selected) = 0 and cardinality(v_actual) = 0;
      elsif v_comparator = 'excludes' then
        return cardinality(v_actual) > 0 and not (v_actual && v_selected);
      end if;
    end if;
  elsif v_field in ('supertype', 'cardType', 'subtype') then
    select case v_field
      when 'supertype' then card.supertypes
      when 'cardType' then card.card_types
      else card.subtypes
    end into v_actual
    from public.catalog_cards as card where card.id = p_card_id;
    if v_actual is null or cardinality(v_actual) = 0 then
      select coalesce(array_agg(distinct value order by value), '{}'::text[])
      into v_actual
      from public.catalog_faces as face
      cross join lateral unnest(case v_field
        when 'supertype' then face.supertypes
        when 'cardType' then face.card_types
        else face.subtypes
      end) as value
      where face.printing_id = p_printing_id;
    end if;
  elsif v_field = 'artist' then
    select printing.artists into v_actual
    from public.catalog_printings as printing where printing.id = p_printing_id;
  elsif v_field = 'keyword' then
    select card.keywords into v_actual from public.catalog_cards as card where card.id = p_card_id;
  elsif v_field in ('language', 'rarity', 'finish', 'condition') then
    null;
  elsif v_field = 'manaValue' then
    v_min := nullif(v_value ->> 'min', '')::numeric;
    v_max := nullif(v_value ->> 'max', '')::numeric;
    return exists (
      select 1 from public.catalog_cards as card
      where card.id = p_card_id
        and (v_min is null or card.mana_value >= v_min)
        and (v_max is null or card.mana_value <= v_max)
    );
  elsif v_field in ('power', 'toughness', 'loyalty') then
    v_min := nullif(v_value ->> 'min', '')::numeric;
    v_max := nullif(v_value ->> 'max', '')::numeric;
    v_bool := coalesce((v_value ->> 'includeVariable')::boolean, false);
    return exists (
      select 1 from public.catalog_faces as face
      where face.printing_id = p_printing_id
        and (
          (
            case v_field when 'power' then face.power_numeric
              when 'toughness' then face.toughness_numeric else face.loyalty_numeric end is not null
            and (v_min is null or case v_field when 'power' then face.power_numeric
              when 'toughness' then face.toughness_numeric else face.loyalty_numeric end >= v_min)
            and (v_max is null or case v_field when 'power' then face.power_numeric
              when 'toughness' then face.toughness_numeric else face.loyalty_numeric end <= v_max)
          )
          or v_bool and case v_field when 'power' then face.power
            when 'toughness' then face.toughness else face.loyalty end is not null
            and case v_field when 'power' then face.power_numeric
              when 'toughness' then face.toughness_numeric else face.loyalty_numeric end is null
        )
    );
  elsif v_field = 'legality' then
    select bool_and(exists (
      select 1
      from public.catalog_legalities as legality
      where legality.card_id = p_card_id
        and legality.legality = v_value ->> 'state'
        and legality.format_code = lower(format_code)
    )) into v_result
    from jsonb_array_elements_text(v_value -> 'formats') as format_code;
    return case when v_comparator = 'isNot' then not v_result else v_result end;
  elsif v_field = 'rulesText' then
    select regexp_replace(coalesce(card.oracle_text, string_agg(face.oracle_text, E'\n')), '\s+', ' ', 'g')
    into v_text
    from public.catalog_printings as printing
    left join public.catalog_cards as card on card.id = printing.card_id
    left join public.catalog_faces as face on face.printing_id = printing.id
    where printing.id = p_printing_id
    group by card.oracle_text;
    v_text := lower(coalesce(v_text, ''));
    if v_comparator = 'contains' then
      select bool_and(v_text like '%' || app_private.catalog_escape_like(lower(term)) || '%' escape E'\\')
      into v_result from regexp_split_to_table(v_value #>> '{}', '\s+') as term;
    else
      v_result := v_text like '%' || app_private.catalog_escape_like(
        lower(regexp_replace(v_value #>> '{}', '\s+', ' ', 'g'))
      ) || '%' escape E'\\';
      if v_comparator = 'doesNotContain' then v_result := not v_result; end if;
    end if;
    return coalesce(v_result, false);
  elsif v_field = 'releasedAt' then
    v_min := nullif(v_value ->> 'min', '')::numeric;
    v_max := nullif(v_value ->> 'max', '')::numeric;
    return exists (
      select 1 from public.catalog_printings as printing
      where printing.id = p_printing_id
        and (v_min is null or printing.released_at >= (to_timestamp(v_min / 1000) at time zone 'UTC')::date)
        and (v_max is null or printing.released_at <= (to_timestamp(v_max / 1000) at time zone 'UTC')::date)
    );
  elsif v_field = 'digital' then
    select printing.digital into v_bool from public.catalog_printings as printing
    where printing.id = p_printing_id;
    v_result := v_bool = (v_value #>> '{}')::boolean;
    return case when v_comparator = 'isNot' then not v_result else v_result end;
  elsif v_field = 'defaultObject' then
    select printing.is_default_browse into v_bool from public.catalog_printings as printing
    where printing.id = p_printing_id;
    v_result := v_bool = (v_value #>> '{}')::boolean;
    return case when v_comparator = 'isNot' then not v_result else v_result end;
  elsif v_field = 'ownedQuantity' then
    if p_quantity is null then return false; end if;
    v_min := nullif(v_value ->> 'min', '')::numeric;
    v_max := nullif(v_value ->> 'max', '')::numeric;
    return (v_min is null or p_quantity >= v_min) and (v_max is null or p_quantity <= v_max);
  else
    return false;
  end if;

  v_selected := array(select lower(value) from unnest(v_selected) as value);
  v_actual := array(select lower(value) from unnest(coalesce(v_actual, '{}'::text[])) as value);
  return app_private.catalog_filter_array_matches(v_actual, v_comparator, v_selected);
end;
$$;

create function app_private.catalog_filter_matches(
  p_node jsonb,
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
  v_child jsonb;
  v_result boolean;
begin
  if p_node ? 'children' then
    v_result := p_node ->> 'operator' = 'and';
    for v_child in select value from jsonb_array_elements(p_node -> 'children') loop
      if p_node ->> 'operator' = 'and' then
        v_result := v_result and app_private.catalog_filter_matches(
          v_child, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity
        );
      else
        v_result := v_result or app_private.catalog_filter_matches(
          v_child, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity
        );
      end if;
    end loop;
    if coalesce((p_node ->> 'negated')::boolean, false) then v_result := not v_result; end if;
    return v_result;
  end if;
  v_result := app_private.catalog_filter_rule_matches(
    p_node, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity
  );
  return case when coalesce((p_node ->> 'negated')::boolean, false)
    then not v_result else v_result end;
end;
$$;

create function app_private.catalog_filtered_keys(
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
language sql
stable
security definer
set search_path = pg_catalog
as $$
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
      and (
        app_private.catalog_filter_contains_field(p_filters, 'language')
        or printing.language = 'en'
      )
      and (
        p_query is null or printing.id in (
          select match.printing_id from app_private.catalog_query_matching_printings(p_query) as match
        )
      )
      and app_private.catalog_filter_matches(p_filters, printing.id, printing.card_id)
  )
  select printing_id, sort_name, sort_release, set_code, collector_number, sort_price
  from eligible
  where p_return_all_variants or representative_rank = 1
$$;

create function public.catalog_filter_search(
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
      when 'newest' then (-extract(epoch from key_row.sort_release), key_row.sort_name,
        key_row.set_code, key_row.collector_number, key_row.printing_id::text)
        > (-extract(epoch from v_cursor_release), v_cursor_name,
          v_cursor_set, v_cursor_collector, v_cursor_id::text)
      when 'price_asc' then (
        (key_row.sort_price is null)::integer, coalesce(key_row.sort_price, 0),
        key_row.sort_name, key_row.set_code, key_row.collector_number, key_row.printing_id::text
      ) > (
        (v_cursor_price is null)::integer, coalesce(v_cursor_price, 0),
        v_cursor_name, v_cursor_set, v_cursor_collector, v_cursor_id::text
      )
      when 'price_desc' then (
        (key_row.sort_price is null)::integer, -coalesce(key_row.sort_price, 0),
        key_row.sort_name, key_row.set_code, key_row.collector_number, key_row.printing_id::text
      ) > (
        (v_cursor_price is null)::integer, -coalesce(v_cursor_price, 0),
        v_cursor_name, v_cursor_set, v_cursor_collector, v_cursor_id::text
      )
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

revoke all on function app_private.catalog_filter_contains_field(jsonb, text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_filter_valid(jsonb, integer)
  from public, anon, authenticated;
revoke all on function app_private.catalog_filter_array_matches(text[], text, text[])
  from public, anon, authenticated;
revoke all on function app_private.catalog_filter_rule_matches(
  jsonb, uuid, uuid, public.card_finish, public.card_condition, integer
) from public, anon, authenticated;
revoke all on function app_private.catalog_filter_matches(
  jsonb, uuid, uuid, public.card_finish, public.card_condition, integer
) from public, anon, authenticated;
revoke all on function app_private.catalog_filtered_keys(
  text, jsonb, text, text, boolean, boolean, boolean
) from public, anon, authenticated;
revoke all on function public.catalog_filter_search(
  text, jsonb, text, text, boolean, boolean, boolean, text, text, integer
) from public, anon, service_role;
grant execute on function public.catalog_filter_search(
  text, jsonb, text, text, boolean, boolean, boolean, text, text, integer
) to authenticated;

comment on function public.catalog_filter_search(
  text, jsonb, text, text, boolean, boolean, boolean, text, text, integer
) is 'Validates and evaluates the shared catalog/collection filter tree before representative-printing selection.';

create function public.catalog_filter_price_floors(
  p_card_ids uuid[],
  p_filters jsonb default '{"id":"root","operator":"and","children":[]}'::jsonb,
  p_currency text default null,
  p_include_digital boolean default false,
  p_include_nondefault boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
  v_result jsonb;
begin
  perform app_private.assert_catalog_reader();
  if cardinality(p_card_ids) not between 1 and 100
    or not app_private.catalog_filter_valid(p_filters)
  then raise exception using errcode = '22023', message = 'talence_catalog_filter_invalid'; end if;
  v_currency := app_private.current_catalog_currency(p_currency);
  with eligible as materialized (
    select printing.id, printing.card_id
    from public.catalog_printings as printing
    where printing.active and printing.card_id = any(p_card_ids)
      and (p_include_digital or not printing.digital)
      and (p_include_nondefault or printing.is_default_browse)
      and (app_private.catalog_filter_contains_field(p_filters, 'language') or printing.language = 'en')
      and app_private.catalog_filter_matches(p_filters, printing.id, printing.card_id)
  ), ranked as (
    select eligible.card_id, price.finish, price.provider, price.currency, price.amount,
      price.observed_at, price.ingested_at, price.stale_after,
      row_number() over (
        partition by eligible.card_id, price.finish
        order by price.amount, case price.provider when 'scryfall' then 1 else 2 end, price.provider
      ) as price_rank
    from eligible join public.current_prices as price on price.printing_id = eligible.id
    where price.currency = v_currency and price.finish in ('nonfoil', 'foil')
  ), per_card as (
    select card_id, jsonb_object_agg(finish::text, jsonb_build_object(
      'provider', provider, 'currency', currency, 'finish', finish,
      'amount', amount::text, 'observed_at', observed_at, 'ingested_at', ingested_at,
      'stale_after', stale_after, 'is_stale', stale_after is not null and stale_after <= statement_timestamp()
    )) as prices
    from ranked where price_rank = 1 group by card_id
  )
  select coalesce(jsonb_object_agg(card_id::text, jsonb_build_object(
    'nonfoil', prices -> 'nonfoil', 'foil', prices -> 'foil'
  )), '{}'::jsonb) into v_result from per_card;
  return v_result;
end;
$$;

revoke all on function public.catalog_filter_price_floors(uuid[], jsonb, text, boolean, boolean)
  from public, anon, service_role;
grant execute on function public.catalog_filter_price_floors(uuid[], jsonb, text, boolean, boolean)
  to authenticated;
