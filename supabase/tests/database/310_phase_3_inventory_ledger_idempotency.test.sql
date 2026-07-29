begin;

select no_plan();

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
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  'phase3-ledger@example.test'
);

select set_config(
  'test.user_id',
  '31000000-0000-4000-8000-000000000002',
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
  digital
)
select
  '31000000-0000-4000-8000-000000000010',
  game.id,
  'fixture',
  'ledger-set',
  'p3l',
  'Phase 3 Ledger Set',
  false
from public.games as game
where game.code = 'mtg';

insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name
)
select
  '31000000-0000-4000-8000-000000000011',
  game.id,
  'fixture',
  'ledger-card',
  'Ledger Fixture',
  'ledger fixture'
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
  digital,
  finishes,
  is_default_browse
)
select
  (
    '31000000-0000-4000-8000-'
    || lpad(series.number::text, 12, '0')
  )::uuid,
  game.id,
  '31000000-0000-4000-8000-000000000011',
  '31000000-0000-4000-8000-000000000010',
  'fixture',
  'ledger-printing-' || series.number,
  series.number::text,
  'en',
  'Ledger Fixture ' || series.number,
  false,
  array['nonfoil'::public.card_finish],
  series.number = 1
from public.games as game
cross join generate_series(20, 25) as series(number)
where game.code = 'mtg';

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_id'),
  true
);
set local role authenticated;

select set_config(
  'test.first_result',
  public.apply_inventory_transaction(
    current_setting('test.collection_id')::uuid,
    'ledger-six-lines-0001',
    '2026-07-26T12:00:00Z',
    (
      select jsonb_agg(
        jsonb_build_object(
          'line_id', 'line-' || series.number,
          'printing_id',
            (
              '31000000-0000-4000-8000-'
              || lpad(series.number::text, 12, '0')
            )::uuid,
          'finish', 'nonfoil',
          'condition', 'near_mint',
          'quantity_delta', 1
        )
        order by series.number
      )
      from generate_series(20, 25) as series(number)
    ),
    'six exact lines',
    'fixture:first',
    '{"fixture":true}'::jsonb
  )::text,
  true
);

select is(
  current_setting('test.first_result')::jsonb ->> 'replayed',
  'false',
  'the first canonical request commits once'
);
select is(
  current_setting('test.first_result')::jsonb #>> '{totals,line_count}',
  '6',
  'the ledger reports all six canonical lines'
);

select set_config(
  'test.replay_result',
  public.apply_inventory_transaction(
    current_setting('test.collection_id')::uuid,
    'ledger-six-lines-0001',
    '2026-07-26T12:00:00Z',
    (
      select jsonb_agg(
        jsonb_build_object(
          'line_id', 'line-' || series.number,
          'printing_id',
            (
              '31000000-0000-4000-8000-'
              || lpad(series.number::text, 12, '0')
            )::uuid,
          'finish', 'nonfoil',
          'condition', 'near_mint',
          'quantity_delta', 1
        )
        order by series.number desc
      )
      from generate_series(20, 25) as series(number)
    ),
    'six exact lines',
    'fixture:first',
    '{"fixture":true}'::jsonb
  )::text,
  true
);

select is(
  current_setting('test.replay_result')::jsonb ->> 'transaction_id',
  current_setting('test.first_result')::jsonb ->> 'transaction_id',
  'an identical normalized replay returns the existing transaction'
);
select is(
  current_setting('test.replay_result')::jsonb ->> 'replayed',
  'true',
  'an identical replay is explicitly marked'
);

select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'ledger-six-lines-0001',
        '2026-07-26T12:00:00Z',
        jsonb_build_array(
          jsonb_build_object(
            'line_id', 'line-20',
            'printing_id',
              '31000000-0000-4000-8000-000000000020',
            'finish', 'nonfoil',
            'condition', 'near_mint',
            'quantity_delta', 2
          )
        )
      )
    $statement$,
    current_setting('test.collection_id')
  ),
  '23505',
  'talence_inventory_idempotency_conflict',
  'a conflicting replay is rejected'
);

select set_config(
  'test.second_result',
  public.apply_inventory_transaction(
    current_setting('test.collection_id')::uuid,
    'ledger-follow-up-0002',
    '2026-07-26T12:01:00Z',
    jsonb_build_array(
      jsonb_build_object(
        'line_id', 'follow-up',
        'printing_id',
          '31000000-0000-4000-8000-000000000020',
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity_delta', 4,
        'expected_quantity_before', 1
      )
    )
  )::text,
  true
);

select is(
  public.calculate_collection_summary(
    current_setting('test.collection_id')::uuid
  ) ->> 'quantity_total',
  '10',
  'summary quantity is derived from immutable balance deltas'
);
select is(
  public.calculate_collection_summary(
    current_setting('test.collection_id')::uuid
  ) ->> 'unpriced_quantity',
  '10',
  'missing prices are explicit rather than zero-valued'
);

select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'ledger-negative-0003',
        '2026-07-26T12:02:00Z',
        '[{
          "line_id":"negative",
          "printing_id":"31000000-0000-4000-8000-000000000020",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":-6
        }]'::jsonb
      )
    $statement$,
    current_setting('test.collection_id')
  ),
  '23514',
  'talence_inventory_quantity_negative',
  'inventory cannot become negative'
);

select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'ledger-stale-0004',
        '2026-07-26T12:03:00Z',
        '[{
          "line_id":"stale",
          "printing_id":"31000000-0000-4000-8000-000000000020",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":1,
          "expected_quantity_before":1
        }]'::jsonb
      )
    $statement$,
    current_setting('test.collection_id')
  ),
  '40001',
  'talence_inventory_stale_quantity',
  'optimistic quantity guards reject stale clients'
);

select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'ledger-finish-0005',
        '2026-07-26T12:04:00Z',
        '[{
          "line_id":"foil",
          "printing_id":"31000000-0000-4000-8000-000000000020",
          "finish":"foil",
          "condition":"near_mint",
          "quantity_delta":1
        }]'::jsonb
      )
    $statement$,
    current_setting('test.collection_id')
  ),
  '23514',
  'talence_inventory_finish_unsupported',
  'unsupported finishes cannot enter inventory'
);

select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'ledger-unknown-0006',
        '2026-07-26T12:05:00Z',
        '[{
          "line_id":"unknown",
          "printing_id":"31000000-0000-4000-8000-000000000020",
          "finish":"unknown",
          "condition":"unknown",
          "quantity_delta":1
        }]'::jsonb
      )
    $statement$,
    current_setting('test.collection_id')
  ),
  '22023',
  'talence_inventory_line_value_invalid',
  'human mutations reject unknown physical state'
);

select is(
  jsonb_array_length(
    public.collection_transaction_history(
      current_setting('test.collection_id')::uuid,
      null,
      10
    ) #> '{items,1,lines}'
  ),
  5,
  'history headers include at most five line previews'
);
select is(
  public.collection_transaction_history(
    current_setting('test.collection_id')::uuid,
    null,
    10
  ) #>> '{items,1,line_count}',
  '6',
  'history headers expose the exact line count'
);
select ok(
  not (
    public.collection_transaction_history(
      current_setting('test.collection_id')::uuid,
      null,
      10
    ) #> '{items,1,lines,0}'
  ) ? 'printing'
  and not (
    public.collection_transaction_history(
      current_setting('test.collection_id')::uuid,
      null,
      10
    ) #> '{items,1,lines,0}'
  ) ? 'line_ids',
  'history line previews omit nested printing and unbounded client IDs'
);

select is(
  jsonb_array_length(
    public.collection_transaction_lines(
      (
        current_setting('test.first_result')::jsonb
          ->> 'transaction_id'
      )::uuid,
      0,
      2
    ) -> 'items'
  ),
  2,
  'complete line history is bounded and paginated'
);
select is(
  public.collection_transaction_lines(
    (
      current_setting('test.first_result')::jsonb
        ->> 'transaction_id'
    )::uuid,
    2,
    2
  ) #>> '{items,0,line_number}',
  '3',
  'line pagination resumes without overlap'
);
select throws_ok(
  format(
    $statement$
      select public.collection_transaction_lines(
        %L::uuid,
        1,
        201
      )
    $statement$,
    current_setting('test.first_result')::jsonb
      ->> 'transaction_id'
  ),
  '22023',
  'talence_inventory_transaction_lines_page_invalid',
  'transaction-line pages are capped at 200'
);

select set_config(
  'test.history_cursor',
  public.collection_transaction_history(
    current_setting('test.collection_id')::uuid,
    null,
    1
  ) ->> 'next_cursor',
  true
);
select set_config(
  'test.other_collection',
  public.collection_create(
    current_setting('test.workspace_id')::uuid,
    'Cursor Scope',
    null,
    null
  ) #>> '{collection,collection_id}',
  true
);
select throws_ok(
  format(
    $statement$
      select public.collection_transaction_history(
        %L::uuid,
        %L,
        1
      )
    $statement$,
    current_setting('test.other_collection'),
    current_setting('test.history_cursor')
  ),
  '22023',
  'talence_inventory_cursor_invalid',
  'history cursors are bound to their collection'
);

select throws_ok(
  format(
    'update public.inventory_balances set quantity = 99 where collection_id = %L::uuid',
    current_setting('test.collection_id')
  ),
  '42501',
  'permission denied for table inventory_balances',
  'ordinary users cannot directly alter balances'
);
select throws_ok(
  format(
    'update public.inventory_transactions set note = %L where id = %L::uuid',
    'tampered',
    current_setting('test.first_result')::jsonb
      ->> 'transaction_id'
  ),
  '42501',
  'permission denied for table inventory_transactions',
  'ordinary users cannot directly alter history'
);

reset role;

select throws_ok(
  format(
    'update public.inventory_transactions set note = %L where id = %L::uuid',
    'tampered',
    current_setting('test.first_result')::jsonb
      ->> 'transaction_id'
  ),
  '55000',
  'talence_inventory_history_immutable',
  'even trusted SQL cannot rewrite committed history'
);

insert into public.inventory_transactions (
  id,
  workspace_id,
  collection_id,
  source,
  actor_user_id,
  idempotency_key,
  occurred_at
)
values (
  '31000000-0000-4000-8000-000000000099',
  current_setting('test.workspace_id')::uuid,
  current_setting('test.collection_id')::uuid,
  'manual',
  current_setting('test.user_id')::uuid,
  'large-client-line-fixture',
  '2026-07-26T12:10:00Z'
);
insert into public.inventory_transaction_lines (
  transaction_id,
  workspace_id,
  collection_id,
  line_number,
  client_line_ids,
  printing_id,
  finish,
  condition,
  quantity_delta,
  quantity_before,
  quantity_after
)
values (
  '31000000-0000-4000-8000-000000000099',
  current_setting('test.workspace_id')::uuid,
  current_setting('test.collection_id')::uuid,
  1,
  array(
    select 'csv-row:' || series.number::text
    from generate_series(1, 5000) as series(number)
  ),
  '31000000-0000-4000-8000-000000000020',
  'nonfoil',
  'damaged',
  1,
  0,
  1
);

set local role authenticated;
select set_config(
  'test.large_line',
  public.collection_transaction_lines(
    '31000000-0000-4000-8000-000000000099',
    0,
    100
  ) #>> '{items,0}',
  true
);
select is(
  current_setting('test.large_line')::jsonb
    ->> 'client_line_count',
  '5000',
  'history reports the exact aggregated client-line count'
);
select is(
  jsonb_array_length(
    current_setting('test.large_line')::jsonb
      -> 'client_line_ids_preview'
  ),
  5,
  'history caps aggregated client-line ID previews at five'
);
select ok(
  pg_column_size(current_setting('test.large_line')::jsonb) < 8192,
  'a 5,000-ID transaction line has a small bounded read payload'
);
reset role;

select is(
  (
    select count(*)::integer
    from app_private.inventory_operation_requests as request
    where request.operation_type = 'apply'
      and request.principal_id =
        current_setting('test.user_id')::uuid
      and request.scope_id =
        current_setting('test.collection_id')::uuid
  ),
  2,
  'failed and replayed requests create no extra request records'
);

select * from finish();
rollback;
