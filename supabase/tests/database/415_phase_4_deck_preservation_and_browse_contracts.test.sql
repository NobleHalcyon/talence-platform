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
  '41500000-0000-4000-8000-000000000001',
  '41500000-0000-4000-8000-000000000011',
  'phase4-preservation@example.test'
);
select set_config(
  'test.user',
  '41500000-0000-4000-8000-000000000011',
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
  '41500000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000001',
  'fixture',
  'phase4-preservation-set',
  'p4p',
  'Phase 4 Preservation',
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
values
  (
    '41500000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-preserved-card',
    'Preserved Identity',
    'preserved identity',
    'Creature — Spirit'
  ),
  (
    '41500000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-browser-alpha',
    'Browse Alpha',
    'browse alpha',
    'Creature — Scout'
  ),
  (
    '41500000-0000-4000-8000-000000000023',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-browser-beta',
    'Browse Beta',
    'browse beta',
    'Creature — Scout'
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
    '41500000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000001',
    '41500000-0000-4000-8000-000000000021',
    '41500000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-preserved-print',
    '1',
    'en',
    'Preserved Identity',
    false,
    array['nonfoil'::public.card_finish],
    true
  ),
  (
    '41500000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000001',
    '41500000-0000-4000-8000-000000000022',
    '41500000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-browser-print-a',
    '2',
    'en',
    'Browse Alpha A',
    false,
    array['nonfoil'::public.card_finish],
    true
  ),
  (
    '41500000-0000-4000-8000-000000000033',
    '00000000-0000-4000-8000-000000000001',
    '41500000-0000-4000-8000-000000000022',
    '41500000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-browser-print-b',
    '3',
    'en',
    'Browse Alpha B',
    false,
    array['foil'::public.card_finish],
    false
  );

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.source_create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Preservation Source',
    'modern'
  )::text,
  true
);
select set_config(
  'test.source_deck',
  current_setting('test.source_create')::jsonb #>> '{deck,deck_id}',
  true
);
select set_config(
  'test.source_add',
  public.deck_entry_add(
    current_setting('test.source_deck')::uuid,
    '41500000-0000-4000-8000-000000000021',
    'mainboard',
    4,
    1,
    '41500000-0000-4000-8000-000000000031',
    'nonfoil',
    'Original inactive pin'
  )::text,
  true
);
select public.deck_update(
  current_setting('test.source_deck')::uuid,
  'Preservation Source',
  null,
  null,
  '{}'::text[],
  'modern',
  null,
  '41500000-0000-4000-8000-000000000031',
  2
);
reset role;

update public.catalog_cards
set active = false
where id = '41500000-0000-4000-8000-000000000021';
update public.catalog_printings
set active = false
where id = '41500000-0000-4000-8000-000000000031';

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.preserved_replace',
  public.deck_entries_replace(
    current_setting('test.source_deck')::uuid,
    '[{
      "card_id":"41500000-0000-4000-8000-000000000021",
      "zone":"mainboard",
      "quantity":4,
      "preferred_printing_id":"41500000-0000-4000-8000-000000000031",
      "preferred_finish":"nonfoil",
      "notes":"Original inactive pin"
    }]'::jsonb,
    3
  )::text,
  true
);
select is(
  (
    current_setting('test.preserved_replace')::jsonb
      #>> '{deck,current_revision}'
  )::integer,
  4,
  'bulk replacement preserves the exact saved inactive card/zone/preference row'
);
select set_config(
  'test.preserved_source_entry',
  (
    select id::text
    from public.deck_entries
    where deck_id = current_setting('test.source_deck')::uuid
  ),
  true
);
select throws_ok(
  format(
    $statement$
      select public.deck_entries_replace(
        %L::uuid,
        '[{
          "card_id":"41500000-0000-4000-8000-000000000021",
          "zone":"sideboard",
          "quantity":4,
          "preferred_printing_id":"41500000-0000-4000-8000-000000000031",
          "preferred_finish":"nonfoil"
        }]'::jsonb,
        4
      )
    $statement$,
    current_setting('test.source_deck')
  ),
  '23514',
  'talence_deck_entry_game_mismatch',
  'preservation context cannot introduce an inactive identity into a new zone'
);
select throws_ok(
  format(
    $statement$
      select public.deck_entry_add(
        %L::uuid,
        '41500000-0000-4000-8000-000000000021',
        'sideboard',
        1,
        4
      )
    $statement$,
    current_setting('test.source_deck')
  ),
  '23514',
  'talence_deck_entry_game_mismatch',
  'ordinary add remains closed to inactive catalog identities'
);
select set_config(
  'test.duplicate',
  public.deck_duplicate(
    current_setting('test.source_deck')::uuid,
    4,
    'Preserved Deep Copy'
  )::text,
  true
);
select set_config(
  'test.duplicate_deck',
  current_setting('test.duplicate')::jsonb #>> '{deck,deck_id}',
  true
);
select is(
  (
    select cover_printing_id::text
    from public.decks
    where id = current_setting('test.duplicate_deck')::uuid
  ),
  '41500000-0000-4000-8000-000000000031',
  'deep duplicate preserves an inactive cover pin'
);
select results_eq(
  format(
    $query$
      select
        card_id::text,
        zone::text,
        preferred_printing_id::text,
        preferred_finish::text
      from public.deck_entries
      where deck_id = %L::uuid
    $query$,
    current_setting('test.duplicate_deck')
  ),
  $$
    values (
      '41500000-0000-4000-8000-000000000021'::text,
      'mainboard'::text,
      '41500000-0000-4000-8000-000000000031'::text,
      'nonfoil'::text
    )
  $$,
  'deep duplicate preserves the exact inactive card/zone/preference identity'
);
select isnt(
  (
    select id::text
    from public.deck_entries
    where deck_id = current_setting('test.duplicate_deck')::uuid
  ),
  current_setting('test.preserved_source_entry'),
  'deep duplicate owns independent physical entry rows'
);
reset role;

insert into public.deck_format_versions (
  id,
  format_code,
  version,
  version_key,
  effective_at,
  minimum_mainboard,
  maximum_mainboard,
  minimum_deck_size,
  maximum_deck_size,
  sideboard_max,
  default_copy_limit,
  minimum_commander,
  maximum_commander,
  companion_max,
  companion_consumes_sideboard,
  enforce_color_identity,
  legality_format_code,
  restricted_copy_limit,
  scope_note,
  rules_metadata
)
select
  '41500000-0000-4000-8000-000000000041',
  format_code,
  2,
  'modern-alias-v2',
  statement_timestamp() - interval '1 minute',
  minimum_mainboard,
  maximum_mainboard,
  minimum_deck_size,
  maximum_deck_size,
  sideboard_max,
  default_copy_limit,
  minimum_commander,
  maximum_commander,
  companion_max,
  companion_consumes_sideboard,
  enforce_color_identity,
  'modern_alias',
  restricted_copy_limit,
  scope_note,
  rules_metadata || '{"fixture":"effective"}'::jsonb
from public.deck_format_versions
where id = '40000000-0000-4000-8000-000000000003';
insert into public.deck_format_versions (
  id,
  format_code,
  version,
  version_key,
  effective_at,
  minimum_mainboard,
  maximum_mainboard,
  minimum_deck_size,
  maximum_deck_size,
  sideboard_max,
  default_copy_limit,
  minimum_commander,
  maximum_commander,
  companion_max,
  companion_consumes_sideboard,
  enforce_color_identity,
  legality_format_code,
  restricted_copy_limit,
  scope_note,
  rules_metadata
)
select
  '41500000-0000-4000-8000-000000000042',
  format_code,
  3,
  'modern-future-v3',
  statement_timestamp() + interval '1 day',
  minimum_mainboard,
  maximum_mainboard,
  minimum_deck_size,
  maximum_deck_size,
  sideboard_max,
  default_copy_limit,
  minimum_commander,
  maximum_commander,
  companion_max,
  companion_consumes_sideboard,
  enforce_color_identity,
  'modern_future',
  restricted_copy_limit,
  scope_note,
  rules_metadata || '{"fixture":"future"}'::jsonb
from public.deck_format_versions
where id = '40000000-0000-4000-8000-000000000003';
insert into public.catalog_legalities (card_id, format_code, legality)
values
  ('41500000-0000-4000-8000-000000000022', 'modern_alias', 'banned'),
  ('41500000-0000-4000-8000-000000000023', 'modern_alias', 'legal');

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select is(
  (
    select format -> 'latest_version' ->> 'format_version_id'
    from jsonb_array_elements(
      public.deck_formats_list() -> 'formats'
    ) as formats(format)
    where format ->> 'code' = 'modern'
  ),
  '41500000-0000-4000-8000-000000000041',
  'format list exposes the latest effective version and hides a scheduled future row'
);
select set_config(
  'test.browser_create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Browse Contracts',
    'modern'
  )::text,
  true
);
select set_config(
  'test.browser_deck',
  current_setting('test.browser_create')::jsonb #>> '{deck,deck_id}',
  true
);
select is(
  current_setting('test.browser_create')::jsonb
    #>> '{deck,format_version_id}',
  '41500000-0000-4000-8000-000000000041',
  'new deck pins the latest effective rule version'
);
select set_config(
  'test.search_page',
  public.deck_catalog_search(
    current_setting('test.browser_deck')::uuid,
    null,
    null,
    1
  )::text,
  true
);
select is(
  current_setting('test.search_page')::jsonb
    #>> '{items,0,legality}',
  'banned',
  'catalog search uses the pinned rules legality alias'
);
select is(
  current_setting('test.search_page')::jsonb
    ->> 'catalog_version',
  'catalog-unversioned',
  'empty-query initial browse returns explicit catalog provenance'
);
select ok(
  current_setting('test.search_page')::jsonb
    ->> 'next_cursor' is not null,
  'empty-query initial browse is bounded and cursor-paginated'
);
select public.deck_update(
  current_setting('test.browser_deck')::uuid,
  'Browse Contracts Updated',
  null,
  null,
  '{}'::text[],
  'modern',
  null,
  null,
  1
);
select throws_ok(
  format(
    $statement$
      select public.deck_catalog_search(
        %L::uuid,
        null,
        %L,
        1
      )
    $statement$,
    current_setting('test.browser_deck'),
    current_setting('test.search_page')::jsonb ->> 'next_cursor'
  ),
  '22023',
  'talence_deck_catalog_cursor_invalid',
  'catalog cursor rejects pagination after deck semantic revision changes'
);
select throws_ok(
  format(
    $statement$
      select public.deck_update(
        %L::uuid,
        'Future Pin',
        null,
        null,
        '{}'::text[],
        'modern',
        '41500000-0000-4000-8000-000000000042',
        null,
        2
      )
    $statement$,
    current_setting('test.browser_deck')
  ),
  '22023',
  'talence_deck_format_version_invalid',
  'scheduled future rules cannot be selected before effective_at'
);
select set_config(
  'test.printing_page',
  public.deck_card_printings(
    current_setting('test.browser_deck')::uuid,
    '41500000-0000-4000-8000-000000000022',
    null,
    1,
    'USD'
  )::text,
  true
);
select is(
  current_setting('test.printing_page')::jsonb
    #>> '{items,0,active}',
  'true',
  'printing chooser item includes strict active state'
);
select ok(
  current_setting('test.printing_page')::jsonb
    ->> 'next_cursor' is not null,
  'printing chooser pagination returns a bounded cursor'
);
select public.deck_update(
  current_setting('test.browser_deck')::uuid,
  'Browse Contracts Updated',
  null,
  'Change printing cursor revision',
  '{}'::text[],
  'modern',
  null,
  null,
  2
);
select throws_ok(
  format(
    $statement$
      select public.deck_card_printings(
        %L::uuid,
        '41500000-0000-4000-8000-000000000022',
        %L,
        1,
        'USD'
      )
    $statement$,
    current_setting('test.browser_deck'),
    current_setting('test.printing_page')::jsonb ->> 'next_cursor'
  ),
  '22023',
  'talence_deck_card_printings_cursor_invalid',
  'printing cursor binds deck revision, catalog version, and currency'
);
select is(
  public.deck_export(current_setting('test.browser_deck')::uuid)
    ->> 'catalog_version',
  'catalog-unversioned',
  'stable export includes catalog provenance'
);

select * from finish();
rollback;
