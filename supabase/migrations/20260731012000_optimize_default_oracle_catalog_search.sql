-- The populated default catalog must choose representatives before performing
-- per-printing face and price lookups. The generic filtered path remains the
-- authority for searches and advanced filters.

alter function app_private.catalog_search_mode_keys(
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
) rename to catalog_search_mode_keys_filtered;

create function app_private.catalog_default_oracle_keys(
  p_game_code text,
  p_language text,
  p_currency text
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
  with representatives as materialized (
    select distinct on (coalesce(printing.card_id, printing.id))
      printing.id as printing_id,
      coalesce(
        card.normalized_name,
        case
          when printing.printed_name is not null
          then printing.normalized_name
        end,
        printing.normalized_name
      ) as preliminary_sort_name,
      card.id is null and printing.printed_name is null as needs_face_name,
      coalesce(printing.released_at, date '0001-01-01') as sort_release,
      catalog_set.code as set_code,
      printing.collector_number
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
      and catalog_set.active
    join public.games as game
      on game.id = printing.game_id
      and game.active
    left join public.catalog_cards as card
      on card.id = printing.card_id
    where printing.active
      and (card.id is null or card.active)
      and game.code = p_game_code
      and (p_language is null or printing.language = p_language)
      and not printing.digital
      and printing.is_default_browse
    order by
      coalesce(printing.card_id, printing.id),
      printing.is_default_browse desc,
      printing.released_at desc nulls last,
      printing.variation,
      printing.promo,
      printing.id
  )
  select
    representative.printing_id,
    coalesce(
      case
        when representative.needs_face_name then first_face.normalized_name
      end,
      representative.preliminary_sort_name
    ) as sort_name,
    representative.sort_release,
    representative.set_code,
    representative.collector_number,
    best_price.amount as sort_price
  from representatives as representative
  left join lateral (
    select face.normalized_name
    from public.catalog_faces as face
    where representative.needs_face_name
      and face.printing_id = representative.printing_id
    order by face.face_index
    limit 1
  ) as first_face on true
  left join lateral (
    select price.amount
    from public.current_prices as price
    where price.printing_id = representative.printing_id
      and price.currency = p_currency
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
$$;

revoke all on function app_private.catalog_default_oracle_keys(text, text, text)
  from public, anon, authenticated;

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
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not coalesce(p_return_all_variants, false)
    and p_query is null
    and p_set_code is null
    and p_rarity is null
    and p_finish is null
    and p_colors is null
    and p_color_identity is null
    and p_type_line is null
    and p_has_price is null
    and p_min_mana_value is null
    and p_max_mana_value is null
    and p_released_from is null
    and p_released_to is null
    and not coalesce(p_include_digital, false)
    and not coalesce(p_include_nondefault, false)
  then
    return query
    select search_row.*
    from app_private.catalog_default_oracle_keys(
      p_game_code,
      p_language,
      p_currency
    ) as search_row;
    return;
  end if;

  return query
  select search_row.*
  from app_private.catalog_search_mode_keys_filtered(
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
    p_include_nondefault,
    p_return_all_variants
  ) as search_row;
end;
$$;

revoke all on function app_private.catalog_search_mode_keys_filtered(
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
