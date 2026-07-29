begin;

select no_plan();

select has_table('public', 'deck_formats', 'stable deck formats exist');
select has_table(
  'public',
  'deck_format_versions',
  'append-only format versions exist'
);
select has_table('public', 'decks', 'workspace decks exist');
select has_table('public', 'deck_entries', 'oracle deck entries exist');
select has_table(
  'public',
  'deck_inventory_sources',
  'ordered inventory sources exist'
);
select has_table(
  'public',
  'deck_revisions',
  'immutable deck revisions exist'
);
select has_table(
  'public',
  'deck_validation_runs',
  'persisted validation evidence exists'
);

select enum_has_labels(
  'public',
  'deck_zone',
  array[
    'mainboard',
    'sideboard',
    'commander',
    'companion',
    'maybeboard'
  ],
  'deck zones match canon'
);

select has_column(
  'public',
  'decks',
  'format_version_id',
  'decks pin an exact rules version'
);
select has_column(
  'public',
  'decks',
  'current_revision',
  'decks expose optimistic revision concurrency'
);
select has_column(
  'public',
  'deck_entries',
  'preferred_finish',
  'preferred valuation pins a finish'
);
select has_column(
  'public',
  'deck_revisions',
  'content_hash',
  'revisions preserve canonical logical hashes'
);
select has_column(
  'public',
  'deck_validation_runs',
  'catalog_version',
  'validation evidence pins a catalog version'
);
select has_column(
  'public',
  'deck_validation_runs',
  'deck_revision_id',
  'validation evidence links an immutable revision'
);

select is(
  (select count(*)::integer from public.deck_formats),
  7,
  'seven practical initial MTG formats are seeded'
);
select results_eq(
  $$
    select code
    from public.deck_formats
    order by code
  $$,
  $$
    values
      ('commander'::text),
      ('legacy'::text),
      ('modern'::text),
      ('pauper'::text),
      ('pioneer'::text),
      ('standard'::text),
      ('vintage'::text)
  $$,
  'seeded format codes match Scryfall legality codes'
);
select is(
  (
    select count(*)::integer
    from public.deck_format_versions
    where version = 1
      and rules_metadata ->> 'verified_on' = '2026-07-26'
      and rules_metadata ->> 'official_url'
        like 'https://magic.wizards.com/en/formats/%'
  ),
  7,
  'every baseline records official verification provenance'
);
select is(
  (
    select minimum_mainboard
    from public.deck_format_versions
    where format_code = 'standard'
  ),
  60,
  'constructed baseline requires sixty mainboard cards'
);
select is(
  (
    select sideboard_max
    from public.deck_format_versions
    where format_code = 'modern'
  ),
  15,
  'constructed baseline caps sideboard capacity at fifteen'
);
select is(
  (
    select companion_consumes_sideboard
    from public.deck_format_versions
    where format_code = 'pioneer'
  ),
  true,
  'constructed companion consumes sideboard capacity'
);
select results_eq(
  $$
    select
      minimum_deck_size,
      maximum_deck_size,
      minimum_commander,
      maximum_commander,
      companion_max,
      companion_consumes_sideboard,
      enforce_color_identity
    from public.deck_format_versions
    where format_code = 'commander'
  $$,
  $$
    values (100, 100, 1, 2, 1, false, true)
  $$,
  'Commander baseline models exact 100, one or two commanders, and outside companion'
);

select throws_ok(
  $$
    update public.deck_format_versions
    set scope_note = scope_note || ' changed'
    where format_code = 'standard'
  $$,
  '55000',
  'talence_deck_format_version_append_only',
  'format versions cannot be updated'
);
select throws_ok(
  $$
    delete from public.deck_format_versions
    where format_code = 'standard'
  $$,
  '55000',
  'talence_deck_format_version_append_only',
  'format versions cannot be deleted'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'deck_formats',
        'deck_format_versions',
        'decks',
        'deck_entries',
        'deck_inventory_sources',
        'deck_revisions',
        'deck_validation_runs'
      )
      and relation.relrowsecurity
  ),
  7,
  'every exposed Phase 4 table has RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.decks', 'INSERT')
  and not has_table_privilege(
    'authenticated',
    'public.deck_entries',
    'UPDATE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.deck_revisions',
    'DELETE'
  ),
  'ordinary users have no direct deck write privileges'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.deck_list_ownership_summaries(uuid[])',
    'EXECUTE'
  ),
  'set-based list summary helper is not directly callable by users'
);
select ok(
  has_table_privilege('authenticated', 'public.decks', 'SELECT')
  and has_table_privilege(
    'authenticated',
    'public.deck_validation_runs',
    'SELECT'
  ),
  'authenticated reads remain RLS-bound'
);

select has_function(
  'public',
  'deck_list',
  array[
    'uuid',
    'boolean',
    'text',
    'integer',
    'resource_status'
  ],
  'bounded cursor deck list exists'
);
select has_function(
  'public',
  'deck_create',
  array[
    'uuid',
    'text',
    'text',
    'text',
    'text',
    'text[]',
    'uuid[]'
  ],
  'deck create RPC exists'
);
select has_function(
  'public',
  'deck_entry_add',
  array[
    'uuid',
    'uuid',
    'public.deck_zone',
    'integer',
    'integer',
    'uuid',
    'public.card_finish',
    'text'
  ],
  'preferred-finish entry mutation exists'
);
select has_function(
  'public',
  'calculate_deck_ownership',
  array['uuid', 'text'],
  'finite ownership RPC exists'
);
select has_function(
  'public',
  'validate_deck',
  array['uuid'],
  'persisted advisory validation RPC exists'
);
select has_function(
  'public',
  'deck_card_printings',
  array['uuid', 'uuid', 'text', 'integer', 'text'],
  'bounded preferred-printing chooser RPC exists'
);
select has_function(
  'public',
  'deck_export',
  array['uuid'],
  'plain-text and stable JSON export exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.deck_create(uuid,text,text,text,text,text[],uuid[])',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.deck_create(uuid,text,text,text,text,text[],uuid[])',
    'EXECUTE'
  ),
  'deck mutations are authenticated-only'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.deck_content_snapshot(uuid)',
    'EXECUTE'
  ),
  'canonical revision internals are private'
);

select * from finish();
rollback;
