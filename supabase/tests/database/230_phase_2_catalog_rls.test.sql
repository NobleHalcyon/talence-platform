begin;

select plan(14);

create function pg_temp.create_auth_user(
  p_user_id uuid,
  p_email text,
  p_invited_user_id uuid
)
returns void
language sql
set search_path = pg_catalog
as $$
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
    jsonb_build_object('invited_user_id', p_invited_user_id::text),
    statement_timestamp(),
    statement_timestamp()
  )
$$;

insert into app_private.invited_users (id, email, expires_at)
values (
  '91000000-0000-4000-8000-000000000001',
  'catalog-reader@example.test',
  statement_timestamp() + interval '1 day'
);
select pg_temp.create_auth_user(
  '92000000-0000-4000-8000-000000000001',
  'catalog-reader@example.test',
  '91000000-0000-4000-8000-000000000001'
);
select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.finalize_admitted_user();
reset role;

insert into public.catalog_sets (
  id,
  game_id,
  source_provider,
  source_id,
  code,
  name,
  digital,
  active
)
select
  fixture.id,
  game.id,
  'scryfall',
  fixture.id::text,
  fixture.code,
  fixture.name,
  false,
  fixture.active
from public.games as game
cross join (
  values
    (
      '93000000-0000-4000-8000-000000000001'::uuid,
      'act'::text,
      'Active Set'::text,
      true
    ),
    (
      '93000000-0000-4000-8000-000000000002'::uuid,
      'ina'::text,
      'Inactive Set'::text,
      false
    )
) as fixture(id, code, name, active)
where game.code = 'mtg';

insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  colors,
  color_identity,
  active
)
select
  fixture.id,
  game.id,
  'scryfall',
  fixture.id::text,
  fixture.name,
  app_private.normalize_catalog_search_text(fixture.name),
  '{}'::text[],
  '{}'::text[],
  fixture.active
from public.games as game
cross join (
  values
    (
      '94000000-0000-4000-8000-000000000001'::uuid,
      'Active Card'::text,
      true
    ),
    (
      '94000000-0000-4000-8000-000000000002'::uuid,
      'Inactive Card'::text,
      false
    )
) as fixture(id, name, active)
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
  digital,
  finishes,
  is_default_browse,
  active
)
select
  fixture.id,
  game.id,
  fixture.card_id,
  fixture.set_id,
  'scryfall',
  fixture.id::text,
  fixture.collector_number,
  'en',
  false,
  array['nonfoil'::public.card_finish],
  true,
  fixture.active
from public.games as game
cross join (
  values
    (
      '95000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000001'::uuid,
      '93000000-0000-4000-8000-000000000001'::uuid,
      '1'::text,
      true
    ),
    (
      '95000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '93000000-0000-4000-8000-000000000001'::uuid,
      '2'::text,
      true
    ),
    (
      '95000000-0000-4000-8000-000000000003'::uuid,
      '94000000-0000-4000-8000-000000000001'::uuid,
      '93000000-0000-4000-8000-000000000002'::uuid,
      '3'::text,
      true
    ),
    (
      '95000000-0000-4000-8000-000000000004'::uuid,
      '94000000-0000-4000-8000-000000000001'::uuid,
      '93000000-0000-4000-8000-000000000001'::uuid,
      '4'::text,
      false
    )
) as fixture(id, card_id, set_id, collector_number, active)
where game.code = 'mtg';

insert into public.catalog_faces (
  id,
  printing_id,
  face_index,
  name,
  colors
)
values
  (
    '96000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    0,
    'Active Card',
    '{}'::text[]
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000002',
    0,
    'Inactive Card',
    '{}'::text[]
  ),
  (
    '96000000-0000-4000-8000-000000000003',
    '95000000-0000-4000-8000-000000000003',
    0,
    'Inactive Set Card',
    '{}'::text[]
  );

insert into public.current_prices (
  printing_id,
  provider,
  currency,
  finish,
  amount,
  observed_at,
  ingested_at
)
values (
  '95000000-0000-4000-8000-000000000001',
  'scryfall',
  'USD',
  'nonfoil',
  1,
  statement_timestamp(),
  statement_timestamp()
);

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.catalog_sets),
  1,
  'an admitted user sees only active sets'
);
select is(
  (select count(*)::integer from public.catalog_cards),
  1,
  'an admitted user sees only active oracle cards'
);
select is(
  (select count(*)::integer from public.catalog_printings),
  1,
  'printing RLS also requires active card and set parents'
);
select is(
  (select count(*)::integer from public.catalog_faces),
  1,
  'face RLS follows the active admitted printing boundary'
);
select is(
  (
    select count(*)::integer
    from public.catalog_sets
    where id = '93000000-0000-4000-8000-000000000002'
  ),
  0,
  'inactive set identity is hidden'
);
select is(
  (
    select count(*)::integer
    from public.catalog_cards
    where id = '94000000-0000-4000-8000-000000000002'
  ),
  0,
  'inactive card identity is hidden'
);
select throws_ok(
  $$
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
      '93000000-0000-4000-8000-000000000099',
      id,
      'scryfall',
      'unauthorized',
      'bad',
      'Unauthorized',
      false
    from public.games
    where code = 'mtg'
  $$,
  '42501',
  'permission denied for table catalog_sets',
  'ordinary users cannot insert system catalog rows'
);
select throws_ok(
  $$
    update public.catalog_printings
    set collector_number = 'changed'
    where id = '95000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table catalog_printings',
  'ordinary users cannot update system catalog rows'
);
select throws_ok(
  $$select count(*) from public.current_prices$$,
  '42501',
  'permission denied for table current_prices',
  'price table requires the provenance-aware RPC boundary'
);
select throws_ok(
  $$select count(*) from public.catalog_import_runs$$,
  '42501',
  'permission denied for table catalog_import_runs',
  'ordinary users cannot inspect worker operations'
);

reset role;
update public.profiles
set status = 'suspended'
where user_id = '92000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(
  (select count(*)::integer from public.catalog_sets),
  0,
  'a suspended profile loses direct admitted catalog visibility'
);
select throws_ok(
  $$select public.catalog_search(p_query => 'Active Card')$$,
  '42501',
  'talence_admitted_user_required',
  'a suspended profile cannot use catalog RPCs'
);

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.catalog_sets$$,
  '42501',
  'permission denied for table catalog_sets',
  'anonymous users have no catalog table privilege'
);
select throws_ok(
  $$select public.catalog_search(p_query => 'Active Card')$$,
  '42501',
  'permission denied for function catalog_search',
  'anonymous users cannot execute catalog search'
);

select * from finish();

rollback;
