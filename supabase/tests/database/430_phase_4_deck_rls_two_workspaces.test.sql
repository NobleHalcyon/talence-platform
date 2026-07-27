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
  '43000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000011',
  'phase4-rls-a@example.test'
);
select pg_temp.create_admitted_user(
  '43000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000012',
  'phase4-rls-b@example.test'
);
select set_config('test.user_a', '43000000-0000-4000-8000-000000000011', true);
select set_config('test.user_b', '43000000-0000-4000-8000-000000000012', true);
select set_config(
  'test.workspace_a',
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = current_setting('test.user_a')::uuid
  ),
  true
);
select set_config(
  'test.workspace_b',
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = current_setting('test.user_b')::uuid
  ),
  true
);
select set_config(
  'test.collection_a',
  (
    select default_collection_id::text
    from public.profiles
    where user_id = current_setting('test.user_a')::uuid
  ),
  true
);
select set_config(
  'test.collection_b',
  (
    select default_collection_id::text
    from public.profiles
    where user_id = current_setting('test.user_b')::uuid
  ),
  true
);
select set_config(
  'test.collection_a_updated_at',
  (
    select updated_at::text
    from public.collections
    where id = current_setting('test.collection_a')::uuid
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
  '43000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000001',
  'fixture',
  'phase4-rls-set',
  'p4r',
  'Phase 4 RLS',
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
  '43000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000001',
  'fixture',
  'phase4-rls-card',
  'Isolation Adept',
  'isolation adept',
  'Creature — Wizard'
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
values (
  '43000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000021',
  '43000000-0000-4000-8000-000000000020',
  'fixture',
  'phase4-rls-print',
  '1',
  'en',
  'Isolation Adept',
  false,
  array['nonfoil'::public.card_finish],
  true
);
insert into public.catalog_legalities (card_id, format_code, legality)
values ('43000000-0000-4000-8000-000000000021', 'modern', 'legal');

select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
set local role authenticated;
select set_config(
  'test.create_a',
  public.deck_create(
    current_setting('test.workspace_a')::uuid,
    'Workspace A Deck',
    'modern',
    null,
    null,
    '{}'::text[],
    array[current_setting('test.collection_a')::uuid]
  )::text,
  true
);
select set_config(
  'test.deck_a',
  current_setting('test.create_a')::jsonb #>> '{deck,deck_id}',
  true
);
select set_config(
  'test.entry_a',
  public.deck_entry_add(
    current_setting('test.deck_a')::uuid,
    '43000000-0000-4000-8000-000000000021',
    'mainboard',
    1,
    1,
    '43000000-0000-4000-8000-000000000031',
    'nonfoil'
  )::text,
  true
);
select set_config(
  'test.validation_a',
  public.validate_deck(current_setting('test.deck_a')::uuid)::text,
  true
);
reset role;

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
select is(
  (select count(*)::integer from public.decks),
  0,
  'nonmember RLS hides decks from another workspace'
);
select is(
  (select count(*)::integer from public.deck_entries),
  0,
  'nonmember RLS hides deck entries from another workspace'
);
select is(
  (select count(*)::integer from public.deck_inventory_sources),
  0,
  'nonmember RLS hides deck inventory sources from another workspace'
);
select is(
  (select count(*)::integer from public.deck_revisions),
  0,
  'nonmember RLS hides immutable revisions from another workspace'
);
select is(
  (select count(*)::integer from public.deck_validation_runs),
  0,
  'nonmember RLS hides validation runs from another workspace'
);
select throws_ok(
  format(
    'select public.deck_detail(%L::uuid)',
    current_setting('test.deck_a')
  ),
  '42501',
  'talence_deck_access_denied',
  'nonmember detail RPC does not leak a foreign deck'
);
select throws_ok(
  format(
    $statement$
      select public.collection_delete(%L::uuid, %L::timestamptz)
    $statement$,
    current_setting('test.collection_a'),
    current_setting('test.collection_a_updated_at')
  ),
  '42501',
  'talence_collection_access_denied',
  'foreign collection deletion checks authorization before deck references'
);
reset role;

insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  status,
  created_by_user_id
)
values (
  current_setting('test.workspace_a')::uuid,
  current_setting('test.user_b')::uuid,
  'viewer',
  'active',
  current_setting('test.user_a')::uuid
);

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
select is(
  (select count(*)::integer from public.decks),
  1,
  'viewer RLS exposes the admitted workspace deck'
);
select is(
  (select count(*)::integer from public.deck_entries),
  1,
  'viewer RLS exposes matching entries'
);
select is(
  (select count(*)::integer from public.deck_inventory_sources),
  1,
  'viewer RLS exposes matching sources'
);
select is(
  (select count(*)::integer from public.deck_revisions),
  2,
  'viewer RLS exposes matching immutable revisions'
);
select is(
  (select count(*)::integer from public.deck_validation_runs),
  1,
  'viewer RLS exposes matching validation history'
);
select is(
  public.deck_detail(current_setting('test.deck_a')::uuid)
    #>> '{deck,permissions,can_edit}',
  'false',
  'viewer detail permissions deny edits'
);
select throws_ok(
  format(
    $statement$
      select public.deck_update(
        %L::uuid,
        'Viewer Write',
        null,
        null,
        '{}'::text[],
        'modern',
        null,
        null,
        2
      )
    $statement$,
    current_setting('test.deck_a')
  ),
  '42501',
  'talence_deck_access_denied',
  'viewer mutation RPC is denied'
);
select is(
  public.validate_deck(current_setting('test.deck_a')::uuid)
    ->> 'validation_run_id',
  current_setting('test.validation_a')::jsonb
    ->> 'validation_run_id',
  'viewer can read/reuse deterministic validation'
);
reset role;

update public.workspace_memberships
set role = 'editor'
where workspace_id = current_setting('test.workspace_a')::uuid
  and user_id = current_setting('test.user_b')::uuid;

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
select set_config(
  'test.editor_update',
  public.deck_update(
    current_setting('test.deck_a')::uuid,
    'Editor Write',
    null,
    null,
    '{}'::text[],
    'modern',
    null,
    null,
    2
  )::text,
  true
);
select is(
  current_setting('test.editor_update')::jsonb #>> '{deck,name}',
  'Editor Write',
  'editor mutation succeeds in the shared workspace'
);
select throws_ok(
  format(
    'select public.deck_delete(%L::uuid, 3)',
    current_setting('test.deck_a')
  ),
  '42501',
  'talence_deck_access_denied',
  'editor cannot perform owner-only deck deletion'
);
select set_config(
  'test.archive',
  public.deck_archive(current_setting('test.deck_a')::uuid, 3)::text,
  true
);
select set_config(
  'test.archived_list',
  public.deck_list(
    current_setting('test.workspace_a')::uuid,
    false,
    null,
    40,
    'archived'
  )::text,
  true
);
select is(
  jsonb_array_length(
    current_setting('test.archived_list')::jsonb -> 'items'
  ),
  1,
  'explicit archived filter reaches archived decks independently of active pagination'
);
select is(
  current_setting('test.archived_list')::jsonb
    #>> '{items,0,permissions,can_restore}',
  'true',
  'archived editor receives an explicit restore capability'
);
select is(
  current_setting('test.archived_list')::jsonb
    #>> '{items,0,permissions,can_edit}',
  'false',
  'archived editor does not receive active-only edit capability'
);
select is(
  current_setting('test.archived_list')::jsonb
    #>> '{items,0,permissions,can_duplicate}',
  'true',
  'archived deck remains duplicable by an editor'
);
select public.deck_restore(current_setting('test.deck_a')::uuid, 4);
reset role;

select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
set local role authenticated;
select throws_ok(
  format(
    $statement$
      select public.deck_sources_replace(
        %L::uuid,
        array[%L::uuid],
        5
      )
    $statement$,
    current_setting('test.deck_a'),
    current_setting('test.collection_b')
  ),
  '23514',
  'talence_deck_source_unavailable',
  'cross-workspace collection source selection is rejected atomically'
);
select is(
  (
    select collection_id::text
    from public.deck_inventory_sources
    where deck_id = current_setting('test.deck_a')::uuid
  ),
  current_setting('test.collection_a'),
  'failed cross-workspace source replacement preserves prior sources'
);
select set_config(
  'test.deleted_create',
  public.deck_create(
    current_setting('test.workspace_a')::uuid,
    'Terminal Deck',
    'modern'
  )::text,
  true
);
select set_config(
  'test.deleted_deck',
  current_setting('test.deleted_create')::jsonb #>> '{deck,deck_id}',
  true
);
select public.deck_delete(current_setting('test.deleted_deck')::uuid, 1);
select is(
  (
    select count(*)::integer
    from public.decks
    where id = current_setting('test.deleted_deck')::uuid
  ),
  0,
  'deleted decks are terminal and invisible through direct RLS reads'
);
select throws_ok(
  format(
    'select public.deck_detail(%L::uuid)',
    current_setting('test.deleted_deck')
  ),
  'P0002',
  'talence_deck_not_found',
  'deleted deck detail returns terminal not-found semantics'
);
reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.deck_formats_list()',
    'EXECUTE'
  ),
  'unauthenticated role has no execute privilege on the deck RPC surface'
);

select * from finish();
rollback;
