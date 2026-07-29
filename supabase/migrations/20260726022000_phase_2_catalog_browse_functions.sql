-- Phase 2: admitted-user catalog browse/detail/status RPCs and platform-admin
-- catalog queue/status RPCs. JSON results keep the browser contract stable
-- while underlying catalog tables remain read-only.

create function app_private.assert_catalog_reader()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not app_api.is_admitted_user(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'talence_admitted_user_required';
  end if;
end;
$$;

create function app_private.current_catalog_currency(
  p_currency text default null
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
begin
  v_currency := upper(nullif(btrim(p_currency), ''));

  if v_currency is null then
    select upper(p.preferred_currency)
    into v_currency
    from public.profiles as p
    where p.user_id = auth.uid();
  end if;

  v_currency := coalesce(v_currency, 'USD');

  if v_currency not in ('USD', 'EUR', 'TIX') then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_currency_invalid';
  end if;

  return v_currency;
end;
$$;

create function app_private.catalog_context_json()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'version', cs.active_catalog_version,
    'source_provider', source_file.provider,
    'provider_observed_at', cs.last_successful_source_observed_at,
    'catalog_ingested_at', active_run.completed_at,
    'search_index_version', cs.current_search_index_version,
    'price_observed_at', price_state.price_observed_at,
    'price_ingested_at', price_state.price_ingested_at,
    'price_stale_after', price_state.price_stale_after
  )
  from public.catalog_state as cs
  left join public.catalog_import_runs as active_run
    on active_run.id = cs.active_import_id
  left join public.catalog_source_files as source_file
    on source_file.id = active_run.source_file_id
  left join lateral (
    select
      max(cp.observed_at) as price_observed_at,
      max(cp.ingested_at) as price_ingested_at,
      max(cp.stale_after) as price_stale_after
    from public.current_prices as cp
  ) as price_state on true
  where cs.singleton_id = 1
$$;

create function app_private.catalog_encode_cursor(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select rtrim(
    translate(
      replace(
        replace(
          encode(convert_to(p_value::text, 'UTF8'), 'base64'),
          E'\n',
          ''
        ),
        E'\r',
        ''
      ),
      '+/',
      '-_'
    ),
    '='
  )
$$;

create function app_private.catalog_escape_like(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select replace(
    replace(
      replace(p_value, E'\\', E'\\\\'),
      '%',
      E'\\%'
    ),
    '_',
    E'\\_'
  )
$$;

create function app_private.catalog_decode_cursor(p_value text)
returns jsonb
language plpgsql
stable
strict
set search_path = pg_catalog
as $$
declare
  v_base64 text;
  v_result jsonb;
begin
  if char_length(p_value) not between 8 and 2048
    or p_value !~ '^[A-Za-z0-9_-]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_cursor_invalid';
  end if;

  v_base64 := translate(p_value, '-_', '+/');
  v_base64 := rpad(
    v_base64,
    ((char_length(v_base64) + 3) / 4) * 4,
    '='
  );

  begin
    v_result := convert_from(decode(v_base64, 'base64'), 'UTF8')::jsonb;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'talence_catalog_cursor_invalid';
  end;

  if jsonb_typeof(v_result) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_cursor_invalid';
  end if;

  return v_result;
end;
$$;

create function app_private.catalog_printing_to_json(
  p_printing_id uuid,
  p_best_currency text default null,
  p_best_finish public.card_finish default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'printing_id', printing.id,
    'card_id', printing.card_id,
    'display_name', coalesce(
      printing.printed_name,
      card.name,
      first_face.name,
      printing.collector_number
    ),
    'card_name', card.name,
    'printed_name', printing.printed_name,
    'set', jsonb_build_object(
      'id', catalog_set.id,
      'code', catalog_set.code,
      'name', catalog_set.name
    ),
    'collector_number', printing.collector_number,
    'language', printing.language,
    'rarity', printing.rarity,
    'layout', printing.layout,
    'released_at', printing.released_at,
    'digital', printing.digital,
    'promo', printing.promo,
    'oversized', printing.oversized,
    'variation', printing.variation,
    'finishes', printing.finishes,
    'frame_effects', printing.frame_effects,
    'border_color', printing.border_color,
    'artist', printing.artist,
    'scryfall_uri', printing.scryfall_uri,
    'image_status', printing.image_status,
    'is_default_browse', printing.is_default_browse,
    'mana_cost', card.mana_cost,
    'mana_value', card.mana_value,
    'type_line', coalesce(card.type_line, first_face.type_line),
    'oracle_text', coalesce(card.oracle_text, first_face.oracle_text),
    'colors', case
      when cardinality(card.colors) > 0 then card.colors
      else coalesce(first_face.colors, '{}'::text[])
    end,
    'color_identity', case
      when card.id is not null then card.color_identity
      else printing.color_identity
    end,
    'keywords', coalesce(card.keywords, '{}'::text[]),
    'reserved', coalesce(card.reserved, false),
    'faces', coalesce(faces.items, '[]'::jsonb),
    'prices', coalesce(prices.items, '[]'::jsonb),
    'best_price', best_price.item
  )
  from public.catalog_printings as printing
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  left join lateral (
    select
      face.name,
      face.type_line,
      face.oracle_text,
      face.colors
    from public.catalog_faces as face
    where face.printing_id = printing.id
    order by face.face_index
    limit 1
  ) as first_face on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', face.id,
        'face_index', face.face_index,
        'name', face.name,
        'mana_cost', face.mana_cost,
        'type_line', face.type_line,
        'oracle_text', face.oracle_text,
        'colors', face.colors,
        'power', face.power,
        'toughness', face.toughness,
        'loyalty', face.loyalty,
        'defense', face.defense,
        'artist', face.artist,
        'image_small_uri', face.image_small_uri,
        'image_normal_uri', face.image_normal_uri,
        'image_large_uri', face.image_large_uri,
        'image_png_uri', face.image_png_uri,
        'art_crop_uri', face.art_crop_uri,
        'border_crop_uri', face.border_crop_uri
      )
      order by face.face_index
    ) as items
    from public.catalog_faces as face
    where face.printing_id = printing.id
  ) as faces on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'provider', price.provider,
        'currency', price.currency,
        'finish', price.finish,
        'amount', price.amount,
        'observed_at', price.observed_at,
        'ingested_at', price.ingested_at,
        'stale_after', price.stale_after,
        'is_stale', price.stale_after is not null
          and price.stale_after <= statement_timestamp()
      )
      order by price.currency, price.finish, price.provider
    ) as items
    from public.current_prices as price
    where price.printing_id = printing.id
  ) as prices on true
  left join lateral (
    select jsonb_build_object(
      'provider', price.provider,
      'currency', price.currency,
      'finish', price.finish,
      'amount', price.amount,
      'observed_at', price.observed_at,
      'ingested_at', price.ingested_at,
      'stale_after', price.stale_after,
      'is_stale', price.stale_after is not null
        and price.stale_after <= statement_timestamp()
    ) as item
    from public.current_prices as price
    where price.printing_id = printing.id
      and p_best_currency is not null
      and price.currency = p_best_currency
      and (p_best_finish is null or price.finish = p_best_finish)
    order by
      price.amount,
      case price.finish
        when 'nonfoil'::public.card_finish then 1
        when 'foil'::public.card_finish then 2
        when 'etched'::public.card_finish then 3
        else 4
      end,
      price.provider
    limit 1
  ) as best_price on true
  where printing.id = p_printing_id
    and printing.active
    and catalog_set.active
    and (card.id is null or card.active)
$$;

revoke all on function app_private.assert_catalog_reader()
  from public, anon, authenticated;
revoke all on function app_private.current_catalog_currency(text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_context_json()
  from public, anon, authenticated;
revoke all on function app_private.catalog_encode_cursor(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.catalog_escape_like(text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_decode_cursor(text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_printing_to_json(
  uuid,
  text,
  public.card_finish
)
  from public, anon, authenticated;

create function app_private.catalog_query_matching_printings(
  p_query text
)
returns table (printing_id uuid)
language sql
stable
strict
security definer
set search_path = pg_catalog
as $$
  with query_value as materialized (
    select
      p_query as raw_value,
      app_private.normalize_catalog_search_text(p_query) as normalized_value,
      char_length(
        app_private.normalize_catalog_search_text(p_query)
      ) as normalized_length
  ),
  matching_cards as materialized (
    select card.id
    from public.catalog_cards as card
    cross join query_value
    where query_value.normalized_length >= 2
      and (
        card.search_document
          @@ websearch_to_tsquery(
            'simple'::regconfig,
            query_value.raw_value
          )
        or card.normalized_name like
          query_value.normalized_value || '%'
        or (
          query_value.normalized_length >= 3
          and card.normalized_name
            operator(extensions.%)
            query_value.normalized_value
        )
      )
  ),
  matching_printings as materialized (
    select printing.id
    from public.catalog_printings as printing
    cross join query_value
    where query_value.normalized_length >= 2
      and (
        printing.search_document
          @@ websearch_to_tsquery(
            'simple'::regconfig,
            query_value.raw_value
          )
        or printing.normalized_name like
          query_value.normalized_value || '%'
        or (
          query_value.normalized_length >= 3
          and printing.normalized_name
            operator(extensions.%)
            query_value.normalized_value
        )
      )
  ),
  matching_faces as materialized (
    select face.printing_id
    from public.catalog_faces as face
    cross join query_value
    where query_value.normalized_length >= 2
      and (
        face.search_document
          @@ websearch_to_tsquery(
            'simple'::regconfig,
            query_value.raw_value
          )
        or face.normalized_name like
          query_value.normalized_value || '%'
        or (
          query_value.normalized_length >= 3
          and face.normalized_name
            operator(extensions.%)
            query_value.normalized_value
        )
      )
  ),
  matching_sets as materialized (
    select catalog_set.id
    from public.catalog_sets as catalog_set
    cross join query_value
    where catalog_set.name ilike
        '%' || app_private.catalog_escape_like(query_value.raw_value) || '%'
        escape E'\\'
      or catalog_set.code ilike
        app_private.catalog_escape_like(query_value.raw_value) || '%'
        escape E'\\'
  )
  select printing.id
  from public.catalog_printings as printing
  join matching_cards
    on matching_cards.id = printing.card_id
  union
  select matching_printings.id
  from matching_printings
  union
  select matching_faces.printing_id
  from matching_faces
  union
  select printing.id
  from public.catalog_printings as printing
  join matching_sets
    on matching_sets.id = printing.set_id
$$;

revoke all on function app_private.catalog_query_matching_printings(text)
  from public, anon, authenticated;

create function app_private.catalog_search_keys(
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
  p_include_nondefault boolean
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
  select
    printing.id as printing_id,
    coalesce(
      card.normalized_name,
      case
        when printing.printed_name is not null
        then printing.normalized_name
      end,
      first_face.normalized_name,
      printing.normalized_name
    ) as sort_name,
    coalesce(printing.released_at, date '0001-01-01') as sort_release,
    catalog_set.code as set_code,
    printing.collector_number,
    best_price.amount as sort_price
  from public.catalog_printings as printing
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  join public.games as game
    on game.id = printing.game_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  left join lateral (
    select face.normalized_name
    from public.catalog_faces as face
    where face.printing_id = printing.id
    order by face.face_index
    limit 1
  ) as first_face on true
  left join lateral (
    select price.amount
    from public.current_prices as price
    where price.printing_id = printing.id
      and price.currency = p_currency
      and (p_finish is null or price.finish = p_finish)
    order by
      price.amount,
      case price.finish
        when 'nonfoil'::public.card_finish then 1
        when 'foil'::public.card_finish then 2
        when 'etched'::public.card_finish then 3
        else 4
      end,
      price.provider
    limit 1
  ) as best_price on true
  where printing.active
    and catalog_set.active
    and game.active
    and (card.id is null or card.active)
    and game.code = p_game_code
    and (p_set_code is null or catalog_set.code = p_set_code)
    and (p_language is null or printing.language = p_language)
    and (p_rarity is null or printing.rarity = p_rarity)
    and (
      p_finish is null
      or p_finish = any(printing.finishes)
    )
    and (
      p_colors is null
      or case
        when p_colors = array['C']::text[] then
          cardinality(
            case
              when cardinality(card.colors) > 0 then card.colors
              else coalesce(
              (
                select array_agg(distinct face_color)
                from public.catalog_faces as color_face
                cross join lateral unnest(color_face.colors) as face_color
                where color_face.printing_id = printing.id
              ),
              '{}'::text[]
              )
            end
          ) = 0
        else
          case
            when cardinality(card.colors) > 0 then card.colors
            else coalesce(
            (
              select array_agg(distinct face_color)
              from public.catalog_faces as color_face
              cross join lateral unnest(color_face.colors) as face_color
              where color_face.printing_id = printing.id
            ),
            '{}'::text[]
            )
          end @> p_colors
      end
    )
    and (
      p_color_identity is null
      or case
        when p_color_identity = array['C']::text[] then
          cardinality(
            case
              when card.id is not null then card.color_identity
              else printing.color_identity
            end
          ) = 0
        else
          case
            when card.id is not null then card.color_identity
            else printing.color_identity
          end @> p_color_identity
      end
    )
    and (
      p_type_line is null
      or card.type_line ilike
        '%' || app_private.catalog_escape_like(p_type_line) || '%'
        escape E'\\'
      or exists (
        select 1
        from public.catalog_faces as type_face
        where type_face.printing_id = printing.id
          and type_face.type_line ilike
            '%' || app_private.catalog_escape_like(p_type_line) || '%'
            escape E'\\'
      )
    )
    and (
      p_has_price is null
      or p_has_price = (best_price.amount is not null)
    )
    and (
      p_min_mana_value is null
      or card.mana_value >= p_min_mana_value
    )
    and (
      p_max_mana_value is null
      or card.mana_value <= p_max_mana_value
    )
    and (
      p_released_from is null
      or printing.released_at >= p_released_from
    )
    and (
      p_released_to is null
      or printing.released_at <= p_released_to
    )
    and (p_include_digital or not printing.digital)
    and (p_include_nondefault or printing.is_default_browse)
    and (
      p_query is null
      or printing.id in (
        select query_match.printing_id
        from app_private.catalog_query_matching_printings(
          p_query
        ) as query_match
      )
    )
$$;

revoke all on function app_private.catalog_search_keys(
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
  boolean
) from public, anon, authenticated;

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
  p_limit integer default 40
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
    from app_private.catalog_search_keys(
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
      p_include_nondefault
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
  from app_private.catalog_search_keys(
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
    p_include_nondefault
  );

  for v_row in
    select search_row.*
    from app_private.catalog_search_keys(
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
      p_include_nondefault
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
  integer
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
  integer
) to authenticated;

create function public.catalog_printing_detail(p_printing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
  v_printing jsonb;
begin
  perform app_private.assert_catalog_reader();
  v_currency := app_private.current_catalog_currency(null);
  v_printing := app_private.catalog_printing_to_json(
    p_printing_id,
    v_currency
  );

  if v_printing is null then
    return null;
  end if;

  return jsonb_build_object(
    'printing', v_printing,
    'catalog', app_private.catalog_context_json()
  );
end;
$$;

create function public.catalog_card_detail(p_card_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
  v_card jsonb;
  v_legalities jsonb;
  v_printings jsonb;
  v_printing_count bigint;
begin
  perform app_private.assert_catalog_reader();
  v_currency := app_private.current_catalog_currency(null);

  select jsonb_build_object(
    'id', card.id,
    'game_id', card.game_id,
    'name', card.name,
    'normalized_name', card.normalized_name,
    'mana_cost', card.mana_cost,
    'mana_value', card.mana_value,
    'type_line', card.type_line,
    'oracle_text', card.oracle_text,
    'colors', card.colors,
    'color_identity', card.color_identity,
    'keywords', card.keywords,
    'reserved', card.reserved,
    'source_provider', card.source_provider,
    'source_updated_at', card.source_updated_at
  )
  into v_card
  from public.catalog_cards as card
  where card.id = p_card_id
    and card.active;

  if v_card is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'format_code', legality.format_code,
        'legality', legality.legality,
        'source_updated_at', legality.source_updated_at
      )
      order by legality.format_code
    ),
    '[]'::jsonb
  )
  into v_legalities
  from public.catalog_legalities as legality
  where legality.card_id = p_card_id;

  select count(*)
  into v_printing_count
  from public.catalog_printings as printing
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  where printing.card_id = p_card_id
    and printing.active
    and catalog_set.active;

  select coalesce(
    jsonb_agg(
      app_private.catalog_printing_to_json(
        selected_printing.id,
        v_currency
      )
      order by
        selected_printing.released_at desc nulls last,
        selected_printing.id
    ),
    '[]'::jsonb
  )
  into v_printings
  from (
    select printing.id, printing.released_at
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    where printing.card_id = p_card_id
      and printing.active
      and catalog_set.active
    order by printing.released_at desc nulls last, printing.id
    limit 250
  ) as selected_printing;

  return jsonb_build_object(
    'card', v_card,
    'legalities', v_legalities,
    'printing_count', v_printing_count,
    'printings', v_printings,
    'printings_truncated', v_printing_count > 250,
    'catalog', app_private.catalog_context_json()
  );
end;
$$;

create function public.catalog_set_detail(p_set_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_set_code text := lower(nullif(btrim(p_set_code), ''));
  v_set_id uuid;
  v_set jsonb;
  v_currency text;
  v_printing_count bigint;
  v_printings jsonb;
begin
  perform app_private.assert_catalog_reader();

  if v_set_code is null
    or v_set_code !~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_set_code_invalid';
  end if;

  v_currency := app_private.current_catalog_currency(null);

  select
    catalog_set.id,
    jsonb_build_object(
      'id', catalog_set.id,
      'game_id', catalog_set.game_id,
      'code', catalog_set.code,
      'name', catalog_set.name,
      'set_type', catalog_set.set_type,
      'released_at', catalog_set.released_at,
      'parent_set_id', catalog_set.parent_set_id,
      'card_count', catalog_set.card_count,
      'digital', catalog_set.digital,
      'foil_only', catalog_set.foil_only,
      'nonfoil_only', catalog_set.nonfoil_only,
      'icon_svg_uri', catalog_set.icon_svg_uri,
      'source_provider', catalog_set.source_provider,
      'source_updated_at', catalog_set.source_updated_at
    )
  into v_set_id, v_set
  from public.catalog_sets as catalog_set
  join public.games as game
    on game.id = catalog_set.game_id
  where catalog_set.code = v_set_code
    and catalog_set.active
    and game.active
  order by game.code = 'mtg' desc, catalog_set.id
  limit 1;

  if v_set is null then
    return null;
  end if;

  select count(*)
  into v_printing_count
  from public.catalog_printings as printing
  where printing.set_id = v_set_id
    and printing.active;

  select coalesce(
    jsonb_agg(
      app_private.catalog_printing_to_json(
        selected_printing.id,
        v_currency
      )
      order by
        selected_printing.released_at desc nulls last,
        selected_printing.collector_number,
        selected_printing.id
    ),
    '[]'::jsonb
  )
  into v_printings
  from (
    select
      printing.id,
      printing.released_at,
      printing.collector_number
    from public.catalog_printings as printing
    where printing.set_id = v_set_id
      and printing.active
    order by
      printing.released_at desc nulls last,
      printing.collector_number,
      printing.id
    limit 100
  ) as selected_printing;

  return jsonb_build_object(
    'set', v_set,
    'printing_count', v_printing_count,
    'printings', v_printings,
    'printings_truncated', v_printing_count > 100,
    'catalog', app_private.catalog_context_json()
  );
end;
$$;

create function public.catalog_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_context jsonb;
begin
  perform app_private.assert_catalog_reader();
  v_context := app_private.catalog_context_json();

  return jsonb_build_object(
    'ready', v_context ->> 'version' is not null,
    'active_catalog_version', v_context ->> 'version',
    'source_provider', v_context ->> 'source_provider',
    'provider_observed_at', v_context -> 'provider_observed_at',
    'catalog_ingested_at', v_context -> 'catalog_ingested_at',
    'search_index_version', v_context ->> 'search_index_version',
    'price_observed_at', v_context -> 'price_observed_at',
    'price_ingested_at', v_context -> 'price_ingested_at',
    'price_stale_after', v_context -> 'price_stale_after',
    'counts', jsonb_build_object(
      'sets', (
        select count(*)
        from public.catalog_sets
        where active
      ),
      'cards', (
        select count(*)
        from public.catalog_cards
        where active
      ),
      'printings', (
        select count(*)
        from public.catalog_printings
        where active
      ),
      'faces', (
        select count(*)
        from public.catalog_faces as face
        join public.catalog_printings as printing
          on printing.id = face.printing_id
        where printing.active
      ),
      'prices', (
        select count(*)
        from public.current_prices
      )
    )
  );
end;
$$;

create function public.admin_catalog_status(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  return jsonb_build_object(
    'state', (
      select jsonb_build_object(
        'sync_enabled', state.sync_enabled,
        'active_import_id', state.active_import_id,
        'active_catalog_version', state.active_catalog_version,
        'provider_observed_at',
          state.last_successful_source_observed_at,
        'catalog_ingested_at', active_run.completed_at,
        'search_index_version', state.current_search_index_version,
        'current_robot_snapshot_id', state.current_robot_snapshot_id
      )
      from public.catalog_state as state
      left join public.catalog_import_runs as active_run
        on active_run.id = state.active_import_id
      where state.singleton_id = 1
    ),
    'counts', jsonb_build_object(
      'sets', (
        select count(*) from public.catalog_sets where active
      ),
      'cards', (
        select count(*) from public.catalog_cards where active
      ),
      'printings', (
        select count(*) from public.catalog_printings where active
      ),
      'faces', (
        select count(*)
        from public.catalog_faces as face
        join public.catalog_printings as printing
          on printing.id = face.printing_id
        where printing.active
      ),
      'prices', (
        select count(*) from public.current_prices
      )
    ),
    'latest_source_file', (
      select jsonb_build_object(
        'id', source_file.id,
        'provider', source_file.provider,
        'source_type', source_file.source_type,
        'provider_object_id', source_file.provider_object_id,
        'provider_updated_at', source_file.provider_updated_at,
        'downloaded_size', source_file.downloaded_size,
        'sha256', source_file.sha256,
        'dependency_sha256', source_file.dependency_sha256,
        'catalog_identity_sha256',
          source_file.catalog_identity_sha256,
        'downloaded_at', source_file.downloaded_at,
        'status', source_file.status
      )
      from public.catalog_source_files as source_file
      order by
        source_file.provider_updated_at desc,
        source_file.created_at desc,
        source_file.id desc
      limit 1
    ),
    'latest_imports', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', recent.id,
            'source_file_id', recent.source_file_id,
            'status', recent.status,
            'trigger_type', recent.trigger_type,
            'force', recent.requested_force,
            'started_at', recent.started_at,
            'completed_at', recent.completed_at,
            'records_seen', recent.records_seen,
            'records_written', recent.records_written,
            'records_rejected', recent.records_rejected,
            'sets_written', recent.sets_written,
            'cards_written', recent.cards_written,
            'printings_written', recent.printings_written,
            'faces_written', recent.faces_written,
            'prices_written', recent.prices_written,
            'error_code', recent.error_code,
            'error_summary', recent.error_summary,
            'worker_version', recent.worker_version,
            'catalog_version', recent.catalog_version,
            'created_at', recent.created_at
          )
          order by recent.created_at desc, recent.id desc
        ),
        '[]'::jsonb
      )
      from (
        select import_run.*
        from public.catalog_import_runs as import_run
        order by import_run.created_at desc, import_run.id desc
        limit 20
      ) as recent
    ),
    'queued_imports', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', queued.id,
            'status', queued.status,
            'trigger_type', queued.trigger_type,
            'force', queued.requested_force,
            'requested_by_user_id', queued.requested_by_user_id,
            'queued_at', queued.created_at,
            'started_at', queued.started_at,
            'completed_at', queued.completed_at,
            'records_seen', queued.records_seen,
            'records_written', queued.records_written,
            'records_rejected', queued.records_rejected,
            'error_code', queued.error_code,
            'error_summary', queued.error_summary
          )
          order by queued.created_at, queued.id
        ),
        '[]'::jsonb
      )
      from public.catalog_import_runs as queued
      where queued.status = 'queued'::public.job_status
    )
  );
end;
$$;

create function public.admin_queue_catalog_sync(
  p_actor_user_id uuid,
  p_force boolean default false,
  p_trigger_type text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_trigger_type text := lower(nullif(btrim(p_trigger_type), ''));
  v_sync_enabled boolean;
  v_run public.catalog_import_runs%rowtype;
  v_replayed boolean := false;
begin
  if p_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  if v_trigger_type <> 'manual' then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_admin_trigger_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talence:catalog-admin-queue', 0)
  );

  select state.sync_enabled
  into v_sync_enabled
  from public.catalog_state as state
  where state.singleton_id = 1
  for update;

  if not coalesce(v_sync_enabled, false) then
    raise exception using
      errcode = '55000',
      message = 'talence_catalog_sync_disabled';
  end if;

  select import_run.*
  into v_run
  from public.catalog_import_runs as import_run
  where import_run.status in (
    'queued'::public.job_status,
    'running'::public.job_status
  )
  order by
    case import_run.status
      when 'running'::public.job_status then 0
      else 1
    end,
    import_run.created_at,
    import_run.id
  limit 1
  for update;

  if found then
    v_replayed := true;
    if v_run.status = 'queued'::public.job_status
      and p_force
      and not v_run.requested_force
    then
      update public.catalog_import_runs
      set requested_force = true
      where id = v_run.id
      returning * into v_run;
    end if;
  else
    insert into public.catalog_import_runs (
      status,
      trigger_type,
      requested_force,
      requested_by_user_id
    )
    values (
      'queued'::public.job_status,
      v_trigger_type,
      coalesce(p_force, false),
      p_actor_user_id
    )
    returning * into v_run;
  end if;

  return jsonb_build_object(
    'import_run_id', v_run.id,
    'status', v_run.status,
    'trigger_type', v_run.trigger_type,
    'force', v_run.requested_force,
    'queued_at', v_run.created_at,
    'replayed', v_replayed
  );
end;
$$;

revoke all on function public.catalog_printing_detail(uuid)
  from public, anon, service_role;
revoke all on function public.catalog_card_detail(uuid)
  from public, anon, service_role;
revoke all on function public.catalog_set_detail(text)
  from public, anon, service_role;
revoke all on function public.catalog_status()
  from public, anon, service_role;
grant execute on function public.catalog_printing_detail(uuid)
  to authenticated;
grant execute on function public.catalog_card_detail(uuid)
  to authenticated;
grant execute on function public.catalog_set_detail(text)
  to authenticated;
grant execute on function public.catalog_status()
  to authenticated;

revoke all on function public.admin_catalog_status(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_queue_catalog_sync(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_catalog_status(uuid)
  to service_role;
grant execute on function public.admin_queue_catalog_sync(uuid, boolean, text)
  to service_role;
