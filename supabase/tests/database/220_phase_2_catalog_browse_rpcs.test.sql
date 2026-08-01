begin;

select plan(74);

create function pg_temp.create_auth_user(
  p_user_id uuid,
  p_email text,
  p_invited_user_id uuid
)
returns void
language sql
set search_path = pg_catalog
as $$
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
    jsonb_build_object('invited_user_id', p_invited_user_id::text),
    statement_timestamp(),
    statement_timestamp()
  )
$$;

insert into app_private.invited_users (id, email, expires_at)
values (
  '81000000-0000-4000-8000-000000000001',
  'catalog-admin@example.test',
  statement_timestamp() + interval '1 day'
);
select pg_temp.create_auth_user(
  '82000000-0000-4000-8000-000000000001',
  'catalog-admin@example.test',
  '81000000-0000-4000-8000-000000000001'
);
select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.finalize_admitted_user();
reset role;
insert into public.platform_user_roles (user_id, role)
values (
  '82000000-0000-4000-8000-000000000001',
  'platform_admin'
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
  '83000000-0000-4000-8000-000000000001',
  'scryfall',
  'all_cards',
  'browse-fixture',
  '2026-07-26 12:00:00+00',
  'https://data.scryfall.test/browse',
  'application/json',
  100,
  repeat('a', 64),
  repeat('b', 64),
  '2026-07-26 12:05:00+00',
  'succeeded'
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
  '84000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'succeeded',
  'fixture',
  '2026-07-26 12:05:00+00',
  '2026-07-26 12:10:00+00',
  6,
  24,
  2,
  2,
  6,
  7,
  6,
  'pgTAP/phase-2',
  'mtg-20260726T120000Z-a1b2c3d4-s1',
  '{"valid":true}'::jsonb
);
update public.catalog_state
set
  active_import_id = '84000000-0000-4000-8000-000000000001',
  active_catalog_version = 'mtg-20260726T120000Z-a1b2c3d4-s1',
  last_successful_source_observed_at = '2026-07-26 12:00:00+00',
  current_search_index_version = 'mtg-20260726T120000Z-a1b2c3d4-s1';

insert into public.catalog_sets (
  id,
  game_id,
  source_provider,
  source_id,
  code,
  name,
  set_type,
  released_at,
  card_count,
  digital
)
select
  fixture.id,
  game.id,
  'scryfall',
  fixture.id::text,
  fixture.code,
  fixture.name,
  'expansion',
  fixture.released_at,
  3,
  false
from public.games as game
cross join (
  values
    (
      '85000000-0000-4000-8000-000000000001'::uuid,
      'aaa'::text,
      '100% Real_Set'::text,
      date '2026-07-01'
    ),
    (
      '85000000-0000-4000-8000-000000000002'::uuid,
      'bbb'::text,
      'Second Set'::text,
      date '2026-07-02'
    )
) as fixture(id, code, name, released_at)
where game.code = 'mtg';

insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  mana_cost,
  mana_value,
  type_line,
  oracle_text,
  colors,
  color_identity,
  keywords
)
select
  fixture.id,
  game.id,
  'scryfall',
  fixture.id::text,
  fixture.name,
  app_private.normalize_catalog_search_text(fixture.name),
  fixture.mana_cost,
  fixture.mana_value,
  fixture.type_line,
  fixture.oracle_text,
  fixture.colors,
  fixture.color_identity,
  '{}'::text[]
from public.games as game
cross join (
  values
    (
      '86000000-0000-4000-8000-000000000001'::uuid,
      'Tie Card'::text,
      '{R}'::text,
      1::numeric,
      'Instant'::text,
      'Tie Card deals 1 damage.'::text,
      array['R']::text[],
      '{}'::text[]
    ),
    (
      '86000000-0000-4000-8000-000000000002'::uuid,
      'Transform Test'::text,
      '{3}{W}{W}'::text,
      5::numeric,
      'Legendary Creature — Angel'::text,
      'Flash, flying, vigilance.'::text,
      array['W']::text[],
      array['W', 'R']::text[]
    )
) as fixture(
  id,
  name,
  mana_cost,
  mana_value,
  type_line,
  oracle_text,
  colors,
  color_identity
)
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
  layout,
  released_at,
  digital,
  finishes,
  color_identity,
  is_default_browse
)
select
  fixture.id,
  game.id,
  fixture.card_id,
  fixture.set_id,
  'scryfall',
  fixture.id::text,
  fixture.collector_number,
  fixture.language,
  fixture.printed_name,
  fixture.rarity,
  fixture.layout,
  fixture.released_at,
  false,
  fixture.finishes,
  fixture.color_identity,
  fixture.default_browse
from public.games as game
cross join (
  values
    (
      '87000000-0000-4000-8000-000000000001'::uuid,
      '86000000-0000-4000-8000-000000000001'::uuid,
      '85000000-0000-4000-8000-000000000001'::uuid,
      '1'::text,
      'en'::text,
      null::text,
      'uncommon'::text,
      'normal'::text,
      date '2026-07-01',
      array[
        'nonfoil'::public.card_finish,
        'foil'::public.card_finish
      ],
      array['R']::text[],
      true
    ),
    (
      '87000000-0000-4000-8000-000000000002'::uuid,
      '86000000-0000-4000-8000-000000000001'::uuid,
      '85000000-0000-4000-8000-000000000001'::uuid,
      '2'::text,
      'ja'::text,
      '同点カード'::text,
      'uncommon'::text,
      'normal'::text,
      date '2026-07-01',
      array['nonfoil'::public.card_finish],
      array['R']::text[],
      true
    ),
    (
      '87000000-0000-4000-8000-000000000003'::uuid,
      '86000000-0000-4000-8000-000000000002'::uuid,
      '85000000-0000-4000-8000-000000000002'::uuid,
      '1'::text,
      'en'::text,
      null::text,
      'mythic'::text,
      'transform'::text,
      date '2026-07-02',
      array['nonfoil'::public.card_finish],
      array['W', 'R']::text[],
      true
    ),
    (
      '87000000-0000-4000-8000-000000000004'::uuid,
      null::uuid,
      '85000000-0000-4000-8000-000000000001'::uuid,
      'T1'::text,
      'en'::text,
      'Goblin Token'::text,
      'common'::text,
      'token'::text,
      date '2026-07-01',
      array['nonfoil'::public.card_finish],
      array['U']::text[],
      false
    ),
    (
      '87000000-0000-4000-8000-000000000005'::uuid,
      null::uuid,
      '85000000-0000-4000-8000-000000000002'::uuid,
      'T2'::text,
      'en'::text,
      'Colorless Construct Token'::text,
      'common'::text,
      'token'::text,
      date '2026-07-02',
      array['nonfoil'::public.card_finish],
      '{}'::text[],
      false
    ),
    (
      '87000000-0000-4000-8000-000000000006'::uuid,
      '86000000-0000-4000-8000-000000000001'::uuid,
      '85000000-0000-4000-8000-000000000002'::uuid,
      '2'::text,
      'en'::text,
      null::text,
      'uncommon'::text,
      'normal'::text,
      date '2026-07-02',
      array['nonfoil'::public.card_finish],
      array['R']::text[],
      true
    )
) as fixture(
  id,
  card_id,
  set_id,
  collector_number,
  language,
  printed_name,
  rarity,
  layout,
  released_at,
  finishes,
  color_identity,
  default_browse
)
where game.code = 'mtg';

insert into public.catalog_faces (
  id,
  printing_id,
  face_index,
  name,
  type_line,
  oracle_text,
  colors
)
values
  (
    '88000000-0000-4000-8000-000000000001',
    '87000000-0000-4000-8000-000000000001',
    0,
    'Tie Card',
    'Instant',
    'Tie Card deals 1 damage.',
    array['R']
  ),
  (
    '88000000-0000-4000-8000-000000000002',
    '87000000-0000-4000-8000-000000000002',
    0,
    '同点カード',
    'Instant',
    'Tie Card deals 1 damage.',
    array['R']
  ),
  (
    '88000000-0000-4000-8000-000000000003',
    '87000000-0000-4000-8000-000000000003',
    0,
    'Transform Test',
    'Legendary Creature — Angel',
    'Flash, flying, vigilance.',
    array['W']
  ),
  (
    '88000000-0000-4000-8000-000000000004',
    '87000000-0000-4000-8000-000000000003',
    1,
    'Purifier Back Face',
    'Legendary Creature — Angel',
    'Purifier deals 3 damage.',
    array['R']
  ),
  (
    '88000000-0000-4000-8000-000000000005',
    '87000000-0000-4000-8000-000000000004',
    0,
    'Goblin Token',
    'Token Creature — Goblin',
    null,
    array['R']
  ),
  (
    '88000000-0000-4000-8000-000000000006',
    '87000000-0000-4000-8000-000000000005',
    0,
    'Colorless Construct Token',
    'Token Artifact Creature — Construct',
    null,
    '{}'::text[]
  ),
  (
    '88000000-0000-4000-8000-000000000007',
    '87000000-0000-4000-8000-000000000006',
    0,
    'Tie Card',
    'Instant',
    'Tie Card deals 1 damage.',
    array['R']
  );

update public.catalog_cards
set keywords = case id
  when '86000000-0000-4000-8000-000000000001' then array['Kicker']::text[]
  else array['Flash', 'Flying', 'Vigilance']::text[]
end
where id in (
  '86000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000002'
);

update public.catalog_printings
set artist = case when set_id = '85000000-0000-4000-8000-000000000001'
  then 'Alice Example' else 'Bob Example' end
where id between '87000000-0000-4000-8000-000000000001'
  and '87000000-0000-4000-8000-000000000006';

update public.catalog_faces
set power = case when printing_id in (
    '87000000-0000-4000-8000-000000000001',
    '87000000-0000-4000-8000-000000000002',
    '87000000-0000-4000-8000-000000000006'
  ) then 'X' else '4' end,
  toughness = case when printing_id in (
    '87000000-0000-4000-8000-000000000001',
    '87000000-0000-4000-8000-000000000002',
    '87000000-0000-4000-8000-000000000006'
  ) then 'X' else '4' end,
  loyalty = case when printing_id = '87000000-0000-4000-8000-000000000003'
    and face_index = 1 then '3' else null end;

insert into public.catalog_legalities (card_id, format_code, legality)
values
  ('86000000-0000-4000-8000-000000000001', 'commander', 'legal'),
  ('86000000-0000-4000-8000-000000000001', 'modern', 'banned'),
  ('86000000-0000-4000-8000-000000000002', 'commander', 'legal'),
  ('86000000-0000-4000-8000-000000000002', 'modern', 'legal');

insert into public.current_prices (
  printing_id,
  provider,
  currency,
  finish,
  amount,
  observed_at,
  ingested_at,
  source_file_id,
  stale_after
)
values
  (
    '87000000-0000-4000-8000-000000000001',
    'scryfall',
    'USD',
    'nonfoil',
    1,
    '2026-07-26 12:00:00+00',
    '2026-07-26 12:05:00+00',
    '83000000-0000-4000-8000-000000000001',
    '2026-07-28 00:00:00+00'
  ),
  (
    '87000000-0000-4000-8000-000000000001',
    'scryfall',
    'USD',
    'foil',
    9,
    '2026-07-26 12:00:00+00',
    '2026-07-26 12:05:00+00',
    '83000000-0000-4000-8000-000000000001',
    '2026-07-28 00:00:00+00'
  ),
  (
    '87000000-0000-4000-8000-000000000002',
    'scryfall',
    'USD',
    'nonfoil',
    1,
    '2026-07-26 12:00:00+00',
    '2026-07-26 12:05:00+00',
    '83000000-0000-4000-8000-000000000001',
    '2026-07-28 00:00:00+00'
  ),
  (
    '87000000-0000-4000-8000-000000000003',
    'scryfall',
    'USD',
    'nonfoil',
    2,
    '2026-07-26 12:00:00+00',
    '2026-07-26 12:05:00+00',
    '83000000-0000-4000-8000-000000000001',
    '2026-07-28 00:00:00+00'
  ),
  (
    '87000000-0000-4000-8000-000000000004',
    'scryfall',
    'USD',
    'nonfoil',
    0,
    '2026-07-26 12:00:00+00',
    '2026-07-26 12:05:00+00',
    '83000000-0000-4000-8000-000000000001',
    '2026-07-28 00:00:00+00'
  ),
  (
    '87000000-0000-4000-8000-000000000006',
    'scryfall',
    'USD',
    'nonfoil',
    1,
    '2026-07-26 12:00:00+00',
    '2026-07-26 12:05:00+00',
    '83000000-0000-4000-8000-000000000001',
    '2026-07-28 00:00:00+00'
  );

select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  public.catalog_status() ->> 'source_provider',
  'scryfall',
  'catalog status identifies the freshness source provider'
);
select is(
  (public.catalog_status() -> 'counts' ->> 'faces')::integer,
  7,
  'catalog status includes active face count'
);
select is(
  (
    public.catalog_search(p_query => 'Tie Card')
      ->> 'total_count'
  )::integer,
  1,
  'Oracle mode returns one representative across language-specific printings'
);
select is(
  (
    public.catalog_search(
      p_query => 'Tie Card',
      p_return_all_variants => true
    ) ->> 'total_count'
  )::integer,
  3,
  'all-variants mode returns every eligible printing'
);
select is(
  public.catalog_search(p_query => 'Tie Card')
    -> 'items' -> 0 ->> 'printing_id',
  '87000000-0000-4000-8000-000000000006',
  'Oracle mode chooses the newest eligible representative printing'
);
select is(
  public.catalog_search(
    p_query => 'Tie Card',
    p_set_code => 'aaa'
  ) -> 'items' -> 0 ->> 'printing_id',
  '87000000-0000-4000-8000-000000000001',
  'a set filter chooses the representative printing from that set'
);
select is(
  (
    public.catalog_search(
      p_query => 'Tie Card',
      p_language => 'ja'
    ) ->> 'total_count'
  )::integer,
  1,
  'language filtering remains explicit'
);
select is(
  (
    public.catalog_search(p_query => 'Purifier')
      ->> 'total_count'
  )::integer,
  1,
  'search matches a back face of a multi-face printing'
);
select is(
  (
    public.catalog_search(p_query => 'Tie Crd')
      ->> 'total_count'
  )::integer,
  1,
  'index-backed trigram matching tolerates a representative typo in Oracle mode'
);
select is(
  (
    public.catalog_search(
      p_query => 'Goblin Token',
      p_include_nondefault => true,
      p_color_identity => array['R']
    ) ->> 'total_count'
  )::integer,
  0,
  'non-oracle color identity does not fall back to visible face colors'
);
select is(
  (
    public.catalog_search(
      p_query => 'Goblin Token',
      p_include_nondefault => true,
      p_color_identity => array['U']
    ) ->> 'total_count'
  )::integer,
  1,
  'non-oracle filtering uses printing-level color identity'
);
select is(
  public.catalog_printing_detail(
    '87000000-0000-4000-8000-000000000004'
  ) -> 'printing' -> 'color_identity',
  '["U"]'::jsonb,
  'printing detail preserves identity when face colors differ'
);
select is(
  public.catalog_printing_detail(
    '87000000-0000-4000-8000-000000000001'
  ) -> 'printing' -> 'color_identity',
  '[]'::jsonb,
  'an oracle card empty identity takes precedence over printing identity'
);
select is(
  (
    public.catalog_search(
      p_query => 'Goblin Token',
      p_include_nondefault => true,
      p_colors => array['C']
    ) ->> 'total_count'
  )::integer,
  0,
  'a colored token does not match explicit colorless C'
);
select is(
  (
    public.catalog_search(
      p_query => 'Colorless Construct',
      p_include_nondefault => true,
      p_colors => array['C'],
      p_color_identity => array['C']
    ) ->> 'total_count'
  )::integer,
  1,
  'C matches a genuinely empty face-color union'
);
select throws_ok(
  $$
    select public.catalog_search(
      p_colors => array['C', 'R']
    )
  $$,
  '22023',
  'talence_catalog_colors_invalid',
  'C cannot be mixed ambiguously with WUBRG'
);
select is(
  (
    public.catalog_search(
      p_query => 'Tie Card',
      p_finish => 'foil'
    ) -> 'items' -> 0 -> 'best_price' ->> 'finish'
  ),
  'foil',
  'finish-filtered best price uses the same finish as search sorting'
);
select is(
  (
    public.catalog_search(
      p_query => 'Tie Card',
      p_finish => 'foil'
    ) -> 'items' -> 0 -> 'best_price' ->> 'amount'
  )::numeric,
  9::numeric,
  'finish-filtered best price amount does not fall back to nonfoil'
);
select is(
  (
    public.catalog_printing_detail(
      '87000000-0000-4000-8000-000000000004'
    ) -> 'printing' -> 'prices' -> 0 ->> 'amount'
  )::numeric,
  0::numeric,
  'an explicit zero price remains valid when provenance is present'
);
select is(
  (
    public.catalog_search(p_query => '%%')
      ->> 'total_count'
  )::integer,
  0,
  'literal percent query does not broaden to every row'
);
select is(
  (
    public.catalog_search(p_type_line => '%')
      ->> 'total_count'
  )::integer,
  0,
  'literal wildcard type filter is escaped'
);
select throws_ok(
  $$select public.catalog_search(p_query => 'x')$$,
  '22023',
  'talence_catalog_search_arguments_invalid',
  'one-character fuzzy search is rejected'
);
select throws_ok(
  $$select public.catalog_search(p_limit => 101)$$,
  '22023',
  'talence_catalog_search_arguments_invalid',
  'search page size is bounded to 100'
);
select is(
  public.catalog_printing_detail(
    '87000000-0000-4000-8000-000000000099'
  ),
  null::jsonb,
  'missing valid printing UUID returns null for web 404 handling'
);
select is(
  public.catalog_card_detail(
    '86000000-0000-4000-8000-000000000099'
  ),
  null::jsonb,
  'missing valid card UUID returns null for web 404 handling'
);
select is(
  public.catalog_set_detail('missing'),
  null::jsonb,
  'missing valid set code returns null for web 404 handling'
);
select is(
  jsonb_array_length(
    public.catalog_printing_detail(
      '87000000-0000-4000-8000-000000000003'
    ) -> 'printing' -> 'faces'
  ),
  2,
  'printing detail returns all ordered faces'
);
select is(
  (
    public.catalog_search(p_rarity => 'mythic')
      ->> 'total_count'
  )::integer,
  1,
  'rarity filter is exact'
);
select is(
  (
    public.catalog_search(p_released_from => date '2026-07-02')
      ->> 'total_count'
  )::integer,
  2,
  'release date range filter is correct'
);

create temporary table search_pages (
  page_number integer primary key,
  result jsonb not null
) on commit drop;
insert into search_pages
values (
  1,
  public.catalog_search(
    p_query => 'Tie Card',
    p_sort => 'price_asc',
    p_limit => 1,
    p_return_all_variants => true
  )
);
insert into search_pages
select
  2,
  public.catalog_search(
    p_query => 'Tie Card',
    p_sort => 'price_asc',
    p_after => (
      select result ->> 'next_cursor'
      from search_pages
      where page_number = 1
    ),
    p_limit => 1,
    p_return_all_variants => true
  );
insert into search_pages
select
  3,
  public.catalog_search(
    p_query => 'Tie Card',
    p_sort => 'price_asc',
    p_after => (
      select result ->> 'next_cursor'
      from search_pages
      where page_number = 2
    ),
    p_limit => 1,
    p_return_all_variants => true
  );

select is(
  (
    select count(distinct result -> 'items' -> 0 ->> 'printing_id')::integer
    from search_pages
  ),
  3,
  'tied price/name pagination compares set, collector, and ID without duplicates'
);
select is(
  (
    select result ->> 'next_cursor'
    from search_pages
    where page_number = 3
  ),
  null,
  'the final tied-price page has no next cursor'
);
select is(
  (
    select (result ->> 'total_count')::integer
    from search_pages
    where page_number = 2
  ),
  3,
  'cursor pages retain exact total count'
);
select throws_ok(
  format(
    'select public.catalog_search(p_query => %L, p_sort => %L, p_after => %L, p_limit => 1)',
    'Tie Card',
    'price_asc',
    (
      select result ->> 'next_cursor'
      from search_pages
      where page_number = 1
    )
  ),
  '22023',
  'talence_catalog_cursor_invalid',
  'an all-variants cursor cannot be reused in Oracle mode'
);

reset role;
update public.catalog_state
set
  active_catalog_version = 'mtg-20260726T130000Z-deadbeef-s1',
  current_search_index_version = 'mtg-20260726T130000Z-deadbeef-s1';
set local role authenticated;
select throws_ok(
  format(
    'select public.catalog_search(p_query => %L, p_sort => %L, p_after => %L, p_limit => 1, p_return_all_variants => true)',
    'Tie Card',
    'price_asc',
    (
      select result ->> 'next_cursor'
      from search_pages
      where page_number = 1
    )
  ),
  '22023',
  'talence_catalog_cursor_invalid',
  'cursor scope is invalidated when active catalog/search version changes'
);

reset role;
insert into public.current_prices (
  printing_id,
  provider,
  currency,
  finish,
  amount,
  observed_at,
  ingested_at,
  source_file_id,
  stale_after
)
values (
  '87000000-0000-4000-8000-000000000006',
  'tcgplayer',
  'USD',
  'nonfoil',
  0.5,
  '2026-07-26 12:00:00+00',
  '2026-07-26 12:05:00+00',
  '83000000-0000-4000-8000-000000000001',
  '2026-07-28 00:00:00+00'
);
set local role authenticated;

select is(
  public.catalog_oracle_price_floors(
    array['86000000-0000-4000-8000-000000000001'::uuid],
    'USD'
  ) -> 'cards' -> '86000000-0000-4000-8000-000000000001' -> 'nonfoil' ->> 'amount',
  '0.5000',
  'Oracle mode returns the least expensive nonfoil printing'
);
select is(
  public.catalog_oracle_price_floors(
    array['86000000-0000-4000-8000-000000000001'::uuid],
    'USD'
  ) -> 'cards' -> '86000000-0000-4000-8000-000000000001' -> 'foil' ->> 'amount',
  '9.0000',
  'Oracle mode returns the least expensive foil printing separately'
);
select is(
  public.catalog_oracle_price_floors(
    array['86000000-0000-4000-8000-000000000001'::uuid],
    'USD',
    'aaa'
  ) -> 'cards' -> '86000000-0000-4000-8000-000000000001' -> 'nonfoil' ->> 'amount',
  '1.0000',
  'a set filter constrains Oracle price floors to that set'
);
select throws_ok(
  $$select public.catalog_oracle_price_floors('{}'::uuid[])$$,
  '22023',
  'talence_catalog_card_ids_invalid',
  'Oracle price-floor reads reject empty card lists'
);

select is(
  public.catalog_filter_facets('set', '100% Real', 10, null) -> 'items' -> 0 ->> 'code',
  'AAA',
  'set facets search full names and retain the set code'
);
select is(
  (public.catalog_filter_facets('language', 'Japanese', 10, null) -> 'items' -> 0 ->> 'label')
    || '|' || (public.catalog_filter_facets('language', 'Japanese', 10, null) -> 'items' -> 0 ->> 'secondary'),
  'Japanese|ja',
  'language facets expose human-readable names plus provider codes'
);
select is(
  public.catalog_filter_facets('subtype', 'Angel', 10, null) -> 'items' -> 0 ->> 'value',
  'Angel',
  'subtype facets come from normalized canonical types'
);
select is(
  public.catalog_filter_facets('artist', 'Alice', 10, null) -> 'items' -> 0 ->> 'value',
  'Alice Example',
  'artist facets use bounded indexed option search'
);
select is(
  public.catalog_filter_facets('keyword', 'Flying', 10, null) -> 'items' -> 0 ->> 'value',
  'Flying',
  'keyword facets use canonical keyword identity'
);
select is(
  public.catalog_filter_facets('format', 'modern', 10, null) -> 'items' -> 0 ->> 'value',
  'modern',
  'format facets derive from imported legalities'
);

select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"set","field":"set","comparator":"is","value":["BBB"]}]}'::jsonb) ->> 'total_count')::integer, 2,
  'set filters match Oracle cards through eligible printings');
select is(public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"set","field":"set","comparator":"is","value":["BBB"]}]}'::jsonb) -> 'items' -> 0 -> 'set' ->> 'code', 'BBB',
  'printing-level set filters choose a matching representative printing');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"lang","field":"language","comparator":"is","value":["ja"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'language filters replace the default English printing scope');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"rarity","field":"rarity","comparator":"is","value":["uncommon","mythic"]}]}'::jsonb) ->> 'total_count')::integer, 2,
  'rarity accepts multiple values');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"finish","field":"finish","comparator":"is","value":["foil"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'finish is evaluated against eligible printings');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"color","field":"cardColor","comparator":"any","value":["W"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'card color uses normalized Oracle or face color data');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"identity","field":"colorIdentity","comparator":"exactly","value":["W","R"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'color identity exact matching is distinct from card color');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"identity","field":"colorIdentity","comparator":"exactly","value":["C"]}]}'::jsonb, p_include_nondefault => true) ->> 'total_count')::integer, 1,
  'colorless is matched explicitly as an empty identity');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"super","field":"supertype","comparator":"any","value":["Legendary"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'supertypes are filtered independently');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"type","field":"cardType","comparator":"any","value":["Creature"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'card types are filtered independently');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"subtype","field":"subtype","comparator":"any","value":["Angel"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'subtypes are filtered independently across multi-face cards');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"mv","field":"manaValue","comparator":"between","value":{"min":4.5,"max":5.5}}]}'::jsonb) ->> 'total_count')::integer, 1,
  'fractional mana-value ranges are evaluated numerically');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"power","field":"power","comparator":"between","value":{"min":4,"max":4}}]}'::jsonb) ->> 'total_count')::integer, 1,
  'numeric power ranges use normalized numeric projections');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"power","field":"power","comparator":"between","value":{"min":0,"max":1,"includeVariable":true}}]}'::jsonb) ->> 'total_count')::integer, 1,
  'variable P/T/L values are included only when explicitly requested');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"legal","field":"legality","comparator":"is","value":{"state":"legal","formats":["commander","modern"]}}]}'::jsonb) ->> 'total_count')::integer, 1,
  'one legality rule requires every selected format to have the selected state');
select is(public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"artist","field":"artist","comparator":"is","value":["Alice Example"]}]}'::jsonb) -> 'items' -> 0 -> 'set' ->> 'code', 'AAA',
  'artist filters select a representative from matching printings');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"keyword","field":"keyword","comparator":"all","value":["Flash","Flying"]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'keyword filtering matches canonical keyword arrays');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"rules","field":"rulesText","comparator":"contains","value":"flying vigilance"}]}'::jsonb) ->> 'total_count')::integer, 1,
  'rules text contains normalizes whitespace and requires every term');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"rules","field":"rulesText","comparator":"doesNotContain","value":"damage"}]}'::jsonb) ->> 'total_count')::integer, 1,
  'rules text exclusion negates the phrase match');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"rules","field":"rulesText","comparator":"exactPhrase","value":"Flash, flying, vigilance."}]}'::jsonb) ->> 'total_count')::integer, 1,
  'rules text exact phrase matching does not enable regular expressions');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"release","field":"releasedAt","comparator":"between","value":{"min":1782950400000,"max":1782950400000}}]}'::jsonb) ->> 'total_count')::integer, 2,
  'release-date ranges constrain eligible printings');
select is((public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"logic","operator":"or","negated":true,"children":[{"id":"set","field":"set","comparator":"is","value":["AAA"]},{"id":"type","field":"cardType","comparator":"any","value":["Instant"],"negated":true}]}]}'::jsonb) ->> 'total_count')::integer, 1,
  'AND/OR plus rule and group NOT are evaluated server-side');
select throws_ok(
  $$select public.catalog_filter_search(p_filters => '{"id":"root","operator":"and","children":[{"id":"one","operator":"and","children":[{"id":"two","operator":"and","children":[{"id":"three","operator":"and","children":[]}]}]}]}'::jsonb)$$,
  '22023', 'talence_catalog_filter_invalid',
  'server validation rejects groups nested beyond two levels'
);
with first_page as (
  select public.catalog_filter_search(
    p_query => 'Tie Card',
    p_filters => '{"id":"root","operator":"and","children":[{"id":"lang","field":"language","comparator":"is","value":["en","ja"]}]}'::jsonb,
    p_return_all_variants => true,
    p_limit => 1
  ) as result
), second_page as (
  select public.catalog_filter_search(
    p_query => 'Tie Card',
    p_filters => '{"id":"root","operator":"and","children":[{"id":"lang","field":"language","comparator":"is","value":["en","ja"]}]}'::jsonb,
    p_return_all_variants => true,
    p_limit => 1,
    p_after => first_page.result ->> 'next_cursor'
  ) as result
  from first_page
)
select isnt(
  first_page.result -> 'items' -> 0 ->> 'printing_id',
  second_page.result -> 'items' -> 0 ->> 'printing_id',
  'filtered keyset pagination remains stable without duplicate rows'
)
from first_page cross join second_page;

reset role;
set local role service_role;
select is(
  (
    public.admin_catalog_status(
      '82000000-0000-4000-8000-000000000001'
    ) -> 'state' ->> 'sync_enabled'
  ),
  'true',
  'platform admin status exposes the sync incident switch'
);
select is(
  (
    public.admin_queue_catalog_sync(
      '82000000-0000-4000-8000-000000000001',
      false,
      'manual'
    ) ->> 'status'
  ),
  'queued',
  'manual admin action queues work without importing in request'
);
select is(
  (
    public.admin_catalog_status(
      '82000000-0000-4000-8000-000000000001'
    ) -> 'queued_imports' -> 0 ->> 'status'
  ),
  'queued',
  'queued admin status objects include parser-required status'
);
select is(
  (
    public.admin_catalog_status(
      '82000000-0000-4000-8000-000000000001'
    ) -> 'queued_imports' -> 0 ->> 'trigger_type'
  ),
  'manual',
  'queued admin status objects include trigger metadata'
);
select is(
  (
    public.admin_queue_catalog_sync(
      '82000000-0000-4000-8000-000000000001',
      true,
      'manual'
    ) ->> 'replayed'
  ),
  'true',
  'manual queue replay coalesces duplicate work'
);
select is(
  (
    public.admin_queue_catalog_sync(
      '82000000-0000-4000-8000-000000000001',
      true,
      'manual'
    ) ->> 'force'
  ),
  'true',
  'queued replay can safely upgrade force before worker claim'
);

select * from finish();

rollback;
