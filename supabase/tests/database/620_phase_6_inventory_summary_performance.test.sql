begin;

select plan(5);

create function pg_temp.create_admitted_user(
  p_invite_id uuid,
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  insert into app_private.invited_users (id, email, expires_at)
  values (
    p_invite_id,
    p_email,
    statement_timestamp() + interval '1 day'
  );

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'authenticated',
    'authenticated',
    p_email,
    '',
    statement_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('invited_user_id', p_invite_id::text),
    statement_timestamp(),
    statement_timestamp()
  );

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  execute 'set local role authenticated';
  perform public.finalize_admitted_user();
  execute 'reset role';
end;
$$;

select pg_temp.create_admitted_user(
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000011',
  'phase6-summary-performance@example.test'
);
select set_config(
  'test.user_id',
  '62000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.workspace_id',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_id')::uuid
  ),
  true
);
select set_config(
  'test.collection_id',
  (
    select profile.default_collection_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_id')::uuid
  ),
  true
);

insert into public.catalog_sets (
  id,
  game_id,
  source_provider,
  source_id,
  code,
  name,
  card_count,
  digital
)
select
  '62000000-0000-4000-8000-000000000020',
  game.id,
  'fixture',
  'phase6-summary-set',
  'p6p',
  'Phase 6 Summary Performance',
  10000,
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
  colors,
  color_identity
)
select
  '62000000-0000-4000-8000-000000000021',
  game.id,
  'fixture',
  'phase6-summary-card',
  'Summary Performance Fixture',
  'summary performance fixture',
  array['U'],
  array['U']
from public.games as game
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
  digital,
  finishes,
  color_identity,
  is_default_browse
)
select
  (
    '62000000-0000-4000-8001-'
    || lpad(series.number::text, 12, '0')
  )::uuid,
  game.id,
  '62000000-0000-4000-8000-000000000021',
  '62000000-0000-4000-8000-000000000020',
  'fixture',
  'phase6-summary-printing-' || series.number::text,
  series.number::text,
  'en',
  'Summary Performance Fixture ' || series.number::text,
  case series.number % 4
    when 0 then 'common'
    when 1 then 'uncommon'
    when 2 then 'rare'
    else 'mythic'
  end,
  false,
  array['nonfoil'::public.card_finish],
  array['U'],
  series.number = 1
from public.games as game
cross join generate_series(1, 10000) as series(number)
where game.code = 'mtg';

insert into public.inventory_transactions (
  id,
  workspace_id,
  collection_id,
  source,
  actor_user_id,
  idempotency_key,
  occurred_at,
  committed_at,
  metadata
)
values (
  '62000000-0000-4000-8000-000000000030',
  current_setting('test.workspace_id')::uuid,
  current_setting('test.collection_id')::uuid,
  'manual',
  current_setting('test.user_id')::uuid,
  'phase6-summary-performance',
  statement_timestamp() - interval '1 minute',
  statement_timestamp(),
  '{"fixture":"phase6-performance"}'::jsonb
);

insert into public.inventory_balances (
  workspace_id,
  collection_id,
  printing_id,
  finish,
  condition,
  quantity,
  last_transaction_id
)
select
  current_setting('test.workspace_id')::uuid,
  current_setting('test.collection_id')::uuid,
  (
    '62000000-0000-4000-8001-'
    || lpad(series.number::text, 12, '0')
  )::uuid,
  'nonfoil',
  case series.number % 5
    when 0 then 'near_mint'::public.card_condition
    when 1 then 'lightly_played'::public.card_condition
    when 2 then 'moderately_played'::public.card_condition
    when 3 then 'heavily_played'::public.card_condition
    else 'damaged'::public.card_condition
  end,
  (series.number % 5) + 1,
  '62000000-0000-4000-8000-000000000030'
from generate_series(1, 10000) as series(number);

insert into public.current_prices (
  printing_id,
  provider,
  currency,
  finish,
  amount,
  observed_at,
  ingested_at,
  stale_after
)
select
  (
    '62000000-0000-4000-8001-'
    || lpad(series.number::text, 12, '0')
  )::uuid,
  'scryfall',
  'USD',
  'nonfoil',
  2.0000,
  statement_timestamp() - interval '1 hour',
  statement_timestamp() - interval '50 minutes',
  statement_timestamp() + interval '1 day'
from generate_series(1, 10000) as series(number)
where series.number % 2 = 0;

analyze public.catalog_printings;
analyze public.current_prices;
analyze public.inventory_balances;

create temporary table inventory_summary_performance (
  result jsonb not null,
  elapsed_milliseconds numeric not null
) on commit drop;
grant insert, select
  on pg_temp.inventory_summary_performance
  to authenticated;

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_id'),
  true
);
set local role authenticated;

do $$
declare
  v_started_at timestamptz;
  v_result jsonb;
begin
  v_started_at := clock_timestamp();
  v_result := public.calculate_collection_summary(
    current_setting('test.collection_id')::uuid,
    'USD'
  );

  insert into pg_temp.inventory_summary_performance (
    result,
    elapsed_milliseconds
  )
  values (
    v_result,
    extract(
      epoch from clock_timestamp() - v_started_at
    ) * 1000
  );
end;
$$;

select is(
  (
    select result ->> 'quantity_total'
    from pg_temp.inventory_summary_performance
  ),
  '30000',
  'representative summary returns the exact total quantity'
);
select is(
  (
    select result ->> 'unique_printings'
    from pg_temp.inventory_summary_performance
  ),
  '10000',
  'representative summary includes every unique printing'
);
select is(
  (
    select
      (result ->> 'priced_quantity')
        || '/'
        || (result ->> 'unpriced_quantity')
    from pg_temp.inventory_summary_performance
  ),
  '15000/15000',
  'representative summary preserves priced and unpriced quantities'
);
select is(
  (
    select result ->> 'estimated_value'
    from pg_temp.inventory_summary_performance
  ),
  '30000.0000',
  'representative summary values only exact priced finishes'
);
select ok(
  (
    select elapsed_milliseconds < 5000
    from pg_temp.inventory_summary_performance
  ),
  '10,000-balance inventory summary completes within the five-second local regression ceiling'
);

reset role;

select * from finish();

rollback;
