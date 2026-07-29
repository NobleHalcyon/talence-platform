begin;

select no_plan();

select enum_has_labels(
  'public',
  'device_status',
  array['active', 'suspended', 'revoked'],
  'device lifecycle labels match canon'
);
select enum_has_labels(
  'public',
  'device_type',
  array['talence_sorter', 'scanner', 'kiosk', 'third_party'],
  'device types match canon'
);
select enum_has_labels(
  'public',
  'grant_permission',
  array['inventory_read', 'inventory_write', 'run_summary_write'],
  'collection grant permissions are explicit'
);
select enum_has_labels(
  'public',
  'device_run_status',
  array['completed', 'failed', 'cancelled', 'partially_posted'],
  'thin run summary statuses match the device contract'
);

select has_table('public', 'devices', 'workspace devices exist');
select has_table(
  'app_private',
  'device_credentials',
  'credential digests stay private'
);
select has_table(
  'public',
  'device_collection_grants',
  'explicit collection grants exist'
);
select has_table(
  'public',
  'device_sync_batches',
  'immutable sync batches exist'
);
select has_table(
  'public',
  'device_run_summaries',
  'thin run summaries exist'
);
select has_table(
  'public',
  'catalog_snapshots',
  'published snapshot metadata exists'
);
select has_table(
  'app_private',
  'device_feature_policies',
  'private device feature guards exist'
);
select has_table(
  'app_private',
  'device_usage_windows',
  'private device quota windows exist'
);

select has_column(
  'public',
  'device_sync_batches',
  'request_hash',
  'accepted device batches retain the canonical request hash'
);
select has_column(
  'public',
  'device_sync_batches',
  'inventory_transaction_id',
  'device batches project onto the existing inventory ledger'
);
select has_column(
  'public',
  'catalog_state',
  'current_robot_snapshot_id',
  'catalog state owns the published manifest pointer'
);
select has_column(
  'public',
  'devices',
  'last_catalog_snapshot_id',
  'devices retain an installed snapshot reference'
);

select is(
  (
    select count(*)::integer
    from app_private.device_feature_policies
  ),
  5,
  'five device route guards are seeded'
);
select results_eq(
  $$
    select feature_key
    from app_private.device_feature_policies
    order by feature_key
  $$,
  $$
    values
      ('device_heartbeat'::text),
      ('device_inventory_reads'::text),
      ('device_inventory_writes'::text),
      ('device_run_summaries'::text),
      ('snapshot_downloads'::text)
  $$,
  'seeded feature keys cover every dynamic device route class'
);

select is(
  (
    select public
    from storage.buckets
    where id = 'catalog-snapshots'
  ),
  false,
  'the robot snapshot bucket is private'
);
select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'catalog-snapshots'
  ),
  1073741824::bigint,
  'snapshot objects have a practical one-GiB ceiling'
);
select ok(
  (
    select allowed_mime_types @> array[
      'application/vnd.sqlite3',
      'application/x-sqlite3'
    ]::text[]
    from storage.buckets
    where id = 'catalog-snapshots'
  ),
  'snapshot bucket accepts only the configured SQLite/binary MIME set'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        qual like '%catalog-snapshots%'
        or with_check like '%catalog-snapshots%'
      )
  ),
  0,
  'ordinary roles receive no snapshot object policy'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'catalog_snapshots',
        'devices',
        'device_collection_grants',
        'device_sync_batches',
        'device_run_summaries'
      )
      and relation.relrowsecurity
  ),
  5,
  'RLS is enabled on every exposed Phase 5 table'
);

select ok(
  not has_table_privilege('authenticated', 'public.devices', 'INSERT')
  and not has_table_privilege(
    'authenticated',
    'public.device_collection_grants',
    'UPDATE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.device_sync_batches',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.device_run_summaries',
    'DELETE'
  ),
  'ordinary users have no direct Phase 5 write privilege'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.device_sync_batches',
    'request_hash',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.device_sync_batches',
    'correlation_id',
    'SELECT'
  ),
  'request hashes and correlation IDs are excluded from ordinary column grants'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.device_credential_candidate(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.device_credential_candidate(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.device_credential_candidate(text)',
    'EXECUTE'
  ),
  'credential digest lookup is service-only'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema in ('public', 'app_private')
      and table_name in (
        'devices',
        'device_credentials',
        'device_sync_batches',
        'device_run_summaries'
      )
      and column_name ~* '(^raw_|raw_secret|credential_secret$|bearer)'
  ),
  0,
  'no Phase 5 table stores a raw credential'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'devices',
        'device_sync_batches',
        'device_run_summaries'
      )
      and column_name ~* (
        'motion|motor|camera|sensor|bin_occupancy|coordinate|'
        || 'checkpoint|move_event|execution_state'
      )
  ),
  0,
  'cloud device tables contain no robot motion or execution state'
);

select ok(
  app_private.catalog_snapshot_counts_valid(
    '{"sets":1,"oracle_cards":2,"printings":3,"faces":4,"prices":5}'
      ::jsonb
  ),
  'strict five-field snapshot counts validate'
);
select ok(
  not app_private.catalog_snapshot_counts_valid(
    '{"sets":2147483648,"oracle_cards":2,"printings":3,"faces":4,"prices":5}'
      ::jsonb
  ),
  'manifest counts reject values outside safe signed integers'
);
select ok(
  app_private.device_safe_metadata_valid(
    '{"temperature_ok":true,"mode":"idle"}'::jsonb,
    20,
    16384
  ),
  'bounded primitive health metadata is accepted'
);
select ok(
  not app_private.device_safe_metadata_valid(
    '{"executionState":"resume-42","motor-state":"moving"}'::jsonb,
    20,
    16384
  ),
  'camelCase and hyphenated robot execution state is rejected'
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
  '50000000-0000-4000-8000-000000000001',
  'scryfall',
  'all_cards',
  'phase5-snapshot-source',
  '2026-07-27 12:00:00.987654+00',
  'https://data.scryfall.test/phase5-snapshot',
  'application/json',
  100,
  repeat('a', 64),
  repeat('b', 64),
  '2026-07-27 12:05:00+00',
  'succeeded'
);

select set_config(
  'test.snapshot_version',
  (
    select
      'mtg-20260727T120000Z-'
      || left(source.catalog_identity_sha256, 8)
      || '-s1'
    from public.catalog_source_files as source
    where source.id = '50000000-0000-4000-8000-000000000001'
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
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  'succeeded',
  'fixture',
  '2026-07-27 12:05:00+00',
  '2026-07-27 12:10:00+00',
  5,
  5,
  1,
  1,
  1,
  1,
  1,
  'pgTAP/phase-5',
  current_setting('test.snapshot_version'),
  '{"valid":true}'::jsonb
);

update public.catalog_state
set
  active_import_id = '50000000-0000-4000-8000-000000000002',
  active_catalog_version = current_setting('test.snapshot_version'),
  last_successful_source_observed_at = '2026-07-27 12:00:00.987654+00',
  current_search_index_version = current_setting('test.snapshot_version');

select set_config(
  'test.publish_result',
  app_private.catalog_publish_snapshot(
    '50000000-0000-4000-8000-000000000002',
    current_setting('test.snapshot_version'),
    1,
    'mtg/'
      || current_setting('test.snapshot_version')
      || '/catalog.sqlite',
    repeat('c', 64),
    4096,
    '{"sets":1,"oracle_cards":1,"printings":1,"faces":1,"prices":1}'
      ::jsonb,
    '0.1.0',
    '2026-07-27 12:00:00+00',
    'v1'
  )::text,
  true
);

select is(
  current_setting('test.publish_result')::jsonb ->> 'replayed',
  'false',
  'first successful upload metadata publishes one snapshot'
);
select is(
  (
    select state.current_robot_snapshot_id::text
    from public.catalog_state as state
    where state.singleton_id = 1
  ),
  current_setting('test.publish_result')::jsonb
    ->> 'current_snapshot_id',
  'publication advances the manifest pointer atomically'
);
select is(
  (
    select snapshot.storage_path
    from public.catalog_snapshots as snapshot
    where snapshot.id = (
      current_setting('test.publish_result')::jsonb
        ->> 'snapshot_id'
    )::uuid
  ),
  'mtg/'
    || current_setting('test.snapshot_version')
    || '/catalog.sqlite',
  'published metadata retains the exact immutable bucket-relative path'
);
select is(
  (
    select snapshot.provider_observed_at
    from public.catalog_snapshots as snapshot
    where snapshot.id = (
      current_setting('test.publish_result')::jsonb
        ->> 'snapshot_id'
    )::uuid
  ),
  '2026-07-27 12:00:00+00'::timestamptz,
  'snapshot timestamps normalize to catalog-version second precision'
);

select set_config(
  'test.replay_result',
  app_private.catalog_publish_snapshot(
    '50000000-0000-4000-8000-000000000002',
    current_setting('test.snapshot_version'),
    1,
    'mtg/'
      || current_setting('test.snapshot_version')
      || '/catalog.sqlite',
    repeat('c', 64),
    4096,
    '{"sets":1,"oracle_cards":1,"printings":1,"faces":1,"prices":1}'
      ::jsonb,
    '0.1.0',
    '2026-07-27 12:00:00+00',
    'v1'
  )::text,
  true
);
select is(
  current_setting('test.replay_result')::jsonb ->> 'replayed',
  'true',
  'identical publication replay is deterministic'
);
select is(
  current_setting('test.replay_result')::jsonb
    ->> 'previous_snapshot_id',
  null,
  'replay of the only current snapshot does not call itself previous'
);

select throws_ok(
  format(
    $sql$
      select app_private.catalog_publish_snapshot(
        '50000000-0000-4000-8000-000000000002',
        %L,
        1,
        %L,
        %L,
        4096,
        '{"sets":1,"oracle_cards":1,"printings":1,"faces":1,"prices":1}',
        '0.1.0',
        '2026-07-27 12:05:00+00',
        'v1'
      )
    $sql$,
    current_setting('test.snapshot_version'),
    'mtg/'
      || current_setting('test.snapshot_version')
      || '/catalog.sqlite',
    repeat('c', 64)
  ),
  '22023',
  'talence_catalog_snapshot_invalid',
  'snapshot generation time is the deterministic provider observation'
);

select throws_ok(
  format(
    $sql$
      select app_private.catalog_publish_snapshot(
        '50000000-0000-4000-8000-000000000002',
        %L,
        1,
        %L,
        %L,
        4096,
        '{"sets":1,"oracle_cards":1,"printings":1,"faces":1,"prices":1}',
        '0.1.0',
        '2026-07-27 12:00:00+00',
        'v1'
      )
    $sql$,
    current_setting('test.snapshot_version'),
    'mtg/'
      || current_setting('test.snapshot_version')
      || '/catalog.sqlite',
    repeat('d', 64)
  ),
  '23505',
  'talence_catalog_snapshot_replay_conflict',
  'same snapshot version cannot be rebound to different bytes'
);

select throws_ok(
  format(
    $sql$
      update public.catalog_snapshots
      set byte_size = byte_size + 1
      where version = %L
    $sql$,
    current_setting('test.snapshot_version')
  ),
  '55000',
  'talence_device_history_immutable',
  'published snapshot metadata is immutable'
);

update public.catalog_state
set active_catalog_version =
  'mtg-20260727T120001Z-deadbeef-s1'
where singleton_id = 1;

select throws_ok(
  format(
    $sql$
      select app_private.catalog_publish_snapshot(
        '50000000-0000-4000-8000-000000000002',
        %L,
        1,
        %L,
        %L,
        4096,
        '{"sets":1,"oracle_cards":1,"printings":1,"faces":1,"prices":1}',
        '0.1.0',
        '2026-07-27 12:05:00+00',
        'v1'
      )
    $sql$,
    current_setting('test.snapshot_version'),
    'mtg/'
      || current_setting('test.snapshot_version')
      || '/catalog.sqlite',
    repeat('c', 64)
  ),
  '40001',
  'talence_catalog_snapshot_stale',
  'publication rejects a generation that stopped being active'
);

select * from finish();
rollback;
