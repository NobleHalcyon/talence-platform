begin;

select plan(4);

insert into public.catalog_sets (
  id,
  game_id,
  source_provider,
  source_id,
  code,
  name,
  set_type,
  released_at,
  card_count,
  digital
)
select
  '90000000-0000-4000-8000-000000000001',
  game.id,
  'scryfall',
  '90000000-0000-4000-8000-000000000001',
  'prf',
  'Performance Fixture',
  'expansion',
  date '2026-01-01',
  50000,
  false
from public.games as game
where game.code = 'mtg';

insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  mana_cost,
  mana_value,
  type_line,
  oracle_text,
  colors,
  color_identity,
  keywords
)
select
  (
    '91000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  )::uuid,
  game.id,
  'scryfall',
  (
    '91000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  ),
  generated.name,
  app_private.normalize_catalog_search_text(generated.name),
  case generated.number % 5
    when 0 then '{W}'
    when 1 then '{U}'
    when 2 then '{B}'
    when 3 then '{R}'
    else '{G}'
  end,
  (generated.number % 8)::numeric,
  case generated.number % 3
    when 0 then 'Creature — Construct'
    when 1 then 'Instant'
    else 'Artifact'
  end,
  'Deterministic representative-volume catalog search fixture.',
  case generated.number % 5
    when 0 then array['W']
    when 1 then array['U']
    when 2 then array['B']
    when 3 then array['R']
    else array['G']
  end,
  case generated.number % 5
    when 0 then array['W']
    when 1 then array['U']
    when 2 then array['B']
    when 3 then array['R']
    else array['G']
  end,
  '{}'::text[]
from public.games as game
cross join lateral (
  select
    series.number,
    case
      when series.number = 42424 then 'Performance Needle 42424'
      else 'Archive Entry ' || lpad(series.number::text, 5, '0')
    end as name
  from generate_series(1, 50000) as series(number)
) as generated
where game.code = 'mtg';

insert into public.catalog_printings (
  id,
  game_id,
  card_id,
  set_id,
  source_provider,
  source_id,
  collector_number,
  language,
  printed_name,
  rarity,
  layout,
  released_at,
  digital,
  finishes,
  color_identity,
  is_default_browse
)
select
  (
    '92000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  )::uuid,
  game.id,
  (
    '91000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  )::uuid,
  '90000000-0000-4000-8000-000000000001',
  'scryfall',
  (
    '92000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  ),
  generated.number::text,
  'en',
  generated.name,
  case generated.number % 4
    when 0 then 'common'
    when 1 then 'uncommon'
    when 2 then 'rare'
    else 'mythic'
  end,
  'normal',
  date '2020-01-01' + (generated.number % 2000),
  false,
  array['nonfoil'::public.card_finish],
  case generated.number % 5
    when 0 then array['W']
    when 1 then array['U']
    when 2 then array['B']
    when 3 then array['R']
    else array['G']
  end,
  true
from public.games as game
cross join lateral (
  select
    series.number,
    case
      when series.number = 42424 then 'Performance Needle 42424'
      else 'Archive Entry ' || lpad(series.number::text, 5, '0')
    end as name
  from generate_series(1, 50000) as series(number)
) as generated
where game.code = 'mtg';

insert into public.catalog_faces (
  id,
  printing_id,
  face_index,
  name,
  type_line,
  oracle_text,
  colors
)
select
  (
    '93000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  )::uuid,
  (
    '92000000-0000-4000-8000-'
    || lpad(generated.number::text, 12, '0')
  )::uuid,
  0,
  generated.name,
  'Artifact Creature — Construct',
  'Deterministic representative-volume face fixture.',
  case generated.number % 5
    when 0 then array['W']
    when 1 then array['U']
    when 2 then array['B']
    when 3 then array['R']
    else array['G']
  end
from (
  select
    series.number,
    case
      when series.number = 42424 then 'Performance Needle 42424'
      else 'Archive Entry ' || lpad(series.number::text, 5, '0')
    end as name
  from generate_series(1, 50000) as series(number)
) as generated;

analyze public.catalog_cards;
analyze public.catalog_printings;
analyze public.catalog_faces;

create function pg_temp.catalog_name_index_plan()
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_line text;
  v_plan text := '';
begin
  for v_line in execute $explain$
    explain (costs off)
    select card.id
    from public.catalog_cards as card
    where card.search_document
      @@ websearch_to_tsquery(
        'simple'::regconfig,
        'Performance Needle 42424'
      )
  $explain$
  loop
    v_plan := v_plan || v_line || E'\n';
  end loop;

  return v_plan;
end;
$$;

create temporary table catalog_search_performance (
  result_count bigint not null,
  elapsed_milliseconds numeric not null
) on commit drop;

do $$
declare
  v_started_at timestamptz;
  v_result_count bigint;
begin
  v_started_at := clock_timestamp();

  select count(*)
  into v_result_count
  from app_private.catalog_search_keys(
    p_query => 'Performance Needle 42424',
    p_game_code => 'mtg',
    p_set_code => null,
    p_language => 'en',
    p_rarity => null,
    p_finish => null,
    p_colors => null,
    p_color_identity => null,
    p_type_line => null,
    p_has_price => null,
    p_currency => 'USD',
    p_min_mana_value => null,
    p_max_mana_value => null,
    p_released_from => null,
    p_released_to => null,
    p_include_digital => false,
    p_include_nondefault => false
  );

  insert into pg_temp.catalog_search_performance (
    result_count,
    elapsed_milliseconds
  )
  values (
    v_result_count,
    extract(
      epoch from clock_timestamp() - v_started_at
    ) * 1000
  );
end;
$$;

select is(
  (select count(*)::integer from public.catalog_printings),
  50000,
  'the deterministic performance fixture contains 50,000 printings'
);
select ok(
  position(
    'catalog_cards_search_document_idx'
    in pg_temp.catalog_name_index_plan()
  ) > 0,
  'the representative name lookup plan uses the catalog full-text GIN index'
);
select is(
  (
    select result_count::integer
    from pg_temp.catalog_search_performance
  ),
  1,
  'representative-volume search returns the deterministic target'
);
select diag(
  format(
    '50,000-printing unique search elapsed: %s ms',
    (
      select round(elapsed_milliseconds, 3)
      from pg_temp.catalog_search_performance
    )
  )
);
select cmp_ok(
  (
    select elapsed_milliseconds
    from pg_temp.catalog_search_performance
  ),
  '<',
  5000::numeric,
  'representative-volume catalog search completes within five seconds'
);

select * from finish();

rollback;
