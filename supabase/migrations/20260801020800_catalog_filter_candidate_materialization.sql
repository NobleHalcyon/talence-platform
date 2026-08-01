-- Force cheap indexed printing constraints to materialize before invoking the
-- recursive typed-filter evaluator. PostgreSQL may otherwise reorder boolean
-- predicates and evaluate the recursive function across the complete catalog.

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
  with constraints as materialized (
    select
      app_private.catalog_direct_positive_values(p_filters, 'set') as sets,
      app_private.catalog_direct_positive_values(p_filters, 'language') as languages,
      app_private.catalog_direct_positive_values(p_filters, 'rarity') as rarities,
      app_private.catalog_direct_positive_values(p_filters, 'finish') as finishes,
      app_private.catalog_filter_contains_field(p_filters, 'language') as contains_language
  ), printing_candidates as materialized (
    select
      printing.id,
      printing.card_id,
      printing.normalized_name,
      printing.released_at,
      printing.collector_number,
      printing.is_default_browse,
      printing.variation,
      printing.promo,
      catalog_set.code as set_code
    from constraints
    join public.catalog_printings as printing on true
    join public.catalog_sets as catalog_set on catalog_set.id = printing.set_id and catalog_set.active
    join public.games as game on game.id = printing.game_id and game.active
    where printing.active
      and game.code = p_game_code
      and (p_include_digital or not printing.digital)
      and (p_include_nondefault or printing.is_default_browse)
      and (cardinality(constraints.sets) = 0 or catalog_set.code = any(constraints.sets))
      and (cardinality(constraints.languages) = 0 or printing.language = any(constraints.languages))
      and (cardinality(constraints.rarities) = 0 or printing.rarity::text = any(constraints.rarities))
      and (cardinality(constraints.finishes) = 0 or printing.finishes::text[] && constraints.finishes)
      and (constraints.contains_language or printing.language = 'en')
  ), eligible as materialized (
    select
      candidate.id as printing_id,
      candidate.card_id,
      coalesce(card.normalized_name, candidate.normalized_name, first_face.normalized_name) as sort_name,
      coalesce(candidate.released_at, date '0001-01-01') as sort_release,
      candidate.set_code,
      candidate.collector_number,
      best_price.amount as sort_price,
      row_number() over (
        partition by coalesce(candidate.card_id, candidate.id)
        order by candidate.is_default_browse desc, candidate.released_at desc nulls last,
          candidate.variation, candidate.promo, candidate.id
      ) as representative_rank
    from printing_candidates as candidate
    left join public.catalog_cards as card on card.id = candidate.card_id
    left join lateral (
      select face.normalized_name from public.catalog_faces as face
      where face.printing_id = candidate.id order by face.face_index limit 1
    ) as first_face on true
    left join lateral (
      select price.amount from public.current_prices as price
      where price.printing_id = candidate.id and price.currency = p_currency
      order by price.amount, price.provider limit 1
    ) as best_price on true
    where (card.id is null or card.active)
      and (
        p_query is null or candidate.id in (
          select match.printing_id from app_private.catalog_query_matching_printings(p_query) as match
        )
      )
      and app_private.catalog_filter_matches(p_filters, candidate.id, candidate.card_id)
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
