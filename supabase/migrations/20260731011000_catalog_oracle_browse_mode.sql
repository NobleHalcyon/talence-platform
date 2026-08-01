-- Catalog browse defaults to one deterministic representative printing per
-- Oracle card. Callers may explicitly request every eligible printing.

create function app_private.catalog_search_mode_keys(
  p_query text,
  p_game_code text,
  p_set_code text,
  p_language text,
  p_rarity text,
  p_finish public.card_finish,
  p_colors text[],
  p_color_identity text[],
  p_type_line text,
  p_has_price boolean,
  p_currency text,
  p_min_mana_value numeric,
  p_max_mana_value numeric,
  p_released_from date,
  p_released_to date,
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
  with ranked_candidates as materialized (
    select
      search_row.*,
      row_number() over (
        partition by coalesce(printing.card_id, printing.id)
        order by
          printing.is_default_browse desc,
          printing.released_at desc nulls last,
          printing.variation,
          printing.promo,
          printing.id
      ) as representative_rank
    from app_private.catalog_search_keys(
      p_query,
      p_game_code,
      p_set_code,
      p_language,
      p_rarity,
      p_finish,
      p_colors,
      p_color_identity,
      p_type_line,
      p_has_price,
      p_currency,
      p_min_mana_value,
      p_max_mana_value,
      p_released_from,
      p_released_to,
      p_include_digital,
      p_include_nondefault
    ) as search_row
    join public.catalog_printings as printing
      on printing.id = search_row.printing_id
  )
  select
    candidate.printing_id,
    candidate.sort_name,
    candidate.sort_release,
    candidate.set_code,
    candidate.collector_number,
    candidate.sort_price
  from ranked_candidates as candidate
  where coalesce(p_return_all_variants, false)
    or candidate.representative_rank = 1
$$;

revoke all on function app_private.catalog_search_mode_keys(
  text,
  text,
  text,
  text,
  text,
  public.card_finish,
  text[],
  text[],
  text,
  boolean,
  text,
  numeric,
  numeric,
  date,
  date,
  boolean,
  boolean,
  boolean
) from public, anon, authenticated;

drop function public.catalog_search(
  text,
  text,
  text,
  text,
  text,
  public.card_finish,
  text[],
  text[],
  text,
  boolean,
  text,
  numeric,
  numeric,
  date,
  date,
  boolean,
  boolean,
  text,
  text,
  integer
);

create function public.catalog_search(
  p_query text default null,
  p_game_code text default 'mtg',
  p_set_code text default null,
  p_language text default null,
  p_rarity text default null,
  p_finish public.card_finish default null,
  p_colors text[] default null,
  p_color_identity text[] default null,
  p_type_line text default null,
  p_has_price boolean default null,
  p_currency text default null,
  p_min_mana_value numeric default null,
  p_max_mana_value numeric default null,
  p_released_from date default null,
  p_released_to date default null,
  p_include_digital boolean default false,
  p_include_nondefault boolean default false,
  p_sort text default 'name',
  p_after text default null,
  p_limit integer default 40,
  p_return_all_variants boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_game_code text := lower(nullif(btrim(p_game_code), ''));
  v_set_code text := lower(nullif(btrim(p_set_code), ''));
  v_language text := lower(nullif(btrim(p_language), ''));
  v_rarity text := lower(nullif(btrim(p_rarity), ''));
  v_type_line text := nullif(btrim(p_type_line), '');
  v_colors text[];
  v_color_identity text[];
  v_currency text;
  v_sort text := lower(nullif(btrim(p_sort), ''));
  v_return_all_variants boolean := coalesce(p_return_all_variants, false);
  v_catalog_version text;
  v_search_index_version text;
  v_scope text;
  v_cursor jsonb;
  v_cursor_id uuid;
  v_cursor_name text;
  v_cursor_release date;
  v_cursor_set text;
  v_cursor_collector text;
  v_cursor_price numeric;
  v_total_count bigint;
  v_result_count integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_next_cursor text;
  v_has_more boolean := false;
  v_last_id uuid;
  v_row record;
begin
  perform app_private.assert_catalog_reader();

  if v_game_code is null
    or v_game_code !~ '^[a-z0-9][a-z0-9_-]{1,31}$'
    or p_limit is null
    or p_limit not between 1 and 100
    or v_sort not in ('name', 'newest', 'price_asc', 'price_desc')
    or v_query is not null
      and char_length(v_query) not between 2 and 200
    or v_set_code is not null
      and v_set_code !~ '^[a-z0-9][a-z0-9_-]{0,31}$'
    or v_language is not null
      and v_language !~ '^[a-z][a-z0-9_-]{1,15}$'
    or v_rarity is not null and char_length(v_rarity) > 64
    or v_type_line is not null and char_length(v_type_line) > 200
    or p_finish = 'unknown'::public.card_finish
    or p_min_mana_value is not null and p_min_mana_value < 0
    or p_max_mana_value is not null and p_max_mana_value < 0
    or p_min_mana_value is not null
      and p_max_mana_value is not null
      and p_min_mana_value > p_max_mana_value
    or p_released_from is not null
      and p_released_to is not null
      and p_released_from > p_released_to
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_search_arguments_invalid';
  end if;

  if p_colors is not null then
    if exists (
      select 1
      from unnest(p_colors) as raw_color
      where raw_color is null
        or upper(raw_color) not in ('W', 'U', 'B', 'R', 'G', 'C')
    ) then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_colors_invalid';
    end if;

    select array_agg(distinct upper(color_value) order by upper(color_value))
    into v_colors
    from unnest(p_colors) as color_value;
    if v_colors is null
      or not v_colors <@ array['W', 'U', 'B', 'R', 'G', 'C']::text[]
      or (
        'C' = any(v_colors)
        and cardinality(v_colors) <> 1
      )
    then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_colors_invalid';
    end if;
  end if;

  if p_color_identity is not null then
    if exists (
      select 1
      from unnest(p_color_identity) as raw_color
      where raw_color is null
        or upper(raw_color) not in ('W', 'U', 'B', 'R', 'G', 'C')
    ) then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_color_identity_invalid';
    end if;

    select array_agg(distinct upper(color_value) order by upper(color_value))
    into v_color_identity
    from unnest(p_color_identity) as color_value;
    if v_color_identity is null
      or not v_color_identity
        <@ array['W', 'U', 'B', 'R', 'G', 'C']::text[]
      or (
        'C' = any(v_color_identity)
        and cardinality(v_color_identity) <> 1
      )
    then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_color_identity_invalid';
    end if;
  end if;

  v_currency := app_private.current_catalog_currency(p_currency);

  select
    catalog_state.active_catalog_version,
    catalog_state.current_search_index_version
  into v_catalog_version, v_search_index_version
  from public.catalog_state as catalog_state
  where catalog_state.singleton_id = 1;

  v_scope := md5(jsonb_build_object(
    'query', v_query,
    'game', v_game_code,
    'set', v_set_code,
    'language', v_language,
    'rarity', v_rarity,
    'finish', p_finish,
    'colors', v_colors,
    'color_identity', v_color_identity,
    'type_line', v_type_line,
    'has_price', p_has_price,
    'currency', v_currency,
    'min_mana', p_min_mana_value,
    'max_mana', p_max_mana_value,
    'released_from', p_released_from,
    'released_to', p_released_to,
    'include_digital', p_include_digital,
    'include_nondefault', p_include_nondefault,
    'return_all_variants', v_return_all_variants,
    'sort', v_sort,
    'catalog_version', v_catalog_version,
    'search_index_version', v_search_index_version
  )::text);

  if p_after is not null then
    v_cursor := app_private.catalog_decode_cursor(p_after);
    begin
      v_cursor_id := (v_cursor ->> 'id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_catalog_cursor_invalid';
    end;

    if v_cursor ->> 'v' <> '1'
      or v_cursor ->> 'scope' is distinct from v_scope
    then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_cursor_invalid';
    end if;

    select
      search_row.sort_name,
      search_row.sort_release,
      search_row.set_code,
      search_row.collector_number,
      search_row.sort_price
    into
      v_cursor_name,
      v_cursor_release,
      v_cursor_set,
      v_cursor_collector,
      v_cursor_price
    from app_private.catalog_search_mode_keys(
      v_query,
      v_game_code,
      v_set_code,
      v_language,
      v_rarity,
      p_finish,
      v_colors,
      v_color_identity,
      v_type_line,
      p_has_price,
      v_currency,
      p_min_mana_value,
      p_max_mana_value,
      p_released_from,
      p_released_to,
      p_include_digital,
      p_include_nondefault,
      v_return_all_variants
    ) as search_row
    where search_row.printing_id = v_cursor_id;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_cursor_invalid';
    end if;
  end if;

  select count(*)
  into v_total_count
  from app_private.catalog_search_mode_keys(
    v_query,
    v_game_code,
    v_set_code,
    v_language,
    v_rarity,
    p_finish,
    v_colors,
    v_color_identity,
    v_type_line,
    p_has_price,
    v_currency,
    p_min_mana_value,
    p_max_mana_value,
    p_released_from,
    p_released_to,
    p_include_digital,
    p_include_nondefault,
    v_return_all_variants
  );

  for v_row in
    select search_row.*
    from app_private.catalog_search_mode_keys(
      v_query,
      v_game_code,
      v_set_code,
      v_language,
      v_rarity,
      p_finish,
      v_colors,
      v_color_identity,
      v_type_line,
      p_has_price,
      v_currency,
      p_min_mana_value,
      p_max_mana_value,
      p_released_from,
      p_released_to,
      p_include_digital,
      p_include_nondefault,
      v_return_all_variants
    ) as search_row
    where p_after is null
      or case v_sort
        when 'name' then
          search_row.sort_name > v_cursor_name
          or search_row.sort_name = v_cursor_name
            and search_row.sort_release < v_cursor_release
          or search_row.sort_name = v_cursor_name
            and search_row.sort_release = v_cursor_release
            and search_row.set_code > v_cursor_set
          or search_row.sort_name = v_cursor_name
            and search_row.sort_release = v_cursor_release
            and search_row.set_code = v_cursor_set
            and search_row.collector_number > v_cursor_collector
          or search_row.sort_name = v_cursor_name
            and search_row.sort_release = v_cursor_release
            and search_row.set_code = v_cursor_set
            and search_row.collector_number = v_cursor_collector
            and search_row.printing_id > v_cursor_id
        when 'newest' then
          search_row.sort_release < v_cursor_release
          or search_row.sort_release = v_cursor_release
            and search_row.sort_name > v_cursor_name
          or search_row.sort_release = v_cursor_release
            and search_row.sort_name = v_cursor_name
            and search_row.set_code > v_cursor_set
          or search_row.sort_release = v_cursor_release
            and search_row.sort_name = v_cursor_name
            and search_row.set_code = v_cursor_set
            and search_row.collector_number > v_cursor_collector
          or search_row.sort_release = v_cursor_release
            and search_row.sort_name = v_cursor_name
            and search_row.set_code = v_cursor_set
            and search_row.collector_number = v_cursor_collector
            and search_row.printing_id > v_cursor_id
        when 'price_asc' then
          case
            when v_cursor_price is null then
              search_row.sort_price is null
              and (
                search_row.sort_name,
                search_row.set_code,
                search_row.collector_number,
                search_row.printing_id
              ) > (
                v_cursor_name,
                v_cursor_set,
                v_cursor_collector,
                v_cursor_id
              )
            else
              search_row.sort_price is null
              or search_row.sort_price > v_cursor_price
              or search_row.sort_price = v_cursor_price
                and (
                  search_row.sort_name,
                  search_row.set_code,
                  search_row.collector_number,
                  search_row.printing_id
                ) > (
                  v_cursor_name,
                  v_cursor_set,
                  v_cursor_collector,
                  v_cursor_id
                )
          end
        when 'price_desc' then
          case
            when v_cursor_price is null then
              search_row.sort_price is null
              and (
                search_row.sort_name,
                search_row.set_code,
                search_row.collector_number,
                search_row.printing_id
              ) > (
                v_cursor_name,
                v_cursor_set,
                v_cursor_collector,
                v_cursor_id
              )
            else
              search_row.sort_price is null
              or search_row.sort_price < v_cursor_price
              or search_row.sort_price = v_cursor_price
                and (
                  search_row.sort_name,
                  search_row.set_code,
                  search_row.collector_number,
                  search_row.printing_id
                ) > (
                  v_cursor_name,
                  v_cursor_set,
                  v_cursor_collector,
                  v_cursor_id
                )
          end
      end
    order by
      case when v_sort = 'name' then search_row.sort_name end asc,
      case when v_sort = 'name' then search_row.sort_release end desc,
      case when v_sort = 'newest' then search_row.sort_release end desc,
      case when v_sort = 'newest' then search_row.sort_name end asc,
      case when v_sort = 'price_asc' then search_row.sort_price end asc nulls last,
      case when v_sort = 'price_desc' then search_row.sort_price end desc nulls last,
      case when v_sort in ('price_asc', 'price_desc')
        then search_row.sort_name
      end asc,
      search_row.set_code asc,
      search_row.collector_number asc,
      search_row.printing_id asc
    limit p_limit + 1
  loop
    if v_result_count = p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      app_private.catalog_printing_to_json(
        v_row.printing_id,
        v_currency,
        p_finish
      )
    );
    v_result_count := v_result_count + 1;
    v_last_id := v_row.printing_id;
  end loop;

  if v_has_more and v_last_id is not null then
    v_next_cursor := app_private.catalog_encode_cursor(
      jsonb_build_object(
        'v', 1,
        'scope', v_scope,
        'id', v_last_id
      )
    );
  end if;

  return jsonb_build_object(
    'items', v_items,
    'total_count', v_total_count,
    'result_count', v_result_count,
    'next_cursor', v_next_cursor,
    'currency', v_currency,
    'sort', v_sort,
    'limit', p_limit,
    'return_all_variants', v_return_all_variants,
    'catalog', app_private.catalog_context_json()
  );
end;
$$;

revoke all on function public.catalog_search(
  text,
  text,
  text,
  text,
  text,
  public.card_finish,
  text[],
  text[],
  text,
  boolean,
  text,
  numeric,
  numeric,
  date,
  date,
  boolean,
  boolean,
  text,
  text,
  integer,
  boolean
) from public, anon, service_role;
grant execute on function public.catalog_search(
  text,
  text,
  text,
  text,
  text,
  public.card_finish,
  text[],
  text[],
  text,
  boolean,
  text,
  numeric,
  numeric,
  date,
  date,
  boolean,
  boolean,
  text,
  text,
  integer,
  boolean
) to authenticated;

comment on function public.catalog_search(
  text,
  text,
  text,
  text,
  text,
  public.card_finish,
  text[],
  text[],
  text,
  boolean,
  text,
  numeric,
  numeric,
  date,
  date,
  boolean,
  boolean,
  text,
  text,
  integer,
  boolean
) is
  'Searches the admitted-user catalog in Oracle mode by default, or returns every eligible printing when explicitly requested.';
