-- Read-only price-floor projection for the visual Oracle catalog. This does
-- not change catalog identity or pricing data; it only selects the least
-- expensive current foil and nonfoil observations for the requested cards.

create function public.catalog_oracle_price_floors(
  p_card_ids uuid[],
  p_currency text default null,
  p_set_code text default null,
  p_language text default 'en'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
  v_set_code text := lower(nullif(btrim(p_set_code), ''));
  v_language text := lower(nullif(btrim(p_language), ''));
begin
  perform app_private.assert_catalog_reader();

  if p_card_ids is null
    or cardinality(p_card_ids) < 1
    or cardinality(p_card_ids) > 100
    or array_position(p_card_ids, null) is not null
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_card_ids_invalid';
  end if;

  if v_set_code is not null
    and (char_length(v_set_code) > 16 or v_set_code !~ '^[a-z0-9]+$')
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_set_code_invalid';
  end if;

  if v_language is not null
    and (char_length(v_language) > 12 or v_language !~ '^[a-z0-9-]+$')
  then
    raise exception using
      errcode = '22023',
      message = 'talence_catalog_language_invalid';
  end if;

  v_currency := app_private.current_catalog_currency(p_currency);

  return (
    with requested as materialized (
      select distinct requested_id as card_id
      from unnest(p_card_ids) as requested_id
    ),
    ranked as materialized (
      select
        printing.card_id,
        price.finish,
        jsonb_build_object(
          'provider', price.provider,
          'currency', price.currency,
          'finish', price.finish,
          'amount', price.amount,
          'observed_at', price.observed_at,
          'ingested_at', price.ingested_at,
          'stale_after', price.stale_after
        ) as price_json,
        row_number() over (
          partition by printing.card_id, price.finish
          order by price.amount, price.observed_at desc, price.provider, printing.id
        ) as price_rank
      from requested
      join public.catalog_cards as card
        on card.id = requested.card_id
        and card.active
      join public.catalog_printings as printing
        on printing.card_id = card.id
        and printing.active
        and not printing.digital
        and printing.is_default_browse
      join public.catalog_sets as catalog_set
        on catalog_set.id = printing.set_id
        and catalog_set.active
      join public.current_prices as price
        on price.printing_id = printing.id
        and price.currency = v_currency
        and price.finish in (
          'nonfoil'::public.card_finish,
          'foil'::public.card_finish
        )
      where (v_set_code is null or catalog_set.code = v_set_code)
        and (v_language is null or printing.language = v_language)
    ),
    floors as (
      select
        ranked.card_id,
        (jsonb_agg(ranked.price_json) filter (
          where ranked.finish = 'nonfoil'::public.card_finish
        )) -> 0 as nonfoil,
        (jsonb_agg(ranked.price_json) filter (
          where ranked.finish = 'foil'::public.card_finish
        )) -> 0 as foil
      from ranked
      where ranked.price_rank = 1
      group by ranked.card_id
    )
    select jsonb_build_object(
      'cards',
      coalesce(
        jsonb_object_agg(
          requested.card_id::text,
          jsonb_build_object(
            'nonfoil', floors.nonfoil,
            'foil', floors.foil
          )
        ),
        '{}'::jsonb
      )
    )
    from requested
    left join floors on floors.card_id = requested.card_id
  );
end;
$$;

revoke all on function public.catalog_oracle_price_floors(uuid[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_oracle_price_floors(uuid[], text, text, text)
  to authenticated;

comment on function public.catalog_oracle_price_floors(uuid[], text, text, text) is
  'Returns least-expensive current foil and nonfoil observations for a bounded admitted-user Oracle-card result page.';
