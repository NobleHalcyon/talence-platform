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
  '32000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000002',
  'phase3-transfer@example.test'
);
select set_config(
  'test.user_id',
  '32000000-0000-4000-8000-000000000002',
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
  'test.default_collection_id',
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
  '32000000-0000-4000-8000-000000000010',
  game.id,
  'fixture',
  'transfer-set',
  'p3t',
  'Phase 3 Transfer Set',
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
  '32000000-0000-4000-8000-000000000011',
  game.id,
  'fixture',
  'transfer-card',
  'Transfer Fixture',
  'transfer fixture'
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
  '32000000-0000-4000-8000-000000000012',
  game.id,
  '32000000-0000-4000-8000-000000000011',
  '32000000-0000-4000-8000-000000000010',
  'fixture',
  'transfer-printing',
  '1',
  'en',
  'Transfer Fixture',
  false,
  array['nonfoil'::public.card_finish],
  true
from public.games as game
where game.code = 'mtg';

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_id'),
  true
);
set local role authenticated;

select set_config(
  'test.source_collection_id',
  public.collection_create(
    current_setting('test.workspace_id')::uuid,
    'Transfer Source',
    null,
    null
  ) #>> '{collection,collection_id}',
  true
);
select set_config(
  'test.destination_collection_id',
  public.collection_create(
    current_setting('test.workspace_id')::uuid,
    'Transfer Destination',
    null,
    null
  ) #>> '{collection,collection_id}',
  true
);

select set_config(
  'test.seed_result',
  public.apply_inventory_transaction(
    current_setting('test.source_collection_id')::uuid,
    'transfer-seed-0001',
    '2026-07-26T13:00:00Z',
    '[{
      "line_id":"seed",
      "printing_id":"32000000-0000-4000-8000-000000000012",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":10
    }]'::jsonb
  )::text,
  true
);

reset role;
update public.catalog_printings
set active = false
where id = '32000000-0000-4000-8000-000000000012';
set local role authenticated;

select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'inactive-new-add-0001',
        '2026-07-26T13:00:30Z',
        '[{
          "line_id":"inactive-add",
          "printing_id":"32000000-0000-4000-8000-000000000012",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":1
        }]'::jsonb
      )
    $statement$,
    current_setting('test.destination_collection_id')
  ),
  '23514',
  'talence_catalog_printing_inactive',
  'new positive inventory cannot be acquired for inactive catalog identity'
);

select set_config(
  'test.transfer_result',
  public.transfer_inventory(
    current_setting('test.source_collection_id')::uuid,
    current_setting('test.destination_collection_id')::uuid,
    'transfer-pair-0002',
    '2026-07-26T13:01:00Z',
    '[{
      "line_id":"move-four",
      "printing_id":"32000000-0000-4000-8000-000000000012",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity":4,
      "expected_source_quantity_before":10,
      "expected_destination_quantity_before":0
    }]'::jsonb,
    'atomic move',
    '{"fixture":true}'::jsonb
  )::text,
  true
);
set constraints all immediate;
set constraints all deferred;

select is(
  public.calculate_collection_summary(
    current_setting('test.source_collection_id')::uuid
  ) ->> 'quantity_total',
  '6',
  'the source leg commits atomically'
);
select is(
  public.calculate_collection_summary(
    current_setting('test.destination_collection_id')::uuid
  ) ->> 'quantity_total',
  '4',
  'the destination leg commits atomically'
);
select pass(
  'existing inventory can be transferred after catalog deactivation'
);
select isnt(
  current_setting('test.transfer_result')::jsonb
    ->> 'source_transaction_id',
  current_setting('test.transfer_result')::jsonb
    ->> 'destination_transaction_id',
  'a transfer creates two distinct immutable headers'
);

select set_config(
  'test.transfer_replay',
  public.transfer_inventory(
    current_setting('test.source_collection_id')::uuid,
    current_setting('test.destination_collection_id')::uuid,
    'transfer-pair-0002',
    '2026-07-26T13:01:00Z',
    '[{
      "line_id":"move-four",
      "printing_id":"32000000-0000-4000-8000-000000000012",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity":4,
      "expected_source_quantity_before":10,
      "expected_destination_quantity_before":0
    }]'::jsonb,
    'atomic move',
    '{"fixture":true}'::jsonb
  )::text,
  true
);
select is(
  current_setting('test.transfer_replay')::jsonb
    ->> 'source_transaction_id',
  current_setting('test.transfer_result')::jsonb
    ->> 'source_transaction_id',
  'identical transfer replay returns the original pair'
);
select is(
  current_setting('test.transfer_replay')::jsonb ->> 'replayed',
  'true',
  'transfer replay is explicit'
);

select throws_ok(
  format(
    $statement$
      select public.transfer_inventory(
        %L::uuid,
        %L::uuid,
        'transfer-pair-0002',
        '2026-07-26T13:01:00Z',
        '[{
          "line_id":"move-four",
          "printing_id":"32000000-0000-4000-8000-000000000012",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity":3,
          "expected_source_quantity_before":10,
          "expected_destination_quantity_before":0
        }]'::jsonb
      )
    $statement$,
    current_setting('test.source_collection_id'),
    current_setting('test.destination_collection_id')
  ),
  '23505',
  'talence_inventory_idempotency_conflict',
  'conflicting transfer replay is rejected'
);

select throws_ok(
  format(
    $statement$
      select public.transfer_inventory(
        %L::uuid,
        %L::uuid,
        'transfer-negative-0003',
        '2026-07-26T13:02:00Z',
        '[{
          "line_id":"too-many",
          "printing_id":"32000000-0000-4000-8000-000000000012",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity":7
        }]'::jsonb
      )
    $statement$,
    current_setting('test.source_collection_id'),
    current_setting('test.destination_collection_id')
  ),
  '23514',
  'talence_inventory_quantity_negative',
  'a failed source leg cannot partially credit the destination'
);
select is(
  public.calculate_collection_summary(
    current_setting('test.destination_collection_id')::uuid
  ) ->> 'quantity_total',
  '4',
  'failed transfer leaves the destination unchanged'
);

select set_config(
  'test.reversal_result',
  public.reverse_inventory_transaction(
    (
      current_setting('test.transfer_result')::jsonb
        ->> 'destination_transaction_id'
    )::uuid,
    'transfer-reversal-0004',
    '2026-07-26T13:03:00Z',
    'reverse the full pair'
  )::text,
  true
);
set constraints all immediate;
set constraints all deferred;
select is(
  public.calculate_collection_summary(
    current_setting('test.source_collection_id')::uuid
  ) ->> 'quantity_total',
  '10',
  'paired reversal compensates the source leg'
);
select is(
  public.calculate_collection_summary(
    current_setting('test.destination_collection_id')::uuid
  ) ->> 'quantity_total',
  '0',
  'paired reversal compensates the destination leg'
);
select pass(
  'committed history can be reversed after catalog deactivation'
);
select is(
  public.apply_inventory_transaction(
    current_setting('test.source_collection_id')::uuid,
    'inactive-remove-0005',
    '2026-07-26T13:03:30Z',
    '[{
      "line_id":"inactive-remove",
      "printing_id":"32000000-0000-4000-8000-000000000012",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":-1,
      "expected_quantity_before":10
    }]'::jsonb
  ) #>> '{lines,0,quantity_after}',
  '9',
  'existing inactive inventory can still be reduced'
);
select is(
  jsonb_array_length(
    current_setting('test.reversal_result')::jsonb
      -> 'reversed_transaction_ids'
  ),
  2,
  'a transfer reversal always targets both original legs'
);

select is(
  public.reverse_inventory_transaction(
    (
      current_setting('test.transfer_result')::jsonb
        ->> 'destination_transaction_id'
    )::uuid,
    'transfer-reversal-0004',
    '2026-07-26T13:03:00Z',
    'reverse the full pair'
  ) ->> 'replayed',
  'true',
  'reversal replay is exact for the same requested original leg'
);

select throws_ok(
  format(
    $statement$
      select public.reverse_inventory_transaction(
        %L::uuid,
        'reversal-of-reversal-0005',
        '2026-07-26T13:04:00Z'
      )
    $statement$,
    current_setting('test.reversal_result')::jsonb
      ->> 'source_transaction_id'
  ),
  '55000',
  'talence_inventory_reversal_of_reversal_denied',
  'a reversal cannot itself be reversed'
);
select throws_ok(
  format(
    $statement$
      select public.reverse_inventory_transaction(
        %L::uuid,
        'second-reversal-0006',
        '2026-07-26T13:05:00Z'
      )
    $statement$,
    current_setting('test.transfer_result')::jsonb
      ->> 'source_transaction_id'
  ),
  '55000',
  'talence_inventory_transaction_already_reversed',
  'an original transaction can be reversed only once'
);

select throws_ok(
  format(
    'select public.collection_archive(%L::uuid, %L::timestamptz)',
    current_setting('test.default_collection_id'),
    public.collection_detail(
      current_setting('test.default_collection_id')::uuid
    ) #>> '{collection,updated_at}'
  ),
  '55000',
  'talence_collection_is_profile_default',
  'profile default collections cannot be archived'
);
select throws_ok(
  format(
    'select public.collection_delete(%L::uuid, %L::timestamptz)',
    current_setting('test.source_collection_id'),
    public.collection_detail(
      current_setting('test.source_collection_id')::uuid
    ) #>> '{collection,updated_at}'
  ),
  '55000',
  'talence_collection_delete_requires_empty_inventory',
  'collections with positive inventory cannot be soft-deleted'
);

select is(
  public.collection_archive(
    current_setting('test.source_collection_id')::uuid,
    (
      public.collection_detail(
        current_setting('test.source_collection_id')::uuid
      ) #>> '{collection,updated_at}'
    )::timestamptz
  ) #>> '{collection,status}',
  'archived',
  'a non-default collection can be archived without rewriting history'
);
select is(
  public.apply_inventory_transaction(
    current_setting('test.source_collection_id')::uuid,
    'transfer-seed-0001',
    '2026-07-26T13:00:00Z',
    '[{
      "line_id":"seed",
      "printing_id":"32000000-0000-4000-8000-000000000012",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":10
    }]'::jsonb
  ) ->> 'replayed',
  'true',
  'an exact ledger replay remains available after archival'
);
select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'archived-new-write-0007',
        '2026-07-26T13:06:00Z',
        '[{
          "line_id":"new",
          "printing_id":"32000000-0000-4000-8000-000000000012",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":1
        }]'::jsonb
      )
    $statement$,
    current_setting('test.source_collection_id')
  ),
  '55000',
  'talence_collection_not_active',
  'archived collections reject new inventory mutations'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.inventory_transactions as transaction
    where transaction.transfer_group_id =
      (
        current_setting('test.transfer_result')::jsonb
          ->> 'transfer_group_id'
      )::uuid
      and transaction.source = 'transfer'
  ),
  2,
  'the committed transfer has exactly two original headers'
);
select is(
  (
    select count(distinct transaction.transfer_direction)::integer
    from public.inventory_transactions as transaction
    where transaction.transfer_group_id =
      (
        current_setting('test.transfer_result')::jsonb
          ->> 'transfer_group_id'
      )::uuid
  ),
  2,
  'the pair contains one in and one out direction'
);

select * from finish();
rollback;
