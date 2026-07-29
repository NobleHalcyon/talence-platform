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
  '42500000-0000-4000-8000-000000000001',
  '42500000-0000-4000-8000-000000000011',
  'phase4-validation@example.test'
);
select set_config(
  'test.user',
  '42500000-0000-4000-8000-000000000011',
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

insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  mana_cost,
  type_line,
  oracle_text,
  color_identity
)
values
  (
    '42500000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-validation-snow',
    'Snow-Covered Validation',
    'snow covered validation',
    null,
    'Basic Snow Land — Plains',
    null,
    array['W']
  ),
  (
    '42500000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-validation-banned',
    'Banned Baseline',
    'banned baseline',
    '{R}',
    'Creature — Rogue',
    null,
    array['R']
  ),
  (
    '42500000-0000-4000-8000-000000000023',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-validation-any',
    'Relentless Validation',
    'relentless validation',
    '{1}',
    'Creature — Rat',
    'A deck can have any number of cards named Relentless Validation.',
    '{}'::text[]
  ),
  (
    '42500000-0000-4000-8000-000000000024',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-validation-bounded',
    'Sevenfold Validation',
    'sevenfold validation',
    '{1}',
    'Creature — Advisor',
    'A deck can have up to seven cards named Sevenfold Validation.',
    '{}'::text[]
  ),
  (
    '42500000-0000-4000-8000-000000000025',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-validation-commander',
    'White Validator',
    'white validator',
    '{W}',
    'Legendary Creature — Advisor',
    null,
    array['W']
  ),
  (
    '42500000-0000-4000-8000-000000000026',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-validation-off-color',
    'Blue Intruder',
    'blue intruder',
    '{U}',
    'Creature — Rogue',
    null,
    array['U']
  );

insert into public.catalog_legalities (card_id, format_code, legality)
values
  ('42500000-0000-4000-8000-000000000021', 'modern', 'legal'),
  ('42500000-0000-4000-8000-000000000022', 'modern', 'banned'),
  ('42500000-0000-4000-8000-000000000023', 'modern', 'legal'),
  ('42500000-0000-4000-8000-000000000024', 'modern', 'legal'),
  ('42500000-0000-4000-8000-000000000025', 'commander', 'legal'),
  ('42500000-0000-4000-8000-000000000026', 'commander', 'legal');

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;

select set_config(
  'test.create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Versioned Validation',
    'modern'
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
  '42500000-0000-4000-8000-000000000021',
  'mainboard',
  60,
  1
);
select set_config(
  'test.banned_main',
  public.deck_entry_add(
    current_setting('test.deck')::uuid,
    '42500000-0000-4000-8000-000000000022',
    'mainboard',
    5,
    2
  )::text,
  true
);
select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42500000-0000-4000-8000-000000000022',
  'sideboard',
  1,
  3
);
select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42500000-0000-4000-8000-000000000023',
  'mainboard',
  10,
  4
);
select public.deck_entry_add(
  current_setting('test.deck')::uuid,
  '42500000-0000-4000-8000-000000000024',
  'mainboard',
  7,
  5
);

select set_config(
  'test.validation_one',
  public.validate_deck(current_setting('test.deck')::uuid)::text,
  true
);
select is(
  current_setting('test.validation_one')::jsonb ->> 'catalog_version',
  'catalog-unversioned',
  'validation pins the explicit unversioned catalog sentinel'
);
select is(
  (
    current_setting('test.validation_one')::jsonb
      #>> '{summary,errors}'
  )::integer,
  2,
  'banned legality and copy limit are deterministic errors'
);
select ok(
  current_setting('test.validation_one')::jsonb @>
    '{"valid":false,"advisory":true}'::jsonb,
  'baseline validation is advisory and reports invalid when errors exist'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('test.validation_one')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'copy_limit'
      and (issue ->> 'card_id')::uuid
        in (
          '42500000-0000-4000-8000-000000000021',
          '42500000-0000-4000-8000-000000000023'
        )
  ),
  0,
  'Basic Snow Land and any-number oracle text are copy-limit exempt'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('test.validation_one')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'copy_exception_not_evaluated'
      and (issue ->> 'card_id')::uuid
        = '42500000-0000-4000-8000-000000000024'
  ),
  1,
  'bounded oracle-text exceptions warn without a false hard failure'
);
select is(
  (
    select issue ->> 'entry_id'
    from jsonb_array_elements(
      current_setting('test.validation_one')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'card_not_legal'
  ),
  current_setting('test.banned_main')::jsonb #>> '{entry,entry_id}',
  'card-wide issues use the deterministic first allocation entry'
);
select is(
  (
    select issue ->> 'zone'
    from jsonb_array_elements(
      current_setting('test.validation_one')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'card_not_legal'
  ),
  'mainboard',
  'representative issue entry and zone come from the same row'
);
select is(
  public.validate_deck(current_setting('test.deck')::uuid)
    ->> 'validation_run_id',
  current_setting('test.validation_one')::jsonb
    ->> 'validation_run_id',
  'same content/rules/catalog tuple reuses the persisted validation run'
);

reset role;
update public.catalog_legalities
set legality = 'legal'
where card_id = '42500000-0000-4000-8000-000000000022'
  and format_code = 'modern';
select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;

select is(
  public.validate_deck(current_setting('test.deck')::uuid)
    ->> 'validation_run_id',
  current_setting('test.validation_one')::jsonb
    ->> 'validation_run_id',
  'mutable legality data cannot rewrite historical validation truth'
);
select set_config(
  'test.update',
  public.deck_update(
    current_setting('test.deck')::uuid,
    'Versioned Validation',
    null,
    'Force a new logical hash',
    '{}'::text[],
    'modern',
    null,
    null,
    6
  )::text,
  true
);
select set_config(
  'test.validation_two',
  public.validate_deck(current_setting('test.deck')::uuid)::text,
  true
);
select isnt(
  current_setting('test.validation_two')::jsonb
    ->> 'validation_run_id',
  current_setting('test.validation_one')::jsonb
    ->> 'validation_run_id',
  'new logical content persists a distinct validation run'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('test.validation_two')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'card_not_legal'
  ),
  0,
  'new validation uses the current legality under its pinned catalog version'
);
select is(
  (
    select count(*)::integer
    from public.deck_validation_runs
    where deck_id = current_setting('test.deck')::uuid
  ),
  2,
  'validation history retains both immutable evaluations'
);
select is(
  public.deck_detail(current_setting('test.deck')::uuid)
    #>> '{validation,validation_run_id}',
  current_setting('test.validation_two')::jsonb
    ->> 'validation_run_id',
  'deck detail composes the matching persisted validation generation'
);
select is(
  public.deck_detail(current_setting('test.deck')::uuid)
    #>> '{deck,format,active}',
  'true',
  'detail exposes active state alongside the pinned rules object'
);

select set_config(
  'test.commander_create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Commander Baseline',
    'commander'
  )::text,
  true
);
select set_config(
  'test.commander_deck',
  current_setting('test.commander_create')::jsonb
    #>> '{deck,deck_id}',
  true
);
select public.deck_entry_add(
  current_setting('test.commander_deck')::uuid,
  '42500000-0000-4000-8000-000000000025',
  'commander',
  1,
  1
);
select public.deck_entry_add(
  current_setting('test.commander_deck')::uuid,
  '42500000-0000-4000-8000-000000000026',
  'mainboard',
  1,
  2
);
select set_config(
  'test.commander_validation',
  public.validate_deck(
    current_setting('test.commander_deck')::uuid
  )::text,
  true
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('test.commander_validation')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'commander_color_identity'
  ),
  1,
  'Commander validation uses the union of configured commander identities'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('test.commander_validation')::jsonb -> 'issues'
    ) as issues(issue)
    where issue ->> 'code' = 'commander_eligibility_not_evaluated'
  ),
  1,
  'Commander eligibility is explicitly advisory rather than overstated'
);

reset role;
select throws_ok(
  format(
    $statement$
      update public.deck_validation_runs
      set result = '{}'::jsonb
      where id = %L::uuid
    $statement$,
    current_setting('test.validation_one')::jsonb
      ->> 'validation_run_id'
  ),
  '55000',
  'talence_deck_validation_run_immutable',
  'persisted validation runs are immutable'
);

select * from finish();
rollback;
