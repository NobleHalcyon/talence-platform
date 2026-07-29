begin;

select plan(58);

create temporary table test_imports (
  label text primary key,
  source_file_id uuid not null,
  import_run_id uuid not null,
  catalog_version text not null,
  begin_result jsonb not null
) on commit drop;

create function pg_temp.begin_test_import(
  p_label text,
  p_object_id text,
  p_observed_at timestamptz,
  p_sha_character text,
  p_dependency_character text,
  p_force boolean
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_register jsonb;
  v_begin jsonb;
  v_source_file_id uuid;
  v_import_run_id uuid;
  v_catalog_version text;
begin
  v_register := app_private.catalog_register_source_file(
    p_provider => 'scryfall',
    p_source_type => 'all_cards',
    p_provider_object_id => p_object_id,
    p_provider_updated_at => p_observed_at,
    p_download_uri => 'https://data.scryfall.test/' || p_object_id,
    p_content_type => 'application/json',
    p_content_encoding => null,
    p_compressed_size => 100,
    p_downloaded_size => 100,
    p_sha256 => repeat(p_sha_character, 64),
    p_downloaded_at => p_observed_at + interval '5 minutes',
    p_dependency_sha256 => repeat(p_dependency_character, 64)
  );
  v_source_file_id := (v_register ->> 'source_file_id')::uuid;

  v_begin := app_private.catalog_begin_import(
    p_source_file_id => v_source_file_id,
    p_trigger_type => 'fixture',
    p_worker_version => 'pgTAP/phase-2',
    p_force => p_force
  );
  v_import_run_id := (v_begin ->> 'import_run_id')::uuid;

  select concat(
    'mtg-',
    to_char(
      source_file.provider_updated_at at time zone 'UTC',
      'YYYYMMDD"T"HH24MISS"Z"'
    ),
    '-',
    substring(source_file.catalog_identity_sha256 from 1 for 8),
    '-s1'
  )
  into v_catalog_version
  from public.catalog_source_files as source_file
  where source_file.id = v_source_file_id;

  insert into test_imports (
    label,
    source_file_id,
    import_run_id,
    catalog_version,
    begin_result
  )
  values (
    p_label,
    v_source_file_id,
    v_import_run_id,
    v_catalog_version,
    v_begin
  );
end;
$$;

create function pg_temp.stage_test_catalog(p_import_run_id uuid)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_observed_at timestamptz;
begin
  select source_file.provider_updated_at
  into v_observed_at
  from public.catalog_import_runs as import_run
  join public.catalog_source_files as source_file
    on source_file.id = import_run.source_file_id
  where import_run.id = p_import_run_id;

  insert into app_private.catalog_stage_sets (
    import_run_id,
    set_id,
    code,
    name,
    set_type,
    released_at,
    parent_set_id,
    card_count,
    digital,
    foil_only,
    nonfoil_only,
    icon_svg_uri
  )
  values (
    p_import_run_id,
    '71000000-0000-4000-8000-000000000001',
    'tst',
    'Talence Test Set',
    'expansion',
    date '2026-07-01',
    null,
    3,
    false,
    false,
    false,
    'https://images.scryfall.test/tst.svg'
  );

  insert into app_private.catalog_stage_cards (
    import_run_id,
    oracle_card_id,
    name,
    normalized_name,
    mana_cost,
    mana_value,
    type_line,
    oracle_text,
    colors,
    color_identity,
    keywords,
    reserved
  )
  values
    (
      p_import_run_id,
      '72000000-0000-4000-8000-000000000001',
      'Lightning Bolt',
      'lightning bolt',
      '{R}',
      1,
      'Instant',
      'Lightning Bolt deals 3 damage to any target.',
      array['R'],
      array['R'],
      '{}'::text[],
      false
    ),
    (
      p_import_run_id,
      '72000000-0000-4000-8000-000000000002',
      'Archangel Avacyn',
      'archangel avacyn',
      '{3}{W}{W}',
      5,
      'Legendary Creature — Angel',
      'Flash, flying, vigilance',
      array['W'],
      array['W', 'R'],
      array['Flash', 'Flying', 'Vigilance'],
      false
    );

  insert into app_private.catalog_stage_printings (
    import_run_id,
    printing_id,
    oracle_card_id,
    set_id,
    collector_number,
    language,
    printed_name,
    rarity,
    layout,
    released_at,
    digital,
    promo,
    oversized,
    variation,
    finishes,
    color_identity,
    frame_effects,
    border_color,
    artist,
    scryfall_uri,
    image_status,
    default_browse
  )
  values
    (
      p_import_run_id,
      '73000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '1',
      'en',
      null,
      'uncommon',
      'normal',
      date '2026-07-01',
      false,
      false,
      false,
      false,
      array[
        'nonfoil'::public.card_finish,
        'foil'::public.card_finish
      ],
      array['R'],
      '{}'::text[],
      'black',
      'Test Artist',
      'https://scryfall.test/bolt',
      'highres_scan',
      true
    ),
    (
      p_import_run_id,
      '73000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000001',
      '2',
      'ja',
      '大天使アヴァシン',
      'mythic',
      'transform',
      date '2026-07-02',
      false,
      false,
      false,
      false,
      array['nonfoil'::public.card_finish],
      array['W', 'R'],
      '{}'::text[],
      'black',
      'Test Artist',
      'https://scryfall.test/avacyn',
      'highres_scan',
      true
    ),
    (
      p_import_run_id,
      '73000000-0000-4000-8000-000000000003',
      null,
      '71000000-0000-4000-8000-000000000001',
      'T1',
      'en',
      'Goblin Token',
      'common',
      'token',
      date '2026-07-01',
      false,
      false,
      false,
      false,
      array['nonfoil'::public.card_finish],
      array['U'],
      '{}'::text[],
      'black',
      'Test Artist',
      'https://scryfall.test/token',
      'highres_scan',
      false
    );

  insert into app_private.catalog_stage_faces (
    import_run_id,
    face_id,
    printing_id,
    face_index,
    name,
    mana_cost,
    type_line,
    oracle_text,
    colors
  )
  values
    (
      p_import_run_id,
      '74000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      0,
      'Lightning Bolt',
      '{R}',
      'Instant',
      'Lightning Bolt deals 3 damage to any target.',
      array['R']
    ),
    (
      p_import_run_id,
      '74000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000002',
      0,
      'Archangel Avacyn',
      '{3}{W}{W}',
      'Legendary Creature — Angel',
      'Flash, flying, vigilance',
      array['W']
    ),
    (
      p_import_run_id,
      '74000000-0000-4000-8000-000000000003',
      '73000000-0000-4000-8000-000000000002',
      1,
      'Avacyn, the Purifier',
      null,
      'Legendary Creature — Angel',
      'When this creature transforms, it deals 3 damage.',
      array['R']
    ),
    (
      p_import_run_id,
      '74000000-0000-4000-8000-000000000004',
      '73000000-0000-4000-8000-000000000003',
      0,
      'Goblin Token',
      null,
      'Token Creature — Goblin',
      null,
      array['R']
    );

  insert into app_private.catalog_stage_legalities (
    import_run_id,
    oracle_card_id,
    format_code,
    legality
  )
  values
    (
      p_import_run_id,
      '72000000-0000-4000-8000-000000000001',
      'modern',
      'legal'
    ),
    (
      p_import_run_id,
      '72000000-0000-4000-8000-000000000002',
      'modern',
      'legal'
    );

  insert into app_private.catalog_stage_external_ids (
    import_run_id,
    entity_type,
    entity_id,
    provider,
    identifier_type,
    identifier_value
  )
  values
    (
      p_import_run_id,
      'set',
      '71000000-0000-4000-8000-000000000001',
      'scryfall',
      'set_id',
      '71000000-0000-4000-8000-000000000001'
    ),
    (
      p_import_run_id,
      'card',
      '72000000-0000-4000-8000-000000000001',
      'scryfall',
      'oracle_id',
      '72000000-0000-4000-8000-000000000001'
    ),
    (
      p_import_run_id,
      'printing',
      '73000000-0000-4000-8000-000000000001',
      'scryfall',
      'card_id',
      '73000000-0000-4000-8000-000000000001'
    );

  insert into app_private.catalog_stage_prices (
    import_run_id,
    printing_id,
    provider,
    currency,
    finish,
    amount,
    observed_at,
    ingested_at
  )
  values
    (
      p_import_run_id,
      '73000000-0000-4000-8000-000000000001',
      'scryfall',
      'USD',
      'nonfoil',
      1.2500,
      v_observed_at,
      v_observed_at + interval '5 minutes'
    ),
    (
      p_import_run_id,
      '73000000-0000-4000-8000-000000000001',
      'scryfall',
      'USD',
      'foil',
      3.5000,
      v_observed_at,
      v_observed_at + interval '5 minutes'
    ),
    (
      p_import_run_id,
      '73000000-0000-4000-8000-000000000002',
      'scryfall',
      'EUR',
      'nonfoil',
      2.0000,
      v_observed_at,
      v_observed_at + interval '5 minutes'
    );

  update public.catalog_import_runs
  set records_seen = 3
  where id = p_import_run_id;
end;
$$;

select pg_temp.begin_test_import(
  'a1',
  'all-cards-a',
  '2026-07-26 12:00:00+00',
  'a',
  '1',
  false
);

select is(
  (select begin_result ->> 'status' from test_imports where label = 'a1'),
  'running',
  'the first source starts a running import'
);

select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'a1')
);

select is(
  (
    app_private.catalog_validate_import(
      (select import_run_id from test_imports where label = 'a1'),
      0
    ) ->> 'valid'
  ),
  'true',
  'representative single-face, multi-face, foreign, and token rows validate'
);

select is(
  (
    app_private.catalog_promote_import(
      (select import_run_id from test_imports where label = 'a1'),
      (select catalog_version from test_imports where label = 'a1')
    ) ->> 'status'
  ),
  'succeeded',
  'a valid staged catalog promotes atomically'
);

select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'a1'),
  'promotion advances the singleton active version'
);
select is(
  (
    select count(*)::integer
    from app_private.catalog_stage_printings
    where import_run_id = (
      select import_run_id from test_imports where label = 'a1'
    )
  ),
  0,
  'successful promotion purges import staging immediately'
);
select is(
  (select count(*)::integer from public.catalog_printings where active),
  3,
  'all representative printings are active'
);
select is(
  (
    select count(*)::integer
    from public.catalog_printings
    where active and card_id is null
  ),
  1,
  'non-oracle token identity remains nullable'
);
select is(
  (
    select color_identity
    from public.catalog_printings
    where id = '73000000-0000-4000-8000-000000000003'
  ),
  array['U']::text[],
  'non-oracle printing color identity survives staging and promotion'
);
select is(
  (
    select count(*)::integer
    from public.catalog_printings
    where active and language = 'ja'
  ),
  1,
  'foreign-language printing identity is retained'
);
select is(
  (
    select count(*)::integer
    from public.catalog_faces
    where printing_id = '73000000-0000-4000-8000-000000000002'
  ),
  2,
  'ordered multi-face rows survive promotion'
);
select is(
  (select count(*)::integer from public.current_prices),
  3,
  'only non-null normalized price observations are promoted'
);
select is(
  (
    select count(*)::integer
    from public.current_prices
    where amount is null or amount = 0
  ),
  0,
  'a missing fixture price is never materialized as zero'
);
select is(
  (
    select count(*)::integer
    from public.current_prices
    where printing_id = '73000000-0000-4000-8000-000000000001'
  ),
  2,
  'multiple finish-specific prices remain distinct'
);
select is(
  (
    select extract(epoch from (stale_after - observed_at))::integer
    from public.current_prices
    order by printing_id, currency, finish
    limit 1
  ),
  129600,
  'promotion applies the canonical initial 36-hour stale window'
);

select is(
  (
    app_private.catalog_register_source_file(
      'scryfall',
      'all_cards',
      'all-cards-a',
      '2026-07-26 12:00:00+00',
      'https://data.scryfall.test/all-cards-a',
      'application/json',
      null,
      100,
      100,
      repeat('a', 64),
      '2026-07-26 12:05:00+00',
      repeat('1', 64)
    ) ->> 'unchanged'
  ),
  'true',
  'register reports unchanged only when the matching source is active'
);
select is(
  (
    app_private.catalog_begin_import(
      (select source_file_id from test_imports where label = 'a1'),
      'fixture',
      'pgTAP/phase-2',
      false
    ) ->> 'noop'
  ),
  'true',
  'an identical active source is an idempotent no-op'
);

select pg_temp.begin_test_import(
  'b1',
  'all-cards-b',
  '2026-07-26 13:00:00+00',
  'b',
  '2',
  false
);
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'b1')
);
select app_private.catalog_validate_import(
  (select import_run_id from test_imports where label = 'b1'),
  0
);
select is(
  (
    app_private.catalog_promote_import(
      (select import_run_id from test_imports where label = 'b1'),
      (select catalog_version from test_imports where label = 'b1')
    ) ->> 'status'
  ),
  'succeeded',
  'a changed source identity promotes'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'b1'),
  'source B becomes active'
);

select pg_temp.begin_test_import(
  'a2',
  'all-cards-a',
  '2026-07-26 12:00:00+00',
  'a',
  '1',
  true
);
select is(
  (select begin_result ->> 'status' from test_imports where label = 'a2'),
  'running',
  'force allows a historical source A to run again'
);
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'a2')
);
select app_private.catalog_validate_import(
  (select import_run_id from test_imports where label = 'a2'),
  0
);
select is(
  (
    app_private.catalog_promote_import(
      (select import_run_id from test_imports where label = 'a2'),
      (select catalog_version from test_imports where label = 'a2')
    ) ->> 'status'
  ),
  'succeeded',
  'forced source A promotes again'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'a2'),
  'forced A replaces active B'
);

select pg_temp.begin_test_import(
  'b2',
  'all-cards-b',
  '2026-07-26 13:00:00+00',
  'b',
  '2',
  false
);
select is(
  (select begin_result ->> 'status' from test_imports where label = 'b2'),
  'running',
  'historical success B is not a no-op while A is active'
);
select is(
  (select begin_result ->> 'noop' from test_imports where label = 'b2'),
  'false',
  'active catalog identity is the sole no-op authority'
);
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'b2')
);
select app_private.catalog_validate_import(
  (select import_run_id from test_imports where label = 'b2'),
  0
);
select is(
  (
    app_private.catalog_promote_import(
      (select import_run_id from test_imports where label = 'b2'),
      (select catalog_version from test_imports where label = 'b2')
    ) ->> 'status'
  ),
  'succeeded',
  'B promotes again after forced A'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'b2'),
  'B is active after the A-to-B replay regression sequence'
);

select isnt(
  (
    select a.catalog_identity_sha256
    from public.catalog_source_files as a
    where a.id = (select source_file_id from test_imports where label = 'a1')
  ),
  (
    select b.catalog_identity_sha256
    from public.catalog_source_files as b
    where b.id = (select source_file_id from test_imports where label = 'b1')
  ),
  'sets dependency hashes participate in catalog identity'
);

select pg_temp.begin_test_import(
  'c1',
  'all-cards-c',
  '2026-07-26 14:00:00+00',
  'c',
  '3',
  false
);
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'c1')
);
insert into app_private.catalog_stage_prices (
  import_run_id,
  printing_id,
  provider,
  currency,
  finish,
  amount,
  observed_at,
  ingested_at
)
values (
  (select import_run_id from test_imports where label = 'c1'),
  '73000000-0000-4000-8000-000000000001',
  'scryfall',
  'USD',
  'etched',
  9.0000,
  '2026-07-26 14:00:00+00',
  '2026-07-26 14:05:00+00'
);

select is(
  (
    app_private.catalog_promote_import(
      (select import_run_id from test_imports where label = 'c1'),
      (select catalog_version from test_imports where label = 'c1')
    ) ->> 'promoted'
  ),
  'false',
  'invalid staged price mappings are not promoted'
);
select is(
  (
    select status::text
    from public.catalog_import_runs
    where id = (select import_run_id from test_imports where label = 'c1')
  ),
  'failed',
  'failed validation is recorded without mutating active catalog'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'b2'),
  'failed promotion preserves the prior active catalog version'
);
select is(
  (
    select count(*)::integer
    from public.current_prices
    where provider = 'scryfall'
  ),
  3,
  'failed promotion preserves the prior active price set'
);

select is(
  (
    app_private.catalog_register_source_file(
      'scryfall',
      'all_cards',
      'all-cards-b',
      '2026-07-26 13:00:00+00',
      'https://data.scryfall.test/all-cards-b',
      'application/json',
      null,
      100,
      100,
      repeat('b', 64),
      '2026-07-26 13:05:00+00',
      repeat('2', 64)
    ) ->> 'unchanged'
  ),
  'true',
  'active source B is unchanged after failed source C'
);

select pg_temp.begin_test_import(
  'live1',
  'all-cards-live-truncated',
  '2026-07-26 15:00:00+00',
  'd',
  '4',
  false
);
update public.catalog_import_runs
set trigger_type = 'live'
where id = (select import_run_id from test_imports where label = 'live1');
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'live1')
);
delete from app_private.catalog_stage_prices
where import_run_id = (select import_run_id from test_imports where label = 'live1')
  and printing_id <> '73000000-0000-4000-8000-000000000001';
delete from app_private.catalog_stage_faces
where import_run_id = (select import_run_id from test_imports where label = 'live1')
  and printing_id <> '73000000-0000-4000-8000-000000000001';
delete from app_private.catalog_stage_printings
where import_run_id = (select import_run_id from test_imports where label = 'live1')
  and printing_id <> '73000000-0000-4000-8000-000000000001';
delete from app_private.catalog_stage_legalities
where import_run_id = (select import_run_id from test_imports where label = 'live1')
  and oracle_card_id <> '72000000-0000-4000-8000-000000000001';
delete from app_private.catalog_stage_cards
where import_run_id = (select import_run_id from test_imports where label = 'live1')
  and oracle_card_id <> '72000000-0000-4000-8000-000000000001';
update public.catalog_import_runs
set records_seen = 1
where id = (select import_run_id from test_imports where label = 'live1');

select is(
  (
    app_private.catalog_validate_import(
      (select import_run_id from test_imports where label = 'live1'),
      0
    ) ->> 'valid'
  ),
  'false',
  'a relationally valid one-card live import is rejected as truncation'
);
select ok(
  (
    select validation_summary -> 'errors'
      ? 'live_absolute_floor_failed'
    from public.catalog_import_runs
    where id = (select import_run_id from test_imports where label = 'live1')
  ),
  'live validation records a stable absolute-floor failure'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'b2'),
  'catastrophic live truncation preserves active catalog state'
);

insert into public.catalog_import_runs (
  id,
  status,
  trigger_type,
  completed_at,
  created_at,
  updated_at
)
values (
  '76000000-0000-4000-8000-000000000001',
  'failed',
  'fixture',
  statement_timestamp() - interval '31 days',
  statement_timestamp() - interval '31 days',
  statement_timestamp() - interval '31 days'
);
insert into app_private.catalog_stage_sets (
  import_run_id,
  set_id,
  code,
  name,
  digital,
  foil_only,
  nonfoil_only
)
values (
  '76000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000099',
  'old',
  'Old Failed Staging',
  false,
  false,
  false
);

select pg_temp.begin_test_import(
  'cleanup1',
  'all-cards-cleanup',
  '2026-07-26 16:00:00+00',
  'e',
  '5',
  false
);
select is(
  (
    select count(*)::integer
    from app_private.catalog_stage_sets
    where import_run_id = '76000000-0000-4000-8000-000000000001'
  ),
  0,
  'begin cleans terminal staging older than 30 days'
);
select app_private.catalog_fail_import(
  (select import_run_id from test_imports where label = 'cleanup1'),
  'test_cleanup',
  'release the worker lease for the next assertion'
);

insert into public.catalog_import_runs (
  id,
  source_file_id,
  status,
  trigger_type,
  started_at,
  worker_version,
  created_at,
  updated_at
)
values (
  '76000000-0000-4000-8000-000000000002',
  (select source_file_id from test_imports where label = 'cleanup1'),
  'running',
  'fixture',
  statement_timestamp() - interval '1 hour',
  'dead-worker',
  statement_timestamp() - interval '1 hour',
  statement_timestamp() - interval '1 hour'
);

select pg_temp.begin_test_import(
  'lease1',
  'all-cards-lease',
  '2026-07-26 17:00:00+00',
  'f',
  '6',
  false
);
select is(
  (
    select status::text
    from public.catalog_import_runs
    where id = '76000000-0000-4000-8000-000000000002'
  ),
  'failed',
  'begin recovers an expired worker lease'
);
select is(
  (
    select error_code
    from public.catalog_import_runs
    where id = '76000000-0000-4000-8000-000000000002'
  ),
  'worker_heartbeat_expired',
  'expired lease uses a stable failure code'
);
select is(
  (select begin_result ->> 'status' from test_imports where label = 'lease1'),
  'running',
  'a new worker can start after stale-lease recovery'
);
select is(
  (
    app_private.catalog_heartbeat_import(
      (select import_run_id from test_imports where label = 'lease1')
    ) ->> 'status'
  ),
  'running',
  'the trusted heartbeat keeps a claimed import lease current'
);
select app_private.catalog_fail_import(
  (select import_run_id from test_imports where label = 'lease1'),
  'test_lease_done',
  'release the worker lease for the next assertion'
);

insert into public.catalog_import_runs (
  id,
  status,
  trigger_type,
  requested_force
)
values (
  '76000000-0000-4000-8000-000000000003',
  'queued',
  'manual',
  false
);
select is(
  (
    app_private.catalog_fail_queued_import(
      '76000000-0000-4000-8000-000000000003',
      'provider_preflight_failed',
      'fixture provider preflight failed'
    ) ->> 'status'
  ),
  'failed',
  'an unclaimed queued run can record a provider preflight failure'
);
select is(
  (
    select error_code
    from public.catalog_import_runs
    where id = '76000000-0000-4000-8000-000000000003'
  ),
  'provider_preflight_failed',
  'queued preflight failure retains its bounded stable code'
);
select is(
  (
    app_private.catalog_fail_queued_import(
      '76000000-0000-4000-8000-000000000003',
      'provider_preflight_failed',
      'fixture provider preflight failed'
    ) ->> 'replayed'
  ),
  'true',
  'queued failure recording is replay safe'
);

insert into public.catalog_import_runs (
  id,
  status,
  trigger_type,
  requested_force
)
values (
  '76000000-0000-4000-8000-000000000004',
  'queued',
  'manual',
  false
);
select is(
  (
    app_private.catalog_complete_queued_noop(
      '76000000-0000-4000-8000-000000000004',
      'scryfall',
      'all_cards',
      'all-cards-b',
      '2026-07-26 13:00:00+00',
      repeat('2', 64),
      'pgTAP/queued-noop'
    ) ->> 'noop'
  ),
  'true',
  'an unchanged unclaimed queue completes without downloading a new source'
);
select ok(
  (
    select
      queued.status = 'succeeded'::public.job_status
      and queued.started_at is null
      and queued.source_file_id = active_run.source_file_id
      and queued.catalog_version = state.active_catalog_version
      and queued.validation_summary @> jsonb_build_object(
        'valid', true,
        'noop', true,
        'replayed_import_id', active_run.id
      )
    from public.catalog_import_runs as queued
    cross join public.catalog_state as state
    join public.catalog_import_runs as active_run
      on active_run.id = state.active_import_id
    where queued.id = '76000000-0000-4000-8000-000000000004'
      and state.singleton_id = 1
  ),
  'queued no-op completion records the active source and catalog version'
);
select is(
  (
    app_private.catalog_complete_queued_noop(
      '76000000-0000-4000-8000-000000000004',
      'scryfall',
      'all_cards',
      'all-cards-b',
      '2026-07-26 13:00:00+00',
      repeat('2', 64),
      'pgTAP/queued-noop'
    ) ->> 'replayed'
  ),
  'true',
  'queued no-op completion is replay safe'
);

insert into public.catalog_import_runs (
  id,
  status,
  trigger_type,
  requested_force
)
values (
  '76000000-0000-4000-8000-000000000005',
  'queued',
  'manual',
  true
);
select is(
  (
    app_private.catalog_complete_queued_noop(
      '76000000-0000-4000-8000-000000000005',
      'scryfall',
      'all_cards',
      'all-cards-b',
      '2026-07-26 13:00:00+00',
      repeat('2', 64),
      'pgTAP/queued-force'
    ) ->> 'noop'
  ),
  'false',
  'a forced queue is not completed as an unchanged no-op'
);
select is(
  (
    select status::text
    from public.catalog_import_runs
    where id = '76000000-0000-4000-8000-000000000005'
  ),
  'queued',
  'a forced queue remains available for a full download'
);
select app_private.catalog_fail_queued_import(
  '76000000-0000-4000-8000-000000000005',
  'test_force_queue_cleanup',
  'clean up the forced queue after the no-op guard assertion'
);

insert into public.catalog_import_runs (
  id,
  status,
  trigger_type,
  requested_force
)
values (
  '76000000-0000-4000-8000-000000000006',
  'queued',
  'manual',
  false
);
select is(
  (
    app_private.catalog_complete_queued_noop(
      '76000000-0000-4000-8000-000000000006',
      'scryfall',
      'all_cards',
      'all-cards-b',
      '2026-07-26 13:00:01+00',
      repeat('2', 64),
      'pgTAP/queued-race'
    ) ->> 'noop'
  ),
  'false',
  'a changed provider identity is not completed as a no-op'
);
select is(
  (
    select status::text
    from public.catalog_import_runs
    where id = '76000000-0000-4000-8000-000000000006'
  ),
  'queued',
  'an identity-raced queue remains available for a full download'
);
select app_private.catalog_fail_queued_import(
  '76000000-0000-4000-8000-000000000006',
  'test_identity_queue_cleanup',
  'clean up the identity-raced queue after the no-op guard assertion'
);

select pg_temp.begin_test_import(
  'kill1',
  'all-cards-kill-switch',
  '2026-07-26 17:30:00+00',
  '9',
  '8',
  false
);
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'kill1')
);
update app_private.catalog_stage_printings
set printed_name = 'Must Not Promote'
where import_run_id = (
    select import_run_id from test_imports where label = 'kill1'
  )
  and printing_id = '73000000-0000-4000-8000-000000000003';
update public.catalog_state
set sync_enabled = false
where singleton_id = 1;

select throws_ok(
  format(
    'select app_private.catalog_heartbeat_import(%L::uuid)',
    (select import_run_id from test_imports where label = 'kill1')
  ),
  '55000',
  'talence_catalog_sync_disabled',
  'disabling sync blocks the next in-flight worker heartbeat'
);
select is(
  (
    select status::text
    from public.catalog_import_runs
    where id = (select import_run_id from test_imports where label = 'kill1')
  ),
  'running',
  'a blocked heartbeat leaves the import available for safe failure recording'
);
select throws_ok(
  format(
    'select app_private.catalog_promote_import(%L::uuid, %L)',
    (select import_run_id from test_imports where label = 'kill1'),
    (select catalog_version from test_imports where label = 'kill1')
  ),
  '55000',
  'talence_catalog_sync_disabled',
  'promotion rechecks the transaction-locked sync switch'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'b2'),
  'a kill-switch rejection preserves the active catalog pointer'
);
select is(
  (
    select printed_name
    from public.catalog_printings
    where id = '73000000-0000-4000-8000-000000000003'
  ),
  'Goblin Token',
  'a kill-switch rejection preserves active catalog data'
);
select is(
  (
    app_private.catalog_fail_import(
      (select import_run_id from test_imports where label = 'kill1'),
      'sync_disabled',
      'catalog sync was disabled during the import'
    ) ->> 'status'
  ),
  'failed',
  'an in-flight run rejected by the kill switch can be failed safely'
);
update public.catalog_state
set sync_enabled = true
where singleton_id = 1;

select pg_temp.begin_test_import(
  'exception1',
  'all-cards-exception',
  '2026-07-26 18:00:00+00',
  '1',
  '7',
  false
);
select pg_temp.stage_test_catalog(
  (select import_run_id from test_imports where label = 'exception1')
);

create function pg_temp.raise_catalog_promotion_failure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'forced_catalog_promotion_failure';
end;
$$;

create trigger test_force_catalog_promotion_failure
before update on public.catalog_cards
for each statement
execute function pg_temp.raise_catalog_promotion_failure();

select throws_ok(
  format(
    'select app_private.catalog_promote_import(%L::uuid, %L)',
    (select import_run_id from test_imports where label = 'exception1'),
    (select catalog_version from test_imports where label = 'exception1')
  ),
  'P0001',
  'forced_catalog_promotion_failure',
  'a real promotion-time database exception escapes without a partial commit'
);
select is(
  (select active_catalog_version from public.catalog_state),
  (select catalog_version from test_imports where label = 'b2'),
  'promotion-time exception rolls back the catalog pointer'
);
select is(
  (select count(*)::integer from public.catalog_printings where active),
  3,
  'promotion-time exception preserves active catalog rows'
);
drop trigger test_force_catalog_promotion_failure
  on public.catalog_cards;
select app_private.catalog_fail_import(
  (select import_run_id from test_imports where label = 'exception1'),
  'forced_test_failure',
  'clean up the intentionally interrupted import'
);

select * from finish();

rollback;
