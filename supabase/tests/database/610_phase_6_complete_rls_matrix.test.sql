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
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000011',
  'phase6-rls-a@example.test'
);
select pg_temp.create_admitted_user(
  '61000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000012',
  'phase6-rls-b@example.test'
);

select set_config(
  'test.user_a',
  '61000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.user_b',
  '61000000-0000-4000-8000-000000000012',
  true
);
select set_config(
  'test.workspace_a',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_a')::uuid
  ),
  true
);
select set_config(
  'test.workspace_b',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_b')::uuid
  ),
  true
);
select set_config(
  'test.collection_a',
  (
    select profile.default_collection_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_a')::uuid
  ),
  true
);
select set_config(
  'test.collection_b',
  (
    select profile.default_collection_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_b')::uuid
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
  '61000000-0000-4000-8000-000000000020',
  game.id,
  'fixture',
  'phase6-rls-set',
  'p6r',
  'Phase 6 RLS Set',
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
  '61000000-0000-4000-8000-000000000021',
  game.id,
  'fixture',
  'phase6-rls-card',
  'Phase Six Matrix',
  'phase six matrix'
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
  '61000000-0000-4000-8000-000000000022',
  game.id,
  '61000000-0000-4000-8000-000000000021',
  '61000000-0000-4000-8000-000000000020',
  'fixture',
  'phase6-rls-printing',
  '1',
  'en',
  'Phase Six Matrix',
  false,
  array['nonfoil'::public.card_finish],
  true
from public.games as game
where game.code = 'mtg';

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_a'),
  true
);
set local role authenticated;
select set_config(
  'test.transaction_a',
  public.apply_inventory_transaction(
    current_setting('test.collection_a')::uuid,
    'phase6-rls-inventory-a',
    '2026-07-27T18:00:00Z',
    '[{
      "line_id":"matrix-a",
      "printing_id":"61000000-0000-4000-8000-000000000022",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":1
    }]'::jsonb
  ) ->> 'transaction_id',
  true
);
select set_config(
  'test.import_a',
  public.inventory_import_create(
    current_setting('test.collection_a')::uuid,
    'matrix-a.csv',
    1,
    repeat('a', 64),
    'phase6-matrix',
    'phase6-rls-import-a'
  ) ->> 'import_job_id',
  true
);
select set_config(
  'test.deck_a',
  public.deck_create(
    current_setting('test.workspace_a')::uuid,
    'Workspace A Matrix Deck',
    'commander',
    null,
    null,
    '{}'::text[],
    array[current_setting('test.collection_a')::uuid]
  ) -> 'deck' ->> 'deck_id',
  true
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_b'),
  true
);
set local role authenticated;
select set_config(
  'test.transaction_b',
  public.apply_inventory_transaction(
    current_setting('test.collection_b')::uuid,
    'phase6-rls-inventory-b',
    '2026-07-27T18:00:00Z',
    '[{
      "line_id":"matrix-b",
      "printing_id":"61000000-0000-4000-8000-000000000022",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":2
    }]'::jsonb
  ) ->> 'transaction_id',
  true
);
select set_config(
  'test.import_b',
  public.inventory_import_create(
    current_setting('test.collection_b')::uuid,
    'matrix-b.csv',
    1,
    repeat('b', 64),
    'phase6-matrix',
    'phase6-rls-import-b'
  ) ->> 'import_job_id',
  true
);
select set_config(
  'test.deck_b',
  public.deck_create(
    current_setting('test.workspace_b')::uuid,
    'Workspace B Matrix Deck',
    'commander',
    null,
    null,
    '{}'::text[],
    array[current_setting('test.collection_b')::uuid]
  ) -> 'deck' ->> 'deck_id',
  true
);
reset role;

insert into public.devices (
  id,
  workspace_id,
  name,
  type,
  serial_number,
  status,
  created_by_user_id
)
values
  (
    '61000000-0000-4000-8000-000000000030',
    current_setting('test.workspace_a')::uuid,
    'Workspace A Matrix Device',
    'scanner',
    'P6-MATRIX-A',
    'active',
    current_setting('test.user_a')::uuid
  ),
  (
    '61000000-0000-4000-8000-000000000031',
    current_setting('test.workspace_b')::uuid,
    'Workspace B Matrix Device',
    'scanner',
    'P6-MATRIX-B',
    'active',
    current_setting('test.user_b')::uuid
  );

insert into public.device_collection_grants (
  workspace_id,
  device_id,
  collection_id,
  permission,
  granted_by_user_id
)
values
  (
    current_setting('test.workspace_a')::uuid,
    '61000000-0000-4000-8000-000000000030',
    current_setting('test.collection_a')::uuid,
    'inventory_read',
    current_setting('test.user_a')::uuid
  ),
  (
    current_setting('test.workspace_b')::uuid,
    '61000000-0000-4000-8000-000000000031',
    current_setting('test.collection_b')::uuid,
    'inventory_read',
    current_setting('test.user_b')::uuid
  );

select app_private.record_audit_event(
  current_setting('test.user_a')::uuid,
  'security.matrix',
  'succeeded',
  current_setting('test.workspace_a')::uuid,
  'device',
  '61000000-0000-4000-8000-000000000030',
  '61000000-0000-4000-8000-000000000040',
  '{"fixture":"workspace-a"}'::jsonb
);
select app_private.record_audit_event(
  current_setting('test.user_b')::uuid,
  'security.matrix',
  'succeeded',
  current_setting('test.workspace_b')::uuid,
  'device',
  '61000000-0000-4000-8000-000000000031',
  '61000000-0000-4000-8000-000000000041',
  '{"fixture":"workspace-b"}'::jsonb
);

select ok(
  (
    select bool_and(relation.relrowsecurity)
    from (
      values
        ('profiles'),
        ('platform_user_roles'),
        ('workspaces'),
        ('workspace_memberships'),
        ('workspace_invitations'),
        ('user_preferences'),
        ('games'),
        ('collections'),
        ('catalog_sets'),
        ('catalog_cards'),
        ('catalog_printings'),
        ('catalog_faces'),
        ('catalog_legalities'),
        ('catalog_external_ids'),
        ('catalog_source_files'),
        ('catalog_import_runs'),
        ('catalog_state'),
        ('current_prices'),
        ('inventory_import_jobs'),
        ('inventory_transactions'),
        ('inventory_transaction_lines'),
        ('inventory_balances'),
        ('inventory_import_rows'),
        ('deck_formats'),
        ('deck_format_versions'),
        ('decks'),
        ('deck_entries'),
        ('deck_inventory_sources'),
        ('deck_revisions'),
        ('deck_validation_runs'),
        ('catalog_snapshots'),
        ('devices'),
        ('device_collection_grants'),
        ('device_sync_batches'),
        ('device_run_summaries'),
        ('audit_events')
    ) as expected(table_name)
    join pg_catalog.pg_namespace as namespace
      on namespace.nspname = 'public'
    join pg_catalog.pg_class as relation
      on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name
  ),
  'every exposed application table has row-level security enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.roles && array['anon', 'public']::name[]
      and policy.tablename in (
        'profiles',
        'platform_user_roles',
        'workspaces',
        'workspace_memberships',
        'workspace_invitations',
        'user_preferences',
        'games',
        'collections',
        'catalog_sets',
        'catalog_cards',
        'catalog_printings',
        'catalog_faces',
        'catalog_legalities',
        'catalog_external_ids',
        'catalog_source_files',
        'catalog_import_runs',
        'catalog_state',
        'current_prices',
        'inventory_import_jobs',
        'inventory_transactions',
        'inventory_transaction_lines',
        'inventory_balances',
        'inventory_import_rows',
        'deck_formats',
        'deck_format_versions',
        'decks',
        'deck_entries',
        'deck_inventory_sources',
        'deck_revisions',
        'deck_validation_runs',
        'catalog_snapshots',
        'devices',
        'device_collection_grants',
        'device_sync_batches',
        'device_run_summaries',
        'audit_events'
      )
  ),
  'no exposed application table has an anonymous or public RLS policy'
);

-- Inventory tables intentionally have no ordinary SELECT grant because reads
-- use bounded RPCs. A transaction-local test grant isolates the RLS layer
-- itself and is rolled back with this matrix.
grant select on table public.inventory_import_jobs to authenticated;
grant select on table public.inventory_transactions to authenticated;
grant select on table public.inventory_transaction_lines to authenticated;
grant select on table public.inventory_balances to authenticated;
grant select on table public.inventory_import_rows to authenticated;

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_a'),
  true
);
set local role authenticated;

select is(
  (
    select jsonb_build_object(
      'profiles', (select count(*) from public.profiles),
      'workspaces', (select count(*) from public.workspaces),
      'memberships', (select count(*) from public.workspace_memberships),
      'collections', (select count(*) from public.collections),
      'imports', (select count(*) from public.inventory_import_jobs),
      'transactions', (select count(*) from public.inventory_transactions),
      'balances', (select count(*) from public.inventory_balances),
      'decks', (select count(*) from public.decks),
      'deck_sources', (select count(*) from public.deck_inventory_sources),
      'deck_revisions', (select count(*) from public.deck_revisions),
      'devices', (select count(*) from public.devices),
      'device_grants', (select count(*) from public.device_collection_grants)
    )
  ),
  '{
    "profiles":1,
    "workspaces":1,
    "memberships":1,
    "collections":1,
    "imports":1,
    "transactions":1,
    "balances":1,
    "decks":1,
    "deck_sources":1,
    "deck_revisions":1,
    "devices":1,
    "device_grants":1
  }'::jsonb,
  'workspace A sees exactly its identity, inventory, deck, and device roots'
);
select is(
  (
    select min(transaction.id::text)
    from public.inventory_transactions as transaction
  ),
  current_setting('test.transaction_a'),
  'workspace A sees only its immutable transaction'
);
select is(
  (
    select min(deck.id::text)
    from public.decks as deck
  ),
  current_setting('test.deck_a'),
  'workspace A sees only its deck'
);
select is(
  (
    select min(device.id::text)
    from public.devices as device
  ),
  '61000000-0000-4000-8000-000000000030',
  'workspace A sees only its device'
);
select throws_ok(
  format(
    'select public.collection_detail(%L::uuid)',
    current_setting('test.collection_b')
  ),
  '42501',
  'talence_collection_access_denied',
  'workspace B collection is hidden through collection definer RPCs'
);
select throws_ok(
  format(
    'select public.deck_detail(%L::uuid)',
    current_setting('test.deck_b')
  ),
  '42501',
  'talence_deck_access_denied',
  'workspace B deck is hidden through deck definer RPCs'
);
select throws_ok(
  format(
    'select public.device_detail(%L::uuid)',
    '61000000-0000-4000-8000-000000000031'
  ),
  'P0002',
  'talence_device_not_found',
  'workspace B device is hidden through device definer RPCs'
);
select throws_ok(
  format(
    $statement$
      select public.device_grants_replace(
        '61000000-0000-4000-8000-000000000030',
        jsonb_build_array(
          jsonb_build_object(
            'collection_id', %L::uuid,
            'permissions', jsonb_build_array('inventory_read')
          )
        )
      )
    $statement$,
    current_setting('test.collection_b')
  ),
  '23514',
  'talence_device_grant_collection_invalid',
  'a cross-workspace device grant is rejected'
);
select is(
  (
    select count(event.id)::integer
    from public.audit_events as event
  ),
  0,
  'ordinary workspace owners cannot read platform audit events'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_b'),
  true
);
set local role authenticated;

select is(
  (
    select min(transaction.id::text)
    from public.inventory_transactions as transaction
  ),
  current_setting('test.transaction_b'),
  'workspace B independently sees only its immutable transaction'
);
select is(
  (
    select min(deck.id::text)
    from public.decks as deck
  ),
  current_setting('test.deck_b'),
  'workspace B independently sees only its deck'
);
select is(
  (
    select min(device.id::text)
    from public.devices as device
  ),
  '61000000-0000-4000-8000-000000000031',
  'workspace B independently sees only its device'
);
select throws_ok(
  format(
    'select public.collection_inventory_page(%L::uuid)',
    current_setting('test.collection_a')
  ),
  '42501',
  'talence_collection_access_denied',
  'workspace A inventory is denied through the bounded inventory RPC'
);

reset role;

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT')
    and not has_table_privilege('anon', 'public.catalog_printings', 'SELECT')
    and not has_table_privilege('anon', 'public.collections', 'SELECT')
    and not has_table_privilege('anon', 'public.inventory_balances', 'SELECT')
    and not has_table_privilege('anon', 'public.decks', 'SELECT')
    and not has_table_privilege('anon', 'public.devices', 'SELECT')
    and not has_table_privilege('anon', 'public.audit_events', 'SELECT'),
  'anonymous callers have no direct application-data grants'
);

select * from finish();

rollback;
