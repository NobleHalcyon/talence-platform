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
  '53000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000011',
  'phase5-rls-a@example.test'
);
select pg_temp.create_admitted_user(
  '53000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000012',
  'phase5-rls-b@example.test'
);

select set_config(
  'test.user_a',
  '53000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.user_b',
  '53000000-0000-4000-8000-000000000012',
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

insert into public.catalog_source_files (
  id,
  provider,
  source_type,
  provider_object_id,
  provider_updated_at,
  download_uri,
  content_type,
  downloaded_size,
  sha256,
  dependency_sha256,
  downloaded_at,
  status
)
values (
  '53000000-0000-4000-8000-000000000020',
  'scryfall',
  'all_cards',
  'phase5-rls-snapshot',
  statement_timestamp() - interval '2 hours',
  'https://data.scryfall.test/phase5-rls-snapshot',
  'application/json',
  100,
  repeat('8', 64),
  repeat('9', 64),
  statement_timestamp() - interval '1 hour 50 minutes',
  'succeeded'
);

select set_config(
  'test.snapshot_version',
  (
    select
      'mtg-'
        || to_char(
          source.provider_updated_at at time zone 'UTC',
          'YYYYMMDD"T"HH24MISS"Z"'
        )
        || '-'
        || left(source.catalog_identity_sha256, 8)
        || '-s1'
    from public.catalog_source_files as source
    where source.id = '53000000-0000-4000-8000-000000000020'
  ),
  true
);

insert into public.catalog_import_runs (
  id,
  source_file_id,
  status,
  trigger_type,
  started_at,
  completed_at,
  records_seen,
  records_written,
  sets_written,
  cards_written,
  printings_written,
  faces_written,
  prices_written,
  worker_version,
  catalog_version,
  validation_summary
)
values (
  '53000000-0000-4000-8000-000000000021',
  '53000000-0000-4000-8000-000000000020',
  'succeeded',
  'fixture',
  statement_timestamp() - interval '1 hour 50 minutes',
  statement_timestamp() - interval '1 hour 49 minutes',
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  'pgTAP/phase-5',
  current_setting('test.snapshot_version'),
  '{"valid":true}'::jsonb
);

insert into public.catalog_snapshots (
  id,
  version,
  catalog_import_id,
  game_id,
  schema_version,
  status,
  storage_bucket,
  storage_path,
  sha256,
  byte_size,
  record_counts,
  minimum_client_version,
  api_contract_version,
  provider_observed_at,
  source_sha256,
  generated_at,
  published_at,
  created_at
)
select
  '53000000-0000-4000-8000-000000000022',
  current_setting('test.snapshot_version'),
  '53000000-0000-4000-8000-000000000021',
  game.id,
  1,
  'succeeded',
  'catalog-snapshots',
  'mtg/'
    || current_setting('test.snapshot_version')
    || '/catalog.sqlite',
  repeat('a', 64),
  4096,
  '{"sets":1,"oracle_cards":0,"printings":0,"faces":0,"prices":0}'
    ::jsonb,
  '0.1.0',
  'v1',
  source.provider_updated_at,
  source.catalog_identity_sha256,
  source.downloaded_at,
  statement_timestamp(),
  statement_timestamp()
from public.games as game
cross join public.catalog_source_files as source
where game.code = 'mtg'
  and source.id = '53000000-0000-4000-8000-000000000020';

insert into public.devices (
  id,
  workspace_id,
  name,
  type,
  manufacturer,
  model,
  serial_number,
  status,
  created_by_user_id
)
values
  (
    '53000000-0000-4000-8000-000000000030',
    current_setting('test.workspace_a')::uuid,
    'Workspace A Device',
    'talence_sorter',
    'Talence',
    'RLS-A',
    'SERIAL-530-A',
    'active',
    current_setting('test.user_a')::uuid
  ),
  (
    '53000000-0000-4000-8000-000000000031',
    current_setting('test.workspace_b')::uuid,
    'Workspace B Device',
    'scanner',
    'Talence',
    'RLS-B',
    'SERIAL-530-B',
    'active',
    current_setting('test.user_b')::uuid
  );

insert into app_private.device_credentials (
  id,
  device_id,
  prefix,
  secret_digest,
  created_by_user_id
)
values
  (
    '53000000-0000-4000-8000-000000000032',
    '53000000-0000-4000-8000-000000000030',
    'dev530prefixa',
    repeat('b', 64),
    current_setting('test.user_a')::uuid
  ),
  (
    '53000000-0000-4000-8000-000000000033',
    '53000000-0000-4000-8000-000000000031',
    'dev530prefixb',
    repeat('c', 64),
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
    '53000000-0000-4000-8000-000000000030',
    current_setting('test.collection_a')::uuid,
    'inventory_read',
    current_setting('test.user_a')::uuid
  ),
  (
    current_setting('test.workspace_b')::uuid,
    '53000000-0000-4000-8000-000000000031',
    current_setting('test.collection_b')::uuid,
    'inventory_read',
    current_setting('test.user_b')::uuid
  );

insert into public.inventory_transactions (
  id,
  workspace_id,
  collection_id,
  source,
  actor_user_id,
  device_id,
  idempotency_key,
  occurred_at,
  committed_at,
  metadata
)
values
  (
    '53000000-0000-4000-8000-000000000040',
    current_setting('test.workspace_a')::uuid,
    current_setting('test.collection_a')::uuid,
    'device',
    null,
    '53000000-0000-4000-8000-000000000030',
    'phase5-rls-ledger-a',
    statement_timestamp() - interval '1 minute',
    statement_timestamp(),
    '{}'::jsonb
  ),
  (
    '53000000-0000-4000-8000-000000000041',
    current_setting('test.workspace_b')::uuid,
    current_setting('test.collection_b')::uuid,
    'device',
    null,
    '53000000-0000-4000-8000-000000000031',
    'phase5-rls-ledger-b',
    statement_timestamp() - interval '1 minute',
    statement_timestamp(),
    '{}'::jsonb
  );

insert into public.device_sync_batches (
  id,
  workspace_id,
  device_id,
  collection_id,
  idempotency_key,
  request_hash,
  catalog_snapshot_id,
  catalog_snapshot_version,
  occurred_at,
  received_at,
  status,
  inventory_transaction_id,
  external_run_id,
  response_code,
  correlation_id,
  result_lines,
  created_at
)
values
  (
    '53000000-0000-4000-8000-000000000042',
    current_setting('test.workspace_a')::uuid,
    '53000000-0000-4000-8000-000000000030',
    current_setting('test.collection_a')::uuid,
    'phase5-rls-batch-a',
    repeat('d', 64),
    '53000000-0000-4000-8000-000000000022',
    current_setting('test.snapshot_version'),
    statement_timestamp() - interval '1 minute',
    statement_timestamp(),
    'committed',
    '53000000-0000-4000-8000-000000000040',
    'rls-run-a',
    'committed',
    '53000000-0000-4000-8000-000000000044',
    '[{"line_id":"a","printing_id":"53000000-0000-4000-8000-000000000050","quantity_before":0,"quantity_after":1}]'
      ::jsonb,
    statement_timestamp()
  ),
  (
    '53000000-0000-4000-8000-000000000043',
    current_setting('test.workspace_b')::uuid,
    '53000000-0000-4000-8000-000000000031',
    current_setting('test.collection_b')::uuid,
    'phase5-rls-batch-b',
    repeat('e', 64),
    '53000000-0000-4000-8000-000000000022',
    current_setting('test.snapshot_version'),
    statement_timestamp() - interval '1 minute',
    statement_timestamp(),
    'committed',
    '53000000-0000-4000-8000-000000000041',
    'rls-run-b',
    'committed',
    '53000000-0000-4000-8000-000000000045',
    '[{"line_id":"b","printing_id":"53000000-0000-4000-8000-000000000051","quantity_before":0,"quantity_after":1}]'
      ::jsonb,
    statement_timestamp()
  );

insert into public.device_run_summaries (
  id,
  workspace_id,
  device_id,
  collection_id,
  idempotency_key,
  external_run_id,
  status,
  catalog_snapshot_id,
  catalog_snapshot_version,
  total_count,
  recognized_count,
  unrecognized_count,
  posted_count,
  started_at,
  completed_at,
  received_at,
  diagnostic_code,
  metadata,
  correlation_id,
  created_at
)
values
  (
    '53000000-0000-4000-8000-000000000046',
    current_setting('test.workspace_a')::uuid,
    '53000000-0000-4000-8000-000000000030',
    current_setting('test.collection_a')::uuid,
    'phase5-rls-summary-a',
    'external-summary-a',
    'completed',
    '53000000-0000-4000-8000-000000000022',
    current_setting('test.snapshot_version'),
    1,
    1,
    0,
    1,
    statement_timestamp() - interval '2 minutes',
    statement_timestamp() - interval '1 minute',
    statement_timestamp(),
    null,
    '{"mode":"local"}'::jsonb,
    '53000000-0000-4000-8000-000000000048',
    statement_timestamp()
  ),
  (
    '53000000-0000-4000-8000-000000000047',
    current_setting('test.workspace_b')::uuid,
    '53000000-0000-4000-8000-000000000031',
    current_setting('test.collection_b')::uuid,
    'phase5-rls-summary-b',
    'external-summary-b',
    'failed',
    '53000000-0000-4000-8000-000000000022',
    current_setting('test.snapshot_version'),
    1,
    0,
    1,
    0,
    statement_timestamp() - interval '2 minutes',
    statement_timestamp() - interval '1 minute',
    statement_timestamp(),
    'not-recognized',
    '{"mode":"local"}'::jsonb,
    '53000000-0000-4000-8000-000000000049',
    statement_timestamp()
  );

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_a'),
  true
);
set local role authenticated;

select is(
  (
    select count(device.id)::integer
    from public.devices as device
  ),
  1,
  'workspace A sees only its device row'
);
select is(
  (
    select min(device.id::text)
    from public.devices as device
  ),
  '53000000-0000-4000-8000-000000000030',
  'workspace A cannot infer workspace B device metadata'
);
select is(
  (
    select count(grant_row.device_id)::integer
    from public.device_collection_grants as grant_row
  ),
  1,
  'workspace A sees only its collection grant'
);
select is(
  (
    select count(batch.id)::integer
    from public.device_sync_batches as batch
  ),
  1,
  'workspace A sees only its safe accepted batch'
);
select is(
  (
    select count(run_summary.id)::integer
    from public.device_run_summaries as run_summary
  ),
  1,
  'workspace A sees only its thin run summary'
);
select is(
  (
    select count(snapshot.id)::integer
    from public.catalog_snapshots as snapshot
  ),
  0,
  'ordinary workspace users cannot directly browse snapshot publication metadata'
);
select throws_ok(
  $$select request_hash from public.device_sync_batches limit 1$$,
  '42501',
  'permission denied for table device_sync_batches',
  'canonical request hashes are not selectable by ordinary users'
);
select throws_ok(
  $$select correlation_id from public.device_run_summaries limit 1$$,
  '42501',
  'permission denied for table device_run_summaries',
  'device correlation IDs are not selectable by ordinary users'
);
select throws_ok(
  format(
    'select public.device_detail(%L::uuid)',
    '53000000-0000-4000-8000-000000000031'
  ),
  'P0002',
  'talence_device_not_found',
  'workspace A cannot read workspace B device through a definer RPC'
);
select throws_ok(
  format(
    'select public.device_list(%L::uuid)',
    current_setting('test.workspace_b')
  ),
  '42501',
  'talence_device_access_denied',
  'workspace A cannot enumerate workspace B devices through a definer RPC'
);
select throws_ok(
  $$select * from app_private.device_credentials$$,
  '42501',
  'permission denied for schema app_private',
  'ordinary users cannot read private credential digests'
);
select throws_ok(
  $$select public.admin_device_feature_policies()$$,
  '42501',
  'talence_platform_admin_required',
  'ordinary users cannot read server feature policies'
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
    select min(device.id::text)
    from public.devices as device
  ),
  '53000000-0000-4000-8000-000000000031',
  'workspace B independently sees only its own device'
);
select is(
  (
    select min(batch.id::text)
    from public.device_sync_batches as batch
  ),
  '53000000-0000-4000-8000-000000000043',
  'workspace B independently sees only its own batch'
);
select is(
  (
    select min(run_summary.id::text)
    from public.device_run_summaries as run_summary
  ),
  '53000000-0000-4000-8000-000000000047',
  'workspace B independently sees only its own run summary'
);

reset role;

select ok(
  not has_table_privilege('anon', 'public.devices', 'SELECT')
    and not has_table_privilege(
      'anon',
      'public.device_sync_batches',
      'SELECT'
    )
    and not has_table_privilege(
      'authenticated',
      'app_private.device_credentials',
      'SELECT'
    )
    and not has_table_privilege(
      'authenticated',
      'public.devices',
      'INSERT'
    ),
  'anonymous reads, private digest reads, and ordinary direct writes are denied'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.device_register(uuid,uuid,text,public.device_type,text,text,text,text,text,timestamptz)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.device_rotate_credential(uuid,uuid,text,text,timestamptz)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.device_register(uuid,uuid,text,public.device_type,text,text,text,text,text,timestamptz)',
      'EXECUTE'
    ),
  'raw-credential administration remains service-only'
);

insert into public.platform_user_roles (user_id, role)
values (
  current_setting('test.user_a')::uuid,
  'platform_admin'
);
select set_config(
  'test.policy_updated_at',
  (
    select policy.updated_at::text
    from app_private.device_feature_policies as policy
    where policy.feature_key = 'device_heartbeat'
  ),
  true
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_a'),
  true
);
set local role authenticated;

select is(
  jsonb_array_length(
    public.admin_device_feature_policies() -> 'items'
  ),
  5,
  'a platform administrator can inspect all device feature guards'
);
select is(
  (
    select count(snapshot.id)::integer
    from public.catalog_snapshots as snapshot
  ),
  1,
  'the snapshot metadata RLS policy is platform-admin-only'
);
select set_config(
  'test.policy_update',
  public.admin_device_feature_policy_update(
    'device_heartbeat',
    false,
    12,
    10000,
    10000,
    16384,
    20,
    current_setting('test.policy_updated_at')::timestamptz
  )::text,
  true
);
select is(
  current_setting('test.policy_update')::jsonb ->> 'enabled',
  'false',
  'platform administrators can update a feature kill switch'
);
select throws_ok(
  format(
    $statement$
      select public.admin_device_feature_policy_update(
        'device_heartbeat',
        true,
        12,
        10000,
        10000,
        16384,
        20,
        %L::timestamptz
      )
    $statement$,
    current_setting('test.policy_updated_at')
  ),
  '40001',
  'talence_device_feature_policy_stale',
  'feature policy updates use optimistic concurrency'
);
select throws_ok(
  format(
    $statement$
      select public.admin_device_feature_policy_update(
        'device_heartbeat',
        true,
        null,
        10000,
        10000,
        16384,
        20,
        %L::timestamptz
      )
    $statement$,
    current_setting('test.policy_update')::jsonb ->> 'updated_at'
  ),
  '22023',
  'talence_device_feature_policy_invalid',
  'feature policy limits reject null values with a stable error'
);

reset role;

select * from finish();

rollback;
