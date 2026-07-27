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
  '33000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000002',
  'phase3-import@example.test'
);
select set_config(
  'test.user_id',
  '33000000-0000-4000-8000-000000000002',
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
  digital
)
select
  '33000000-0000-4000-8000-000000000010',
  game.id,
  'scryfall',
  '33000000-0000-4000-8000-000000000010',
  'p3i',
  'Phase 3 Import Set',
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
  '33000000-0000-4000-8000-000000000011',
  game.id,
  'scryfall',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '=Formula Card',
  'formula card'
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
  rarity,
  digital,
  finishes,
  is_default_browse
)
select
  fixture.id,
  game.id,
  '33000000-0000-4000-8000-000000000011',
  '33000000-0000-4000-8000-000000000010',
  'scryfall',
  fixture.source_id,
  fixture.collector_number,
  'en',
  '=Formula Card',
  fixture.rarity,
  false,
  array['nonfoil'::public.card_finish],
  fixture.id = '33000000-0000-4000-8000-000000000020'
from public.games as game
cross join (
  values
    (
      '33000000-0000-4000-8000-000000000020'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '+7',
      'rare'
    ),
    (
      '33000000-0000-4000-8000-000000000021'::uuid,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '8',
      'uncommon'
    )
) as fixture(id, source_id, collector_number, rarity)
where game.code = 'mtg';

insert into public.current_prices (
  printing_id,
  provider,
  currency,
  finish,
  amount,
  observed_at,
  ingested_at,
  stale_after
)
values (
  '33000000-0000-4000-8000-000000000020',
  'scryfall',
  'USD',
  'nonfoil',
  2.0000,
  '2026-07-26T08:00:00Z',
  '2026-07-26T08:05:00Z',
  '2026-08-02T08:00:00Z'
);

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
    'sparse-formula.csv',
    123,
    repeat('a', 64),
    'phase3-fixture-v1',
    'import-create-0001'
  )::text,
  true
);

select throws_ok(
  format(
    $statement$
      select public.inventory_import_stage_rows(
        %L::uuid,
        '[{
          "row_number":2,
          "scryfall_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "finish":"nonfoil",
          "condition":"near_mint",
          "quantity":2
        }]'::jsonb,
        true
      )
    $statement$,
    current_setting('test.job')::jsonb ->> 'import_job_id'
  ),
  '55000',
  'talence_inventory_import_source_object_invalid',
  'staging cannot complete without the exact uploaded source object'
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
  '{"size":123,"mimetype":"text/csv"}'::jsonb,
  jsonb_build_object(
    'sha256', repeat('a', 64),
    'import_job_id',
      current_setting('test.job')::jsonb ->> 'import_job_id',
    'parser_version', 'phase3-fixture-v1'
  )
);

set local role authenticated;

select is(
  public.inventory_import_stage_rows(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 2,
        'scryfall_id',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity', 2
      ),
      jsonb_build_object(
        'row_number', 4,
        'set_code', 'p3i',
        'collector_number', '+7',
        'language', 'en',
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity', 3
      ),
      jsonb_build_object(
        'row_number', 10,
        'name', '=Formula Card',
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity', 4
      )
    ),
    false
  ) #>> '{job,total_rows}',
  '3',
  'the first resumable sparse staging chunk succeeds'
);

select is(
  public.inventory_import_stage_rows(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 20,
        'scryfall_id',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'set_code', 'p3i',
        'collector_number', '+7',
        'language', 'en',
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity', 5
      ),
      jsonb_build_object(
        'row_number', 30,
        'name', repeat('x', 600),
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity', 1
      ),
      jsonb_build_object(
        'row_number', 31,
        'set_code', 'p3i',
        'collector_number', '8',
        'language', 'en',
        'finish', 'nonfoil',
        'condition', 'near_mint',
        'quantity', 1
      )
    ),
    true
  ) #>> '{job,total_rows}',
  '6',
  'completion accepts unique ordered sparse physical row numbers'
);

select set_config(
  'test.preview_first',
  public.inventory_import_preview(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    0,
    2
  )::text,
  true
);
select is(
  current_setting('test.preview_first')::jsonb
    ->> 'next_after_row_number',
  '4',
  'sparse preview next cursor is the last persisted row'
);
select is(
  current_setting('test.preview_first')::jsonb
    ->> 'previous_after_row_number',
  null,
  'the first sparse preview page has no previous cursor'
);

select set_config(
  'test.preview_second',
  public.inventory_import_preview(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    4,
    2
  )::text,
  true
);
select is(
  current_setting('test.preview_second')::jsonb
    #>> '{items,0,row_number}',
  '10',
  'the second sparse page resumes without overlap or skip'
);
select is(
  current_setting('test.preview_second')::jsonb
    ->> 'previous_after_row_number',
  '0',
  'the previous sparse cursor is derived from persisted ordering'
);
select is(
  jsonb_array_length(
    current_setting('test.preview_second')::jsonb
      #> '{items,0,candidates}'
  ),
  2,
  'name-only review returns rich bounded candidate descriptors'
);
select is(
  current_setting('test.preview_second')::jsonb
    #>> '{items,0,suggested_printing_ids,0}',
  '33000000-0000-4000-8000-000000000020',
  'name candidates are deterministic by internal printing ID'
);
select is(
  current_setting('test.preview_second')::jsonb
    #>> '{items,1,error_code}',
  'scryfall_id_not_found',
  'a bad explicit Scryfall ID is rejected without fallback'
);

select set_config(
  'test.preview_third',
  public.inventory_import_preview(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    20,
    2
  )::text,
  true
);
select is(
  current_setting('test.preview_third')::jsonb
    #>> '{items,0,error_code}',
  'field_too_long',
  'a bounded but semantically oversized cell becomes a rejected row'
);
select is(
  current_setting('test.preview_third')::jsonb
    #>> '{items,1,status}',
  'matched',
  'an oversized peer does not abort the staging chunk'
);
select is(
  current_setting('test.preview_third')::jsonb
    ->> 'previous_after_row_number',
  '4',
  'third-page previous navigation remains exact across gaps'
);

select set_config(
  'test.error_page',
  public.inventory_import_error_report(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    20,
    1
  )::text,
  true
);
select is(
  current_setting('test.error_page')::jsonb
    ->> 'previous_after_row_number',
  '10',
  'error-report previous cursor uses filtered persisted ordering'
);
select ok(
  not (
    current_setting('test.error_page')::jsonb
      #> '{items,0}'
  ) ? 'candidates'
  and pg_column_size(
    current_setting('test.error_page')::jsonb
  ) < 16384,
  'error reports stay lightweight and omit rich candidate payloads'
);

select is(
  public.inventory_import_resolve_row(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    10,
    'match',
    '33000000-0000-4000-8000-000000000021'
  ) #>> '{job,ambiguous_rows}',
  '0',
  'manual review resolves ambiguity to an explicit printing'
);

reset role;
update public.inventory_import_jobs
set purge_after = statement_timestamp()
where id = (
  current_setting('test.job')::jsonb
    ->> 'import_job_id'
)::uuid;
set local role authenticated;

select set_config(
  'test.commit',
  public.inventory_import_commit(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    'import-commit-0002',
    date_trunc(
      'milliseconds',
      (
        current_setting('test.job')::jsonb
          ->> 'created_at'
      )::timestamptz
    ),
    'commit sparse fixture'
  )::text,
  true
);
select is(
  current_setting('test.commit')::jsonb ->> 'status',
  'succeeded',
  'a ready import commits atomically'
);
select is(
  current_setting('test.commit')::jsonb
    #>> '{totals,line_count}',
  '2',
  'matched rows aggregate to exact printing/finish/condition lines'
);
select is(
  current_setting('test.commit')::jsonb ->> 'occurred_at',
  current_setting('test.job')::jsonb ->> 'created_at',
  'the ledger uses the locked microsecond job creation timestamp'
);
select is(
  public.inventory_import_commit(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    'import-commit-0002',
    date_trunc(
      'milliseconds',
      (
        current_setting('test.job')::jsonb
          ->> 'created_at'
      )::timestamptz
    ),
    'commit sparse fixture'
  ) ->> 'replayed',
  'true',
  'identical import commit replay returns the immutable transaction'
);
select throws_ok(
  format(
    $statement$
      select public.inventory_import_commit(
        %L::uuid,
        'import-commit-different-0003',
        %L::timestamptz,
        'commit sparse fixture'
      )
    $statement$,
    current_setting('test.job')::jsonb ->> 'import_job_id',
    date_trunc(
      'milliseconds',
      (
        current_setting('test.job')::jsonb
          ->> 'created_at'
      )::timestamptz
    )
  ),
  '55000',
  'talence_inventory_import_already_committed',
  'a succeeded job cannot commit under a different key'
);

select set_config(
  'test.summary',
  public.calculate_collection_summary(
    current_setting('test.collection_id')::uuid,
    'USD'
  )::text,
  true
);
select is(
  current_setting('test.summary')::jsonb ->> 'quantity_total',
  '10',
  'summary includes only matched additive rows'
);
select is(
  current_setting('test.summary')::jsonb ->> 'priced_quantity',
  '5',
  'exact-finish priced quantity is explicit'
);
select is(
  current_setting('test.summary')::jsonb ->> 'unpriced_quantity',
  '5',
  'unpriced quantity remains explicit'
);
select is(
  current_setting('test.summary')::jsonb ->> 'estimated_value',
  '10.0000',
  'missing prices never become zero in estimated value'
);
select is(
  (
    jsonb_path_query_first(
      current_setting('test.summary')::jsonb,
      '$.value_tiers.items[*] ? (@.tier_code == "1_to_5").quantity_total'
    ) #>> '{}'
  ),
  '5',
  'the exact [1,5) value tier receives the priced quantity'
);
select is(
  (
    jsonb_path_query_first(
      current_setting('test.summary')::jsonb,
      '$.value_tiers.items[*] ? (@.tier_code == "unpriced").quantity_total'
    ) #>> '{}'
  ),
  '5',
  'the unpriced value tier is separate'
);
select is(
  current_setting('test.summary')::jsonb
    #>> '{price_providers,0}',
  'scryfall',
  'summary exposes price provider provenance'
);

select set_config(
  'test.inventory_cursor',
  public.collection_inventory_page(
    current_setting('test.collection_id')::uuid,
    null,
    null,
    null,
    null,
    'name',
    null,
    1,
    'USD'
  ) ->> 'next_cursor',
  true
);
select throws_ok(
  format(
    $statement$
      select public.collection_inventory_page(
        %L::uuid,
        'Formula',
        null,
        null,
        null,
        'name',
        %L,
        1,
        'USD'
      )
    $statement$,
    current_setting('test.collection_id'),
    current_setting('test.inventory_cursor')
  ),
  '22023',
  'talence_inventory_cursor_invalid',
  'inventory cursors are bound to normalized filters and currency'
);

select set_config(
  'test.export',
  public.collection_inventory_export(
    current_setting('test.collection_id')::uuid,
    null,
    10
  )::text,
  true
);
select is(
  current_setting('test.export')::jsonb
    #>> '{items,0,scryfall_id}',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'export emits provider Scryfall identity, not internal UUID'
);
select is(
  current_setting('test.export')::jsonb
    #>> '{items,0,collector_number}',
  '+7',
  'export preserves raw canonical formula-leading collector text'
);
select is(
  current_setting('test.export')::jsonb
    #>> '{items,0,name}',
  '=Formula Card',
  'export preserves raw canonical formula-leading display text'
);
select is(
  current_setting('test.preview_first')::jsonb
    #>> '{items,0,resolved_printing_id}',
  '33000000-0000-4000-8000-000000000020',
  'provider source ID resolves even when internal UUID differs'
);
select is(
  public.collection_analytics(
    current_setting('test.collection_id')::uuid,
    null,
    null,
    null,
    null,
    'USD'
  ) ->> 'quantity_total',
  '10',
  'analytics totals do not multiply inventory across dimensions'
);
select is(
  public.collection_analytics(
    current_setting('test.collection_id')::uuid,
    'Formula',
    'P3I',
    'nonfoil',
    'near_mint',
    'USD'
  ) ->> 'quantity_total',
  '10',
  'analytics applies the same normalized query and exact filters'
);
select is(
  public.collection_analytics(
    current_setting('test.collection_id')::uuid,
    'Formula',
    'p3i',
    'nonfoil',
    'damaged',
    'USD'
  ) ->> 'quantity_total',
  '0',
  'a nonmatching analytical filter excludes every balance'
);
select is(
  (
    select coalesce(sum((item ->> 'quantity')::integer), 0)::text
    from jsonb_array_elements(
      public.collection_inventory_page(
        current_setting('test.collection_id')::uuid,
        'Formula',
        'P3I',
        'nonfoil',
        'near_mint',
        'name',
        null,
        100,
        'USD'
      ) -> 'items'
    ) as item
  ),
  public.collection_analytics(
    current_setting('test.collection_id')::uuid,
    'Formula',
    'P3I',
    'nonfoil',
    'near_mint',
    'USD'
  ) ->> 'quantity_total',
  'structured and analytical views total the same filtered balances'
);
select throws_ok(
  format(
    $statement$
      select public.collection_analytics(
        %L::uuid,
        'x',
        null,
        null,
        null,
        'USD'
      )
    $statement$,
    current_setting('test.collection_id')
  ),
  '22023',
  'talence_collection_inventory_filter_invalid',
  'analytics validates filters with the structured inventory contract'
);

select set_config(
  'test.export_cursor',
  public.collection_inventory_export(
    current_setting('test.collection_id')::uuid,
    null,
    1
  ) ->> 'next_cursor',
  true
);
select set_config(
  'test.export_other_collection',
  public.collection_create(
    current_setting('test.workspace_id')::uuid,
    'Export Cursor Scope',
    null,
    null
  ) #>> '{collection,collection_id}',
  true
);
select throws_ok(
  format(
    'select public.collection_inventory_export(%L::uuid, %L, 1)',
    current_setting('test.export_other_collection'),
    current_setting('test.export_cursor')
  ),
  '22023',
  'talence_inventory_cursor_invalid',
  'export cursors are bound to their collection and currency'
);

reset role;

select throws_ok(
  format(
    'select public.inventory_import_mark_purged(%L::uuid, statement_timestamp())',
    current_setting('test.job')::jsonb ->> 'import_job_id'
  ),
  '55000',
  'talence_inventory_import_storage_delete_required',
  'retention cannot mark a job purged while its exact object remains'
);
select is(
  (
    public.inventory_import_retention_candidates(
      statement_timestamp(),
      100
    ) #>> '{items,0,import_job_id}'
  ),
  current_setting('test.job')::jsonb ->> 'import_job_id',
  'terminal due jobs expose exact storage deletion coordinates'
);

set local session_replication_role = replica;
delete from storage.objects
where bucket_id = 'inventory-imports'
  and name = current_setting('test.job')::jsonb ->> 'storage_path';
set local session_replication_role = origin;
select is(
  public.inventory_import_mark_purged(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    statement_timestamp()
  ) ->> 'staged_rows_deleted',
  '6',
  'retention deletes bounded staging only after object deletion'
);
select is(
  public.inventory_import_mark_purged(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    statement_timestamp()
  ) ->> 'replayed',
  'true',
  'retention completion is idempotent'
);

set local role authenticated;
select is(
  public.inventory_import_commit(
    (
      current_setting('test.job')::jsonb
        ->> 'import_job_id'
    )::uuid,
    'import-commit-0002',
    date_trunc(
      'milliseconds',
      (
        current_setting('test.job')::jsonb
          ->> 'created_at'
      )::timestamptz
    ),
    'commit sparse fixture'
  ) ->> 'replayed',
  'true',
  'commit replay survives staged-row and source-object retention'
);

select set_config(
  'test.empty_collection',
  public.collection_create(
    current_setting('test.workspace_id')::uuid,
    'Import Lifecycle Guard',
    null,
    null
  ) #>> '{collection,collection_id}',
  true
);
select set_config(
  'test.queued_job',
  public.inventory_import_create(
    current_setting('test.empty_collection')::uuid,
    'queued.csv',
    10,
    repeat('b', 64),
    'phase3-fixture-v1',
    'import-create-queued-0004'
  )::text,
  true
);
select is(
  public.collection_detail(
    current_setting('test.empty_collection')::uuid
  ) #>> '{permissions,can_delete}',
  'false',
  'collection permissions block delete while an import is nonterminal'
);
select throws_ok(
  format(
    'select public.collection_delete(%L::uuid, %L::timestamptz)',
    current_setting('test.empty_collection'),
    public.collection_detail(
      current_setting('test.empty_collection')::uuid
    ) #>> '{collection,updated_at}'
  ),
  '55000',
  'talence_collection_delete_requires_terminal_imports',
  'collection deletion cannot orphan a queued import'
);
select is(
  public.inventory_import_cancel(
    (
      current_setting('test.queued_job')::jsonb
        ->> 'import_job_id'
    )::uuid
  ) #>> '{job,status}',
  'cancelled',
  'an editor can explicitly cancel the queued import'
);

select set_config(
  'test.stale_job',
  public.inventory_import_create(
    current_setting('test.collection_id')::uuid,
    'abandoned.csv',
    10,
    repeat('c', 64),
    'phase3-fixture-v1',
    'import-create-stale-0005'
  )::text,
  true
);
reset role;

set local session_replication_role = replica;
update public.inventory_import_jobs
set updated_at = statement_timestamp() - interval '2 days'
where id = (
  current_setting('test.stale_job')::jsonb
    ->> 'import_job_id'
)::uuid;
set local session_replication_role = origin;

select is(
  public.inventory_import_expire_stale(
    statement_timestamp() - interval '24 hours',
    100
  ) ->> 'expired_count',
  '1',
  'service expiry terminalizes abandoned nonterminal imports'
);
select is(
  (
    select job.status::text
    from public.inventory_import_jobs as job
    where job.id = (
      current_setting('test.stale_job')::jsonb
        ->> 'import_job_id'
    )::uuid
  ),
  'cancelled',
  'expired jobs enter the normal terminal retention lifecycle'
);
select throws_ok(
  $$
    select public.inventory_import_expire_stale(
      statement_timestamp() - interval '30 minutes',
      100
    )
  $$,
  '22023',
  'talence_inventory_import_expiry_invalid',
  'stale expiry enforces a minimum inactivity window'
);

select * from finish();
rollback;
