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
  '34000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000011',
  'phase3-rls-a@example.test'
);
select pg_temp.create_admitted_user(
  '34000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000012',
  'phase3-rls-b@example.test'
);

select set_config(
  'test.user_a',
  '34000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.user_b',
  '34000000-0000-4000-8000-000000000012',
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
  '34000000-0000-4000-8000-000000000020',
  game.id,
  'fixture',
  'rls-set',
  'p3r',
  'Phase 3 RLS Set',
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
  '34000000-0000-4000-8000-000000000021',
  game.id,
  'fixture',
  'rls-card',
  'RLS Fixture',
  'rls fixture'
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
  '34000000-0000-4000-8000-000000000022',
  game.id,
  '34000000-0000-4000-8000-000000000021',
  '34000000-0000-4000-8000-000000000020',
  'fixture',
  'rls-printing',
  '1',
  'en',
  'RLS Fixture',
  false,
  array['nonfoil'::public.card_finish],
  true
from public.games as game
where game.code = 'mtg';

select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
set local role authenticated;
select set_config(
  'test.transaction_a',
  public.apply_inventory_transaction(
    current_setting('test.collection_a')::uuid,
    'rls-ledger-a-0001',
    '2026-07-26T14:00:00Z',
    '[{
      "line_id":"a",
      "printing_id":"34000000-0000-4000-8000-000000000022",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":1
    }]'::jsonb
  ) ->> 'transaction_id',
  true
);
select set_config(
  'test.job_a',
  public.inventory_import_create(
    current_setting('test.collection_a')::uuid,
    'workspace-a.csv',
    10,
    repeat('a', 64),
    'phase3-rls',
    'rls-import-a-0002'
  )::text,
  true
);
select public.inventory_import_stage_rows(
  (current_setting('test.job_a')::jsonb ->> 'import_job_id')::uuid,
  '[{
    "row_number":2,
    "set_code":"p3r",
    "collector_number":"1",
    "language":"en",
    "finish":"nonfoil",
    "condition":"near_mint",
    "quantity":1
  }]'::jsonb,
  false
);
insert into storage.objects (
  bucket_id,
  name,
  owner,
  owner_id,
  metadata,
  user_metadata
)
values (
  'inventory-imports',
  current_setting('test.job_a')::jsonb ->> 'storage_path',
  current_setting('test.user_a')::uuid,
  current_setting('test.user_a'),
  '{"size":10,"mimetype":"text/csv"}'::jsonb,
  jsonb_build_object(
    'sha256', repeat('a', 64),
    'import_job_id',
      current_setting('test.job_a')::jsonb ->> 'import_job_id',
    'parser_version', 'phase3-rls'
  )
);
reset role;

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
select set_config(
  'test.transaction_b',
  public.apply_inventory_transaction(
    current_setting('test.collection_b')::uuid,
    'rls-ledger-b-0001',
    '2026-07-26T14:00:00Z',
    '[{
      "line_id":"b",
      "printing_id":"34000000-0000-4000-8000-000000000022",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":2
    }]'::jsonb
  ) ->> 'transaction_id',
  true
);
select set_config(
  'test.job_b',
  public.inventory_import_create(
    current_setting('test.collection_b')::uuid,
    'workspace-b.csv',
    11,
    repeat('b', 64),
    'phase3-rls',
    'rls-import-b-0002'
  )::text,
  true
);
select set_config(
  'test.collection_b_second',
  public.collection_create(
    current_setting('test.workspace_b')::uuid,
    'Workspace B Cursor',
    null,
    null
  ) #>> '{collection,collection_id}',
  true
);
select set_config(
  'test.workspace_b_cursor',
  public.collection_list(
    current_setting('test.workspace_b')::uuid,
    false,
    null,
    1,
    null
  ) ->> 'next_cursor',
  true
);
select public.inventory_import_stage_rows(
  (current_setting('test.job_b')::jsonb ->> 'import_job_id')::uuid,
  '[{
    "row_number":2,
    "set_code":"p3r",
    "collector_number":"1",
    "language":"en",
    "finish":"nonfoil",
    "condition":"near_mint",
    "quantity":1
  }]'::jsonb,
  false
);
insert into storage.objects (
  bucket_id,
  name,
  owner,
  owner_id,
  metadata,
  user_metadata
)
values (
  'inventory-imports',
  current_setting('test.job_b')::jsonb ->> 'storage_path',
  current_setting('test.user_b')::uuid,
  current_setting('test.user_b'),
  '{"size":11,"mimetype":"text/csv"}'::jsonb,
  jsonb_build_object(
    'sha256', repeat('b', 64),
    'import_job_id',
      current_setting('test.job_b')::jsonb ->> 'import_job_id',
    'parser_version', 'phase3-rls'
  )
);

select throws_ok(
  format(
    'select public.collection_detail(%L::uuid)',
    current_setting('test.collection_a')
  ),
  '42501',
  'talence_collection_access_denied',
  'user B cannot read user A collection through a security-definer RPC'
);
select throws_ok(
  format(
    'select public.collection_list(%L::uuid)',
    current_setting('test.workspace_a')
  ),
  '42501',
  'talence_collection_list_denied',
  'user B cannot list user A workspace'
);
select throws_ok(
  format(
    'select public.collection_transaction_lines(%L::uuid, 0, 100)',
    current_setting('test.transaction_a')
  ),
  '42501',
  'talence_collection_access_denied',
  'user B cannot page user A exact transaction deltas'
);
select throws_ok(
  format(
    'select public.inventory_import_preview(%L::uuid, 0, 100)',
    current_setting('test.job_a')::jsonb ->> 'import_job_id'
  ),
  '42501',
  'talence_collection_access_denied',
  'user B cannot inspect user A raw import staging'
);
select is(
  (
    select count(*)::integer
    from storage.objects as object
    where object.bucket_id = 'inventory-imports'
  ),
  1,
  'storage SELECT policy exposes only user B exact authorized object'
);
reset role;

grant select on public.inventory_balances to authenticated;
grant select on public.inventory_transactions to authenticated;
grant select on public.inventory_transaction_lines to authenticated;
grant select on public.inventory_import_jobs to authenticated;
grant select on public.inventory_import_rows to authenticated;

select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
set local role authenticated;
select is(
  (select count(*)::integer from public.inventory_balances),
  1,
  'balance RLS exposes only workspace A'
);
select is(
  (select count(*)::integer from public.inventory_transactions),
  1,
  'transaction-header RLS exposes only workspace A'
);
select is(
  (select count(*)::integer from public.inventory_transaction_lines),
  1,
  'transaction-line RLS exposes only workspace A'
);
select is(
  (select count(*)::integer from public.inventory_import_jobs),
  1,
  'import-job RLS exposes only workspace A to its editor'
);
select is(
  (select count(*)::integer from public.inventory_import_rows),
  1,
  'import-row RLS exposes only workspace A raw staging'
);

select is(
  public.collection_list(
    current_setting('test.workspace_a')::uuid
  ) #>> '{permissions,can_create}',
  'true',
  'workspace owners receive exact list create permission'
);

select throws_ok(
  format(
    $statement$
      insert into storage.objects (
        bucket_id,
        name,
        owner,
        owner_id,
        metadata,
        user_metadata
      )
      values (
        'inventory-imports',
        %L,
        %L::uuid,
        %L,
        '{"size":10,"mimetype":"text/csv"}'::jsonb,
        '{}'::jsonb
      )
    $statement$,
    current_setting('test.workspace_a') || '/wrong/source.csv',
    current_setting('test.user_a'),
    current_setting('test.user_a')
  ),
  '42501',
  'new row violates row-level security policy for table "objects"',
  'storage INSERT denies paths not exactly bound to a job'
);

update storage.objects
set user_metadata = '{"tampered":true}'::jsonb
where bucket_id = 'inventory-imports'
  and name = current_setting('test.job_a')::jsonb ->> 'storage_path';
select is(
  (
    select object.user_metadata ->> 'sha256'
    from storage.objects as object
    where object.bucket_id = 'inventory-imports'
      and object.name =
        current_setting('test.job_a')::jsonb ->> 'storage_path'
  ),
  repeat('a', 64),
  'absence of UPDATE policy leaves immutable source metadata unchanged'
);

select throws_ok(
  format(
    'delete from storage.objects where bucket_id = %L and name = %L',
    'inventory-imports',
    current_setting('test.job_a')::jsonb ->> 'storage_path'
  ),
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'authenticated SQL cannot delete the source object'
);
select is(
  (
    select count(*)::integer
    from storage.objects as object
    where object.bucket_id = 'inventory-imports'
      and object.name =
        current_setting('test.job_a')::jsonb ->> 'storage_path'
  ),
  1,
  'absence of DELETE policy preserves the audit source object'
);

select throws_ok(
  format(
    $statement$
      insert into storage.objects (
        bucket_id,
        name,
        owner,
        owner_id,
        metadata,
        user_metadata
      )
      values (
        'inventory-imports',
        %L,
        %L::uuid,
        %L,
        '{"size":10,"mimetype":"text/csv"}'::jsonb,
        '{"tampered":true}'::jsonb
      )
      on conflict (bucket_id, name)
      do update set user_metadata = excluded.user_metadata
    $statement$,
    current_setting('test.job_a')::jsonb ->> 'storage_path',
    current_setting('test.user_a'),
    current_setting('test.user_a')
  ),
  '42501',
  null,
  'storage upsert cannot overwrite an immutable source object'
);
reset role;

insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  created_by_user_id
)
values (
  current_setting('test.workspace_a')::uuid,
  current_setting('test.user_b')::uuid,
  'viewer',
  current_setting('test.user_a')::uuid
);

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
select is(
  public.collection_list(
    current_setting('test.workspace_a')::uuid
  ) #>> '{permissions,can_create}',
  'false',
  'viewer list permissions hide collection creation'
);
select throws_ok(
  format(
    'select public.collection_list(%L::uuid, false, %L, 1, null)',
    current_setting('test.workspace_a'),
    current_setting('test.workspace_b_cursor')
  ),
  '22023',
  'talence_inventory_cursor_invalid',
  'collection-list cursors are bound to their workspace'
);
select is(
  public.collection_list(
    current_setting('test.workspace_a')::uuid
  ) #>> '{items,0,permissions,can_edit}',
  'false',
  'viewer item permissions hide lifecycle editing'
);
select is(
  public.collection_list(
    current_setting('test.workspace_a')::uuid
  ) #>> '{items,0,permissions,can_delete}',
  'false',
  'viewer item permissions hide deletion'
);
select throws_ok(
  format(
    $statement$
      select public.apply_inventory_transaction(
        %L::uuid,
        'viewer-write-denied-0003',
        '2026-07-26T14:01:00Z',
        '[{
          "line_id":"viewer",
          "printing_id":"34000000-0000-4000-8000-000000000022",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":1
        }]'::jsonb
      )
    $statement$,
    current_setting('test.collection_a')
  ),
  '42501',
  'talence_collection_access_denied',
  'viewer cannot mutate inventory'
);
select throws_ok(
  format(
    'select public.inventory_import_preview(%L::uuid, 0, 100)',
    current_setting('test.job_a')::jsonb ->> 'import_job_id'
  ),
  '42501',
  'talence_collection_access_denied',
  'viewer cannot read raw import rows'
);
select is(
  (
    select count(*)::integer
    from public.inventory_import_jobs
    where workspace_id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'import-job table RLS requires editor even for workspace viewers'
);
select is(
  (
    select count(*)::integer
    from storage.objects as object
    where object.name =
      current_setting('test.job_a')::jsonb ->> 'storage_path'
  ),
  0,
  'raw import object SELECT requires editor rather than viewer'
);
select is(
  (
    select count(*)::integer
    from public.inventory_balances
    where workspace_id = current_setting('test.workspace_a')::uuid
  ),
  1,
  'viewer may read workspace-scoped inventory through RLS'
);

reset role;
set local role anon;
select throws_ok(
  format(
    'select public.collection_detail(%L::uuid)',
    current_setting('test.collection_a')
  ),
  '42501',
  'permission denied for function collection_detail',
  'anonymous sessions cannot call inventory read RPCs'
);
reset role;

select * from finish();
rollback;
