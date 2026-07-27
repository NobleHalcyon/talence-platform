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
    '00000000-0000-0000-0000-000000000000',
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
  '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000011',
  'phase4-ownership@example.test'
);
select set_config(
  'test.user',
  '42000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.workspace',
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = current_setting('test.user')::uuid
  ),
  true
);
select set_config(
  'test.collection_a',
  (
    select default_collection_id::text
    from public.profiles
    where user_id = current_setting('test.user')::uuid
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
values (
  '42000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000001',
  'fixture',
  'phase4-ownership-set',
  'p4o',
  'Phase 4 Ownership',
  false
);
insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  type_line
)
values (
  '42000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000001',
  'fixture',
  'phase4-owned-card',
  'Finite Familiar',
  'finite familiar',
  'Creature — Cat'
);
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
values
  (
    '42000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000021',
    '42000000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-owned-print-one',
    '1',
    'en',
    null,
    false,
    array['nonfoil'::public.card_finish, 'foil'::public.card_finish],
    true
  ),
  (
    '42000000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000021',
    '42000000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-owned-print-two',
    '2',
    'en',
    'Finite Familiar',
    false,
    array['nonfoil'::public.card_finish],
    true
  ),
  (
    '42000000-0000-4000-8000-000000000033',
    '00000000-0000-4000-8000-000000000001',
    null,
    '42000000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-non-oracle-print',
    '3',
    'en',
    'Non Oracle Object',
    false,
    array['nonfoil'::public.card_finish],
    true
  );

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
values
  (
    '42000000-0000-4000-8000-000000000031',
    'alpha',
    'USD',
    'nonfoil',
    1.0000,
    '2026-07-20T00:00:00Z',
    '2026-07-20T01:00:00Z',
    '2026-07-21T00:00:00Z'
  ),
  (
    '42000000-0000-4000-8000-000000000031',
    'scryfall',
    'USD',
    'nonfoil',
    2.5000,
    '2026-07-20T00:00:00Z',
    '2026-07-20T01:00:00Z',
    '2026-07-21T00:00:00Z'
  );

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.collection_b',
  public.collection_create(
    current_setting('test.workspace')::uuid,
    'Ownership Source B'
  ) #>> '{collection,collection_id}',
  true
);
select set_config(
  'test.collection_empty',
  public.collection_create(
    current_setting('test.workspace')::uuid,
    'Empty Deletion Guard'
  ) #>> '{collection,collection_id}',
  true
);

select public.apply_inventory_transaction(
  current_setting('test.collection_a')::uuid,
  'phase4-owned-a-0001',
  '2026-07-26T12:00:00Z',
  '[{
    "line_id":"preferred",
    "printing_id":"42000000-0000-4000-8000-000000000031",
    "finish":"nonfoil",
    "condition":"near_mint",
    "quantity_delta":2
  },{
    "line_id":"non-oracle",
    "printing_id":"42000000-0000-4000-8000-000000000033",
    "finish":"nonfoil",
    "condition":"near_mint",
    "quantity_delta":8
  }]'::jsonb
);
select public.apply_inventory_transaction(
  current_setting('test.collection_b')::uuid,
  'phase4-owned-b-0001',
  '2026-07-26T12:01:00Z',
  '[{
    "line_id":"alternate",
    "printing_id":"42000000-0000-4000-8000-000000000032",
    "finish":"nonfoil",
    "condition":"lightly_played",
    "quantity_delta":2
  }]'::jsonb
);

select set_config(
  'test.create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Finite Allocation',
    'commander',
    null,
    null,
    '{}'::text[],
    array[
      current_setting('test.collection_a')::uuid,
      current_setting('test.collection_b')::uuid
    ]
  )::text,
  true
);
select set_config(
  'test.deck',
  current_setting('test.create')::jsonb #>> '{deck,deck_id}',
  true
);

select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42000000-0000-4000-8000-000000000021',
  'commander',
  1,
  1,
  '42000000-0000-4000-8000-000000000031',
  'nonfoil'
);
select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42000000-0000-4000-8000-000000000021',
  'mainboard',
  3,
  2,
  '42000000-0000-4000-8000-000000000031',
  'nonfoil'
);
select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42000000-0000-4000-8000-000000000021',
  'sideboard',
  2,
  3,
  '42000000-0000-4000-8000-000000000031',
  'nonfoil'
);
select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42000000-0000-4000-8000-000000000021',
  'maybeboard',
  4,
  4,
  '42000000-0000-4000-8000-000000000031',
  'nonfoil'
);

reset role;
update public.catalog_printings
set active = false
where id = '42000000-0000-4000-8000-000000000032';
select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;

select set_config(
  'test.ownership',
  public.calculate_deck_ownership(
    current_setting('test.deck')::uuid,
    'USD'
  )::text,
  true
);
select is(
  (
    current_setting('test.ownership')::jsonb
      #>> '{summary,required_quantity}'
  )::integer,
  6,
  'required total excludes maybeboard'
);
select is(
  (
    current_setting('test.ownership')::jsonb
      #>> '{summary,allocated_owned_quantity}'
  )::integer,
  4,
  'one shared oracle pool is allocated only once'
);
select is(
  (
    current_setting('test.ownership')::jsonb
      #>> '{summary,missing_quantity}'
  )::integer,
  2,
  'aggregate oracle shortage is exact'
);
select is(
  (
    current_setting('test.ownership')::jsonb
      #>> '{summary,maybeboard_quantity}'
  )::integer,
  4,
  'maybeboard is reported separately'
);
select is(
  (
    select sum(
      (entry ->> 'allocated_owned_quantity')::integer
    )
    from jsonb_array_elements(
      current_setting('test.ownership')::jsonb -> 'entries'
    ) as entries(entry)
  )::integer,
  4,
  'per-entry oracle allocations never duplicate finite copies'
);
select results_eq(
  $$
    select
      entry ->> 'zone',
      (entry #>> '{preferred_printing,allocated_quantity}')::integer
    from jsonb_array_elements(
      current_setting('test.ownership')::jsonb -> 'entries'
    ) as entries(entry)
    where entry ->> 'zone' <> 'maybeboard'
    order by case entry ->> 'zone'
      when 'commander' then 1
      when 'mainboard' then 2
      when 'sideboard' then 3
    end
  $$,
  $$
    values
      ('commander'::text, 1),
      ('mainboard'::text, 1),
      ('sideboard'::text, 0)
  $$,
  'same preferred exact-finish pool is allocated once across zones'
);
select is(
  (
    select sum(
      (entry #>> '{preferred_printing,allocated_quantity}')::integer
    )
    from jsonb_array_elements(
      current_setting('test.ownership')::jsonb -> 'entries'
    ) as entries(entry)
  )::integer,
  2,
  'preferred allocations never exceed exact owned copies'
);
select is(
  current_setting('test.ownership')::jsonb
    #>> '{summary,preferred_value}',
  '15.0000',
  'deck valuation uses exact preferred finish and Scryfall-first price'
);
select is(
  current_setting('test.ownership')::jsonb
    #>> '{summary,missing_acquisition_value}',
  '10.0000',
  'preferred acquisition value uses finite exact-printing shortfall'
);
select is(
  current_setting('test.ownership')::jsonb
    #>> '{summary,price_providers,0}',
  'scryfall',
  'price provider provenance is explicit'
);
select is(
  (
    current_setting('test.ownership')::jsonb
      #>> '{summary,unpriced_missing_quantity}'
  )::integer,
  0,
  'priced preferred shortfalls do not count as unpriced missing quantity'
);
select is(
  (
    current_setting('test.ownership')::jsonb
      #>> '{summary,stale_price_entry_count}'
  )::integer,
  3,
  'stale exact prices are counted without changing their value'
);
select is(
  (
    select max(
      (entry ->> 'available_oracle_quantity')::integer
    )
    from jsonb_array_elements(
      current_setting('test.ownership')::jsonb -> 'entries'
    ) as entries(entry)
  )::integer,
  4,
  'inactive owned printing still contributes to oracle ownership'
);
select set_config(
  'test.list_summary',
  public.deck_list(
    current_setting('test.workspace')::uuid,
    false,
    null,
    40,
    'active'
  )::text,
  true
);
select results_eq(
  $$
    select
      (item ->> 'required_quantity')::integer,
      (item ->> 'maybeboard_quantity')::integer,
      (item ->> 'missing_quantity')::integer
    from jsonb_array_elements(
      current_setting('test.list_summary')::jsonb -> 'items'
    ) as items(item)
    where item ->> 'deck_id' = current_setting('test.deck')
  $$,
  $$
    select
      (
        current_setting('test.ownership')::jsonb
          #>> '{summary,required_quantity}'
      )::integer,
      (
        current_setting('test.ownership')::jsonb
          #>> '{summary,maybeboard_quantity}'
      )::integer,
      (
        current_setting('test.ownership')::jsonb
          #>> '{summary,missing_quantity}'
      )::integer
  $$,
  'set-based deck list summary matches detailed finite ownership analysis'
);

select set_config(
  'test.printings',
  public.deck_card_printings(
    current_setting('test.deck')::uuid,
    '42000000-0000-4000-8000-000000000021',
    null,
    30,
    'USD'
  )::text,
  true
);
select is(
  current_setting('test.printings')::jsonb
    #>> '{items,0,finishes,0,price,provider}',
  'scryfall',
  'printing chooser exposes finish-specific price provenance'
);
select is(
  current_setting('test.printings')::jsonb
    #>> '{items,0,active}',
  'true',
  'printing chooser emits the strict active-state contract'
);
select is(
  current_setting('test.printings')::jsonb
    #>> '{items,0,display_name}',
  'Finite Familiar',
  'printing chooser falls back to oracle name when printed name is absent'
);
select is(
  current_setting('test.printings')::jsonb
    ->> 'catalog_version',
  'catalog-unversioned',
  'printing chooser emits catalog provenance'
);
select is(
  (
    current_setting('test.printings')::jsonb
      #>> '{items,0,finishes,0,owned_quantity}'
  )::integer,
  2,
  'printing chooser exposes exact owned finish quantity'
);
select is(
  jsonb_array_length(
    current_setting('test.printings')::jsonb -> 'items'
  ),
  1,
  'new preferred-printing chooser excludes inactive printings'
);

select set_config(
  'test.sources_empty',
  public.deck_sources_replace(
    current_setting('test.deck')::uuid,
    '{}'::uuid[],
    5
  )::text,
  true
);
select is(
  (
    public.calculate_deck_ownership(
      current_setting('test.deck')::uuid,
      'USD'
    ) #>> '{summary,allocated_owned_quantity}'
  )::integer,
  0,
  'no selected sources yields no owned allocation'
);

select public.deck_sources_replace(
  current_setting('test.deck')::uuid,
  array[
    current_setting('test.collection_b')::uuid
  ],
  6
);
select set_config(
  'test.collection_b_updated_at',
  (
    select updated_at::text
    from public.collections
    where id = current_setting('test.collection_b')::uuid
  ),
  true
);
select public.collection_archive(
  current_setting('test.collection_b')::uuid,
  current_setting('test.collection_b_updated_at')::timestamptz
);
select set_config(
  'test.archived_ownership',
  public.calculate_deck_ownership(
    current_setting('test.deck')::uuid,
    'USD'
  )::text,
  true
);
select is(
  (
    current_setting('test.archived_ownership')::jsonb
      #>> '{summary,allocated_owned_quantity}'
  )::integer,
  2,
  'archived selected source balances remain counted'
);
select is(
  current_setting('test.archived_ownership')::jsonb
    #>> '{source_warnings,0,code}',
  'inventory_source_archived',
  'archived source state is surfaced outside cached validation'
);

select public.deck_sources_replace(
  current_setting('test.deck')::uuid,
  array[
    current_setting('test.collection_empty')::uuid
  ],
  7
);
select is(
  public.collection_detail(
    current_setting('test.collection_empty')::uuid
  ) #>> '{permissions,can_delete}',
  'false',
  'collection detail hides delete while selected by a deck'
);
select throws_ok(
  format(
    $statement$
      select public.collection_delete(
        %L::uuid,
        (
          select updated_at
          from public.collections
          where id = %L::uuid
        )
      )
    $statement$,
    current_setting('test.collection_empty'),
    current_setting('test.collection_empty')
  ),
  '55000',
  'talence_collection_referenced_by_deck',
  'collection delete enforcement matches the capability flag'
);

select set_config(
  'test.cap_create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Preferred Allocation Cap',
    'commander',
    null,
    null,
    '{}'::text[],
    array[current_setting('test.collection_a')::uuid]
  )::text,
  true
);
select set_config(
  'test.cap_deck',
  current_setting('test.cap_create')::jsonb #>> '{deck,deck_id}',
  true
);
select public.deck_entry_add(
  current_setting('test.cap_deck')::uuid,
  '42000000-0000-4000-8000-000000000021',
  'commander',
  2,
  1
);
select public.deck_entry_add(
  current_setting('test.cap_deck')::uuid,
  '42000000-0000-4000-8000-000000000021',
  'mainboard',
  1,
  2,
  '42000000-0000-4000-8000-000000000031',
  'nonfoil'
);
select set_config(
  'test.cap_ownership',
  public.calculate_deck_ownership(
    current_setting('test.cap_deck')::uuid,
    'USD'
  )::text,
  true
);
select is(
  (
    select (
      entry #>> '{preferred_printing,allocated_quantity}'
    )::integer
    from jsonb_array_elements(
      current_setting('test.cap_ownership')::jsonb -> 'entries'
    ) as entries(entry)
    where entry ->> 'zone' = 'mainboard'
  ),
  0,
  'preferred allocation is capped by the row oracle allocation consumed earlier'
);
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      current_setting('test.cap_ownership')::jsonb -> 'entries'
    ) as entries(entry)
    where entry ->> 'zone' <> 'maybeboard'
      and coalesce(
        (
          entry #>> '{preferred_printing,allocated_quantity}'
        )::integer,
        0
      ) > (entry ->> 'allocated_owned_quantity')::integer
  ),
  'every preferred allocation is less than or equal to its finite oracle allocation'
);
select is(
  (
    current_setting('test.cap_ownership')::jsonb
      #>> '{summary,unpriced_missing_quantity}'
  )::integer,
  2,
  'unpriced missing quantity includes requirements without an exact priced preference'
);
reset role;
select is(
  (
    select routine.provolatile::text
    from pg_catalog.pg_proc as routine
    where routine.oid =
      'public.calculate_deck_ownership(uuid,text)'::regprocedure
  ),
  'v',
  'public ownership wrapper remains volatile so row locks are permitted'
);
select is(
  (
    select routine.provolatile::text
    from pg_catalog.pg_proc as routine
    where routine.oid =
      'app_private.calculate_deck_ownership_internal(uuid,text)'
        ::regprocedure
  ),
  's',
  'ownership composition uses one stable statement snapshot'
);
select ok(
  lower(
    pg_get_functiondef(
      'public.calculate_deck_ownership(uuid,text)'::regprocedure
    )
  ) like '%from public.decks as deck%for share%'
  and lower(
    pg_get_functiondef(
      'public.calculate_deck_ownership(uuid,text)'::regprocedure
    )
  ) like '%from public.catalog_state as state%for share%',
  'ownership locks deck then catalog generation before composing results'
);

select * from finish();
rollback;
