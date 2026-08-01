-- Runtime hardening discovered by browser validation: push direct positive
-- printing facets ahead of the recursive filter evaluator and restore the
-- documented price-floor response envelope.

create or replace function app_private.catalog_direct_positive_values(
  p_filters jsonb,
  p_field text
)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(array_agg(distinct lower(selected_value)), array[]::text[])
  from jsonb_array_elements(
    case
      when p_filters ->> 'operator' = 'and'
        and coalesce((p_filters ->> 'negated')::boolean, false) = false
      then p_filters -> 'children'
      else '[]'::jsonb
    end
  ) as children(child)
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(child -> 'value') = 'array' then child -> 'value' else '[]'::jsonb end
  ) as selected(selected_value)
  where child ? 'field'
    and child ->> 'field' = p_field
    and child ->> 'comparator' in ('is', 'any', 'all', 'exactly')
    and coalesce((child ->> 'negated')::boolean, false) = false
$$;

revoke all on function app_private.catalog_direct_positive_values(jsonb, text)
  from public, anon, authenticated;

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
      app_private.catalog_direct_positive_values(p_filters, 'finish') as finishes
  ), eligible as materialized (
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
    from constraints
    join public.catalog_printings as printing on true
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
      and (cardinality(constraints.sets) = 0 or catalog_set.code = any(constraints.sets))
      and (cardinality(constraints.languages) = 0 or printing.language = any(constraints.languages))
      and (cardinality(constraints.rarities) = 0 or printing.rarity::text = any(constraints.rarities))
      and (cardinality(constraints.finishes) = 0 or printing.finishes::text[] && constraints.finishes)
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

create or replace function public.catalog_filter_price_floors(
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
  return jsonb_build_object('cards', v_result);
end;
$$;

revoke all on function public.catalog_filter_price_floors(uuid[], jsonb, text, boolean, boolean)
  from public, anon, service_role;
grant execute on function public.catalog_filter_price_floors(uuid[], jsonb, text, boolean, boolean)
  to authenticated;
