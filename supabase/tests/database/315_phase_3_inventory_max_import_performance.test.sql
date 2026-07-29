begin;

select plan(5);

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
  '31500000-0000-4000-8000-000000000001',
  '31500000-0000-4000-8000-000000000002',
  'phase3-max-import@example.test'
);

select set_config(
  'test.user_id',
  '31500000-0000-4000-8000-000000000002',
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

insert into public.catalog_sets (
  id,
  game_id,
  source_provider,
  source_id,
  code,
  name,
  card_count,
  digital
)
select
  '31500000-0000-4000-8000-000000000010',
  game.id,
  'fixture',
  'max-import-set',
  'p3m',
  'Phase 3 Maximum Import',
  5000,
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
  '31500000-0000-4000-8000-000000000011',
  game.id,
  'fixture',
  'max-import-card',
  'Maximum Import Fixture',
  'maximum import fixture'
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
  (
    '31500000-0000-4000-8000-'
    || lpad(series.number::text, 12, '0')
  )::uuid,
  game.id,
  '31500000-0000-4000-8000-000000000011',
  '31500000-0000-4000-8000-000000000010',
  'fixture',
  'max-import-printing-' || series.number::text,
  series.number::text,
  'en',
  'Maximum Import Fixture ' || series.number::text,
  false,
  array['nonfoil'::public.card_finish],
  series.number = 1
from public.games as game
cross join generate_series(1, 5000) as series(number)
where game.code = 'mtg';

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_id'),
  true
);
set local role authenticated;

select set_config(
  'test.job',
  public.inventory_import_create(
    current_setting('test.collection_id')::uuid,
    'maximum-import.csv',
    1,
    repeat('d', 64),
    'phase3-max-import-v1',
    'max-import-create-0001'
  )::text,
  true
);

reset role;

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
  current_setting('test.job')::jsonb ->> 'storage_path',
  current_setting('test.user_id')::uuid,
  current_setting('test.user_id'),
  '{"size":1,"mimetype":"text/csv"}'::jsonb,
  jsonb_build_object(
    'sha256', repeat('d', 64),
    'import_job_id',
      current_setting('test.job')::jsonb ->> 'import_job_id',
    'parser_version', 'phase3-max-import-v1'
  )
);

insert into public.inventory_import_rows (
  import_job_id,
  workspace_id,
  collection_id,
  row_number,
  raw_data,
  finish,
  condition,
  quantity,
  status,
  resolution_source,
  resolved_printing_id,
  row_hash
)
select
  (
    current_setting('test.job')::jsonb
      ->> 'import_job_id'
  )::uuid,
  current_setting('test.workspace_id')::uuid,
  current_setting('test.collection_id')::uuid,
  series.number + 1,
  jsonb_build_object('fixture_row', series.number),
  'nonfoil'::public.card_finish,
  'near_mint'::public.card_condition,
  1,
  'matched'::public.inventory_import_row_status,
  'scryfall_id',
  (
    '31500000-0000-4000-8000-'
    || lpad(series.number::text, 12, '0')
  )::uuid,
  repeat('e', 64)
from generate_series(1, 5000) as series(number);

update public.inventory_import_jobs
set
  status = 'running'::public.job_status,
  total_rows = 5000,
  matched_rows = 5000,
  staging_completed_at = statement_timestamp()
where id = (
  current_setting('test.job')::jsonb
    ->> 'import_job_id'
)::uuid;

create temporary table max_import_performance (
  result jsonb not null,
  elapsed_milliseconds numeric not null
) on commit drop;
grant insert, select
  on pg_temp.max_import_performance
  to authenticated;

set local role authenticated;

do $$
declare
  v_started_at timestamptz;
  v_result jsonb;
begin
  v_started_at := clock_timestamp();

  v_result := public.inventory_import_commit(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    'max-import-commit-0002',
    date_trunc(
      'milliseconds',
      (
        current_setting('test.job')::jsonb
          ->> 'created_at'
      )::timestamptz
    ),
    'maximum supported import regression fixture'
  );

  set constraints all immediate;

  insert into pg_temp.max_import_performance (
    result,
    elapsed_milliseconds
  )
  values (
    v_result,
    extract(
      epoch from clock_timestamp() - v_started_at
    ) * 1000
  );
end;
$$;

reset role;

select is(
  (
    select result #>> '{totals,line_count}'
    from pg_temp.max_import_performance
  ),
  '5000',
  'the maximum import commits 5,000 distinct normalized lines'
);
select is(
  (
    select count(*)::integer
    from public.inventory_transaction_lines as line
    where line.transaction_id = (
      select (result ->> 'transaction_id')::uuid
      from pg_temp.max_import_performance
    )
  ),
  5000,
  'the maximum import persists all immutable transaction lines'
);
select is(
  (
    select count(*)::integer
    from public.inventory_balances as balance
    where balance.collection_id =
      current_setting('test.collection_id')::uuid
      and balance.quantity = 1
  ),
  5000,
  'the maximum import materializes all exact balances'
);
select is(
  (
    select result ->> 'status'
    from pg_temp.max_import_performance
  ),
  'succeeded',
  'the maximum import reaches its terminal succeeded state atomically'
);
select diag(
  format(
    '5,000-line maximum import commit elapsed: %s ms',
    (
      select round(elapsed_milliseconds, 3)
      from pg_temp.max_import_performance
    )
  )
);
select cmp_ok(
  (
    select elapsed_milliseconds
    from pg_temp.max_import_performance
  ),
  '<',
  5000::numeric,
  'maximum import commit completes within five seconds'
);

select * from finish();

rollback;
