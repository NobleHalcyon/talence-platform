begin;

select no_plan();

select ok(
  pg_get_functiondef(
    'public.apply_device_inventory_batch(uuid,uuid,uuid,uuid,text,text,timestamptz,text,jsonb,jsonb,integer)'
      ::regprocedure
  ) like '%talence.device.inventory:%'
    and pg_get_functiondef(
      'public.apply_device_inventory_batch(uuid,uuid,uuid,uuid,text,text,timestamptz,text,jsonb,jsonb,integer)'
        ::regprocedure
    ) like '%pg_advisory_xact_lock%',
  'device-wide idempotency is locked before the public receipt lookup'
);
select ok(
  pg_get_functiondef(
    'public.device_api_create_run_summary(uuid,uuid,uuid,text,text,uuid,public.device_run_status,text,timestamptz,timestamptz,jsonb,text,jsonb,integer)'
      ::regprocedure
  ) like '%talence.device.run.idempotency:%'
    and pg_get_functiondef(
      'public.device_api_create_run_summary(uuid,uuid,uuid,text,text,uuid,public.device_run_status,text,timestamptz,timestamptz,jsonb,text,jsonb,integer)'
        ::regprocedure
    ) like '%talence.device.run.external:%',
  'run first use locks both idempotency and external identities'
);

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

create function pg_temp.publish_snapshot_fixture(
  p_source_id uuid,
  p_import_id uuid,
  p_provider_object_id text,
  p_provider_observed_at timestamptz,
  p_downloaded_at timestamptz,
  p_source_sha text,
  p_dependency_sha text,
  p_artifact_sha text
)
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_version text;
begin
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
    p_source_id,
    'scryfall',
    'all_cards',
    p_provider_object_id,
    p_provider_observed_at,
    'https://data.scryfall.test/' || p_provider_object_id,
    'application/json',
    1024,
    p_source_sha,
    p_dependency_sha,
    p_downloaded_at,
    'succeeded'
  );

  select
    'mtg-'
      || to_char(
        source.provider_updated_at at time zone 'UTC',
        'YYYYMMDD"T"HH24MISS"Z"'
      )
      || '-'
      || left(source.catalog_identity_sha256, 8)
      || '-s1'
  into v_version
  from public.catalog_source_files as source
  where source.id = p_source_id;

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
    p_import_id,
    p_source_id,
    'succeeded',
    'fixture',
    p_downloaded_at,
    p_downloaded_at + interval '1 minute',
    5,
    5,
    1,
    1,
    2,
    0,
    1,
    'pgTAP/phase-5',
    v_version,
    '{"valid":true}'::jsonb
  );

  update public.catalog_state
  set
    active_import_id = p_import_id,
    active_catalog_version = v_version,
    last_successful_source_observed_at = p_provider_observed_at,
    current_search_index_version = v_version
  where singleton_id = 1;

  perform app_private.catalog_publish_snapshot(
    p_import_id,
    v_version,
    1,
    'mtg/' || v_version || '/catalog.sqlite',
    p_artifact_sha,
    8192,
    '{"sets":1,"oracle_cards":1,"printings":2,"faces":0,"prices":1}'
      ::jsonb,
    '0.1.0',
    date_trunc('second', p_provider_observed_at),
    'v1'
  );

  return v_version;
end;
$$;

select pg_temp.create_admitted_user(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000011',
  'phase5-device-api@example.test'
);
select set_config(
  'test.user_id',
  '52000000-0000-4000-8000-000000000011',
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
  'test.collection_id',
  (
    select profile.default_collection_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_id')::uuid
  ),
  true
);
select set_config(
  'test.occurred_at',
  (statement_timestamp() - interval '2 minutes')::text,
  true
);
select set_config(
  'test.run_started_at',
  (statement_timestamp() - interval '3 minutes')::text,
  true
);
select set_config(
  'test.run_completed_at',
  (statement_timestamp() - interval '2 minutes')::text,
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
  '52000000-0000-4000-8000-000000000020',
  game.id,
  'fixture',
  'phase5-device-set',
  'p5d',
  'Phase 5 Device Set',
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
  '52000000-0000-4000-8000-000000000021',
  game.id,
  'fixture',
  'phase5-device-card',
  'Device API Fixture',
  'device api fixture'
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
  is_default_browse,
  active
)
select
  fixture.id,
  game.id,
  '52000000-0000-4000-8000-000000000021',
  '52000000-0000-4000-8000-000000000020',
  'fixture',
  fixture.source_id,
  fixture.collector_number,
  'en',
  fixture.printed_name,
  false,
  array['nonfoil'::public.card_finish],
  fixture.active,
  fixture.active
from public.games as game
cross join (
  values
    (
      '52000000-0000-4000-8000-000000000022'::uuid,
      'phase5-device-printing-active',
      '1',
      'Device API Active',
      true
    ),
    (
      '52000000-0000-4000-8000-000000000023'::uuid,
      'phase5-device-printing-inactive',
      '2',
      'Device API Inactive',
      false
    )
) as fixture(id, source_id, collector_number, printed_name, active)
where game.code = 'mtg';

select set_config(
  'test.snapshot_old',
  pg_temp.publish_snapshot_fixture(
    '52000000-0000-4000-8000-000000000030',
    '52000000-0000-4000-8000-000000000031',
    'phase5-device-snapshot-old',
    statement_timestamp() - interval '3 hours',
    statement_timestamp() - interval '2 hours 50 minutes',
    repeat('1', 64),
    repeat('2', 64),
    repeat('3', 64)
  ),
  true
);

set local role service_role;

select set_config(
  'test.registration',
  public.device_register(
    current_setting('test.user_id')::uuid,
    current_setting('test.workspace_id')::uuid,
    'Device API Station',
    'talence_sorter',
    'Talence',
    'API-1',
    'SERIAL-520',
    'dev520prefixa',
    repeat('4', 64),
    null
  )::text,
  true
);

reset role;
select set_config(
  'test.device_id',
  current_setting('test.registration')::jsonb #>> '{device,device_id}',
  true
);
select set_config(
  'test.credential_id',
  current_setting('test.registration')::jsonb
    #>> '{credential,credential_id}',
  true
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_id'),
  true
);
set local role authenticated;
select public.device_grants_replace(
  current_setting('test.device_id')::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'collection_id',
      current_setting('test.collection_id')::uuid,
      'permissions',
      jsonb_build_array(
        'inventory_read',
        'inventory_write',
        'run_summary_write'
      )
    )
  )
);

reset role;
set local role service_role;

select is(
  public.device_credential_candidate('unknownprefix1'),
  null::jsonb,
  'unknown credential prefixes reveal no lookup detail'
);
select is(
  public.device_credential_candidate('dev520prefixa')
    ->> 'secret_digest',
  repeat('4', 64),
  'service-only prefix lookup returns the digest candidate'
);
select is(
  public.device_auth_touch(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000040'
  ) ->> 'device_id',
  current_setting('test.device_id'),
  'post-HMAC authentication touch revalidates the credential'
);
select is(
  public.device_api_me(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000041',
    512
  ) #>> '{grants,0,permissions,2}',
  'run_summary_write',
  'device identity reports its explicit collection grants'
);

select is(
  public.device_api_heartbeat(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000042',
    '0.1.0',
    '1.0.0',
    current_setting('test.snapshot_old'),
    '{"temperature_ok":true,"mode":"idle"}'::jsonb,
    512
  ) ->> 'accepted',
  'true',
  'bounded health heartbeat is accepted'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_heartbeat(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000043',
        '0.1.0',
        '1.0.0',
        %L,
        '{"motion_plan":"move-left"}'::jsonb,
        512
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.snapshot_old')
  ),
  '22023',
  'talence_device_heartbeat_invalid',
  'heartbeat rejects robot motion state'
);

select is(
  public.device_api_catalog_manifest(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000044',
    current_setting('test.snapshot_old'),
    '0.1.0',
    array[1],
    512
  ) ->> 'up_to_date',
  'true',
  'manifest reports when the installed retained snapshot is current'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_catalog_manifest(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000045',
        null,
        '0.1.0',
        array[2],
        512
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id')
  ),
  '55000',
  'talence_catalog_snapshot_incompatible',
  'manifest rejects unsupported snapshot schema versions'
);

select set_config(
  'test.batch_first',
  public.apply_device_inventory_batch(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000046',
    current_setting('test.collection_id')::uuid,
    'phase5-device-batch-0001',
    current_setting('test.snapshot_old'),
    current_setting('test.occurred_at')::timestamptz,
    'external-run-520-a',
    '[
      {
        "line_id":"line-a",
        "printing_id":"52000000-0000-4000-8000-000000000022",
        "finish":"nonfoil",
        "condition":"near_mint",
        "quantity_delta":1
      },
      {
        "line_id":"line-b",
        "printing_id":"52000000-0000-4000-8000-000000000022",
        "finish":"nonfoil",
        "condition":"near_mint",
        "quantity_delta":2
      }
    ]'::jsonb,
    '{"source":"fixture"}'::jsonb,
    2048
  )::text,
  true
);

select ok(
  current_setting('test.batch_first')::jsonb ->> 'replayed' = 'false'
    and jsonb_array_length(
      current_setting('test.batch_first')::jsonb -> 'lines'
    ) = 2
    and current_setting('test.batch_first')::jsonb
      #>> '{lines,0,line_id}' = 'line-a'
    and current_setting('test.batch_first')::jsonb
      #>> '{lines,1,line_id}' = 'line-b',
  'duplicate balance tuples expand back to every original line ID in order'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.inventory_transaction_lines as line
    where line.transaction_id = (
      current_setting('test.batch_first')::jsonb
        ->> 'transaction_id'
    )::uuid
  ),
  1,
  'duplicate tuples produce one immutable Phase 3 ledger line'
);
select is(
  (
    select balance.quantity
    from public.inventory_balances as balance
    where balance.collection_id =
      current_setting('test.collection_id')::uuid
      and balance.printing_id =
        '52000000-0000-4000-8000-000000000022'
      and balance.finish = 'nonfoil'
      and balance.condition = 'near_mint'
  ),
  3,
  'the device batch updates the existing inventory balance atomically'
);
select ok(
  (
    select batch.request_hash ~ '^[a-f0-9]{64}$'
    from public.device_sync_batches as batch
    where batch.id = (
      current_setting('test.batch_first')::jsonb ->> 'batch_id'
    )::uuid
  )
    and exists (
      select 1
      from app_private.inventory_operation_requests as request
      where request.operation_type = 'apply'
        and request.principal_kind = 'device'
        and request.principal_id =
          current_setting('test.device_id')::uuid
        and request.idempotency_key = 'phase5-device-batch-0001'
        and (
          current_setting('test.batch_first')::jsonb
            ->> 'transaction_id'
        )::uuid = any(request.transaction_ids)
    ),
  'accepted mutation retains both public and private immutable receipts'
);

set local role service_role;

select set_config(
  'test.batch_replay',
  public.apply_device_inventory_batch(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000047',
    current_setting('test.collection_id')::uuid,
    'phase5-device-batch-0001',
    current_setting('test.snapshot_old'),
    current_setting('test.occurred_at')::timestamptz,
    'external-run-520-a',
    '[
      {
        "line_id":"line-a",
        "printing_id":"52000000-0000-4000-8000-000000000022",
        "finish":"nonfoil",
        "condition":"near_mint",
        "quantity_delta":1
      },
      {
        "line_id":"line-b",
        "printing_id":"52000000-0000-4000-8000-000000000022",
        "finish":"nonfoil",
        "condition":"near_mint",
        "quantity_delta":2
      }
    ]'::jsonb,
    '{"source":"fixture"}'::jsonb,
    2048
  )::text,
  true
);
select ok(
  current_setting('test.batch_replay')::jsonb ->> 'replayed' = 'true'
    and current_setting('test.batch_replay')::jsonb
      ->> 'batch_id' = current_setting('test.batch_first')::jsonb
      ->> 'batch_id'
    and current_setting('test.batch_replay')::jsonb
      ->> 'transaction_id' = current_setting('test.batch_first')::jsonb
      ->> 'transaction_id',
  'identical device batch replay returns the original receipt'
);

select throws_ok(
  format(
    $statement$
      select public.apply_device_inventory_batch(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000048',
        %L::uuid,
        'phase5-device-batch-0001',
        %L,
        %L::timestamptz,
        'external-run-520-a',
        '[{
          "line_id":"line-a",
          "printing_id":"52000000-0000-4000-8000-000000000022",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":4
        }]'::jsonb,
        '{"source":"fixture"}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.occurred_at')
  ),
  '23505',
  'talence_device_idempotency_conflict',
  'same device idempotency key with a different canonical body conflicts'
);

select throws_ok(
  format(
    $statement$
      select public.apply_device_inventory_batch(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000049',
        %L::uuid,
        'phase5-device-batch-unknown',
        %L,
        %L::timestamptz,
        null,
        '[{
          "line_id":"unknown",
          "printing_id":"52000000-0000-4000-8000-000000000099",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":1
        }]'::jsonb,
        '{}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.occurred_at')
  ),
  '23503',
  'talence_catalog_printing_unknown',
  'unknown printing IDs reject the entire batch'
);

select throws_ok(
  format(
    $statement$
      select public.apply_device_inventory_batch(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000050',
        %L::uuid,
        'phase5-device-batch-inactive',
        %L,
        %L::timestamptz,
        null,
        '[{
          "line_id":"inactive-negative",
          "printing_id":"52000000-0000-4000-8000-000000000023",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity_delta":-1
        }]'::jsonb,
        '{}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.occurred_at')
  ),
  '23503',
  'talence_catalog_printing_unknown',
  'inactive printings are rejected even for negative deltas'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.device_sync_batches
    where device_id = current_setting('test.device_id')::uuid
  ),
  1,
  'replays and invalid batches do not create extra public receipts'
);
select is(
  (
    select count(*)::integer
    from public.inventory_transactions
    where device_id = current_setting('test.device_id')::uuid
  ),
  1,
  'replays and invalid batches do not create extra ledger transactions'
);

select set_config(
  'test.snapshot_new',
  pg_temp.publish_snapshot_fixture(
    '52000000-0000-4000-8000-000000000032',
    '52000000-0000-4000-8000-000000000033',
    'phase5-device-snapshot-new',
    statement_timestamp() - interval '1 hour',
    statement_timestamp() - interval '50 minutes',
    repeat('5', 64),
    repeat('6', 64),
    repeat('7', 64)
  ),
  true
);

set local role service_role;
select is(
  public.apply_device_inventory_batch(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000051',
    current_setting('test.collection_id')::uuid,
    'phase5-device-batch-retained',
    current_setting('test.snapshot_old'),
    current_setting('test.occurred_at')::timestamptz,
    null,
    '[{
      "line_id":"retained",
      "printing_id":"52000000-0000-4000-8000-000000000022",
      "finish":"nonfoil",
      "condition":"near_mint",
      "quantity_delta":1
    }]'::jsonb,
    '{}'::jsonb,
    1024
  ) ->> 'replayed',
  'false',
  'a retained published snapshot remains valid after a newer publication'
);
select is(
  jsonb_array_length(
    public.device_api_inventory_page(
      current_setting('test.device_id')::uuid,
      current_setting('test.credential_id')::uuid,
      '52000000-0000-4000-8000-000000000052',
      current_setting('test.collection_id')::uuid,
      null,
      10,
      512
    ) -> 'items'
  ),
  1,
  'inventory read returns the granted collection balance'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_inventory_page(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000062',
        %L::uuid,
        null,
        null,
        512
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id')
  ),
  '22023',
  'talence_device_inventory_page_invalid',
  'a null inventory-page limit cannot bypass the bounded read'
);

select set_config(
  'test.run_first',
  public.device_api_create_run_summary(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000053',
    'phase5-run-summary-0001',
    'external-run-summary-520',
    current_setting('test.collection_id')::uuid,
    'partially_posted',
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at')::timestamptz,
    current_setting('test.run_completed_at')::timestamptz,
    '{"total":10,"recognized":9,"unrecognized":1,"posted":8}'::jsonb,
    'one-unrecognized',
    '{"mode":"local"}'::jsonb,
    1024
  )::text,
  true
);
select is(
  current_setting('test.run_first')::jsonb ->> 'replayed',
  'false',
  'first thin run summary is accepted'
);
select is(
  public.device_api_create_run_summary(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000054',
    'phase5-run-summary-0001',
    'external-run-summary-520',
    current_setting('test.collection_id')::uuid,
    'partially_posted',
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at')::timestamptz,
    current_setting('test.run_completed_at')::timestamptz,
    '{"total":10,"recognized":9,"unrecognized":1,"posted":8}'::jsonb,
    'one-unrecognized',
    '{"mode":"local"}'::jsonb,
    1024
  ) ->> 'replayed',
  'true',
  'run-summary idempotency replay returns the original receipt'
);
select is(
  public.device_api_create_run_summary(
    current_setting('test.device_id')::uuid,
    current_setting('test.credential_id')::uuid,
    '52000000-0000-4000-8000-000000000055',
    'phase5-run-summary-0002',
    'external-run-summary-520',
    current_setting('test.collection_id')::uuid,
    'partially_posted',
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at')::timestamptz,
    current_setting('test.run_completed_at')::timestamptz,
    '{"total":10,"recognized":9,"unrecognized":1,"posted":8}'::jsonb,
    'one-unrecognized',
    '{"mode":"local"}'::jsonb,
    1024
  ) ->> 'run_summary_id',
  current_setting('test.run_first')::jsonb ->> 'run_summary_id',
  'external run identity replays across a different idempotency key'
);

select throws_ok(
  format(
    $statement$
      select public.device_api_create_run_summary(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000056',
        'phase5-run-summary-0001',
        'external-run-summary-520',
        %L::uuid,
        'partially_posted',
        %L,
        %L::timestamptz,
        %L::timestamptz,
        '{"total":11,"recognized":10,"unrecognized":1,"posted":8}'::jsonb,
        'one-unrecognized',
        '{"mode":"local"}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at'),
    current_setting('test.run_completed_at')
  ),
  '23505',
  'talence_device_idempotency_conflict',
  'changed run body conflicts on the same idempotency key'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_create_run_summary(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000057',
        'phase5-run-summary-0003',
        'external-run-summary-520',
        %L::uuid,
        'completed',
        %L,
        %L::timestamptz,
        %L::timestamptz,
        '{"total":10,"recognized":10,"unrecognized":0,"posted":10}'::jsonb,
        null,
        '{}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at'),
    current_setting('test.run_completed_at')
  ),
  '23505',
  'talence_device_run_conflict',
  'same external run identity cannot be rebound to a different summary'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_create_run_summary(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000058',
        'phase5-run-summary-invalid',
        'external-run-invalid',
        %L::uuid,
        'completed',
        %L,
        %L::timestamptz,
        %L::timestamptz,
        '{"total":9,"recognized":9,"unrecognized":1,"posted":9}'::jsonb,
        null,
        '{}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at'),
    current_setting('test.run_completed_at')
  ),
  '22023',
  'talence_device_run_summary_invalid',
  'run count arithmetic is enforced'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_create_run_summary(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000059',
        'phase5-run-summary-motion',
        'external-run-motion',
        %L::uuid,
        'completed',
        %L,
        %L::timestamptz,
        %L::timestamptz,
        '{"total":1,"recognized":1,"unrecognized":0,"posted":1}'::jsonb,
        null,
        '{"motor_state":"moving"}'::jsonb,
        1024
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id'),
    current_setting('test.collection_id'),
    current_setting('test.snapshot_old'),
    current_setting('test.run_started_at'),
    current_setting('test.run_completed_at')
  ),
  '22023',
  'talence_device_run_summary_invalid',
  'thin run summaries reject robot execution state'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.device_run_summaries
    where device_id = current_setting('test.device_id')::uuid
  ),
  1,
  'run replay and invalid submissions create no duplicate summaries'
);
select throws_ok(
  format(
    'update public.device_run_summaries set posted_count = 0 where id = %L::uuid',
    current_setting('test.run_first')::jsonb ->> 'run_summary_id'
  ),
  '55000',
  'talence_device_history_immutable',
  'accepted run summaries are immutable'
);

update app_private.device_feature_policies
set enabled = false
where feature_key = 'device_heartbeat';
set local role service_role;
select throws_ok(
  format(
    $statement$
      select public.device_api_heartbeat(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000060',
        '0.1.0',
        null,
        null,
        '{}'::jsonb,
        128
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id')
  ),
  '55000',
  'talence_device_feature_disabled',
  'server-side feature policy acts as a device-route kill switch'
);

reset role;
update app_private.device_feature_policies
set enabled = true
where feature_key = 'device_heartbeat';

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_id'),
  true
);
set local role authenticated;
select public.device_set_status(
  current_setting('test.device_id')::uuid,
  'suspended',
  (
    public.device_detail(
      current_setting('test.device_id')::uuid
    ) #>> '{device,updated_at}'
  )::timestamptz
);

reset role;
set local role service_role;
select is(
  public.device_credential_candidate('dev520prefixa'),
  null::jsonb,
  'credential candidate lookup hides suspended devices'
);
select throws_ok(
  format(
    $statement$
      select public.device_api_me(
        %L::uuid,
        %L::uuid,
        '52000000-0000-4000-8000-000000000061',
        128
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.credential_id')
  ),
  '42501',
  'talence_device_credential_invalid',
  'every device operation independently revalidates suspension'
);

reset role;

select * from finish();

rollback;
