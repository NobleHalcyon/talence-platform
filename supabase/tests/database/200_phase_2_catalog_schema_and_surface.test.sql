begin;

select plan(40);

select has_table('public', 'catalog_sets', 'catalog sets exist');
select has_table('public', 'catalog_cards', 'oracle cards exist');
select has_table('public', 'catalog_printings', 'printings exist');
select has_table('public', 'catalog_faces', 'ordered faces exist');
select has_table('public', 'catalog_legalities', 'legalities exist');
select has_table('public', 'catalog_external_ids', 'external IDs exist');
select has_table('public', 'current_prices', 'current prices exist');
select has_table('public', 'catalog_source_files', 'source file provenance exists');
select has_table('public', 'catalog_import_runs', 'import run provenance exists');
select has_table('public', 'catalog_state', 'active catalog pointer exists');

select has_table(
  'app_private',
  'catalog_stage_printings',
  'printing staging is private'
);
select has_table(
  'app_private',
  'catalog_stage_prices',
  'price staging is private'
);

select has_column(
  'public',
  'catalog_source_files',
  'dependency_sha256',
  'sets dependency checksum is first-class provenance'
);
select has_column(
  'public',
  'catalog_source_files',
  'catalog_identity_sha256',
  'combined catalog identity checksum is generated'
);
select has_column(
  'public',
  'catalog_printings',
  'color_identity',
  'printing-level color identity exists for non-oracle objects'
);
select col_not_null(
  'public',
  'catalog_printings',
  'color_identity',
  'active printing color identity is never null'
);
select has_column(
  'app_private',
  'catalog_stage_printings',
  'color_identity',
  'staging preserves printing-level color identity'
);
select col_not_null(
  'app_private',
  'catalog_stage_printings',
  'color_identity',
  'staged printing color identity is never null'
);
select col_not_null(
  'public',
  'current_prices',
  'amount',
  'a current price row can never represent a missing amount'
);

select has_function(
  'app_private',
  'catalog_promote_import',
  array['uuid', 'text'],
  'trusted atomic promotion exists'
);
select has_function(
  'app_private',
  'catalog_complete_queued_noop',
  array[
    'uuid',
    'text',
    'text',
    'text',
    'timestamp with time zone',
    'text',
    'text'
  ],
  'trusted queued no-op completion exists'
);
select has_function(
  'public',
  'catalog_search',
  array[
    'text',
    'text',
    'text',
    'text',
    'text',
    'public.card_finish',
    'text[]',
    'text[]',
    'text',
    'boolean',
    'text',
    'numeric',
    'numeric',
    'date',
    'date',
    'boolean',
    'boolean',
    'text',
    'text',
    'integer'
  ],
  'bounded catalog search has explicit typed filters'
);
select has_function(
  'public',
  'catalog_card_detail',
  array['uuid'],
  'oracle card detail RPC exists'
);
select has_function(
  'public',
  'catalog_printing_detail',
  array['uuid'],
  'printing detail RPC exists'
);
select has_function(
  'public',
  'catalog_set_detail',
  array['text'],
  'set-code detail RPC exists'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'catalog_sets',
        'catalog_cards',
        'catalog_printings',
        'catalog_faces',
        'catalog_legalities',
        'catalog_external_ids',
        'current_prices',
        'catalog_source_files',
        'catalog_import_runs',
        'catalog_state'
      )
      and relation.relrowsecurity
  ),
  10,
  'every Phase 2 exposed table has RLS enabled'
);

select ok(
  not has_schema_privilege('authenticated', 'app_private', 'CREATE'),
  'authenticated users cannot create private staging objects'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.catalog_stage_printings',
    'SELECT'
  ),
  'authenticated users cannot read staging'
);
select ok(
  has_table_privilege(
    'service_role',
    'app_private.catalog_stage_printings',
    'INSERT'
  ),
  'the trusted worker role can batch stage printings'
);
select ok(
  has_function_privilege(
    'service_role',
    'app_private.catalog_complete_queued_noop(uuid,text,text,text,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'the trusted worker role can complete an unchanged queued import'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.catalog_complete_queued_noop(uuid,text,text,text,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'ordinary authenticated users cannot complete queued imports'
);
select ok(
  not has_function_privilege(
    'anon',
    'app_private.catalog_complete_queued_noop(uuid,text,text,text,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot complete queued imports'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.catalog_printings',
    'INSERT'
  ),
  'ordinary users cannot insert catalog rows'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.catalog_printings',
    'UPDATE'
  ),
  'ordinary users cannot update catalog rows'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.catalog_printings',
    'DELETE'
  ),
  'ordinary users cannot delete catalog rows'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.current_prices',
    'SELECT'
  ),
  'browser price reads must use freshness-aware RPCs'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.catalog_import_runs',
    'SELECT'
  ),
  'catalog operations are not directly visible to users'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.catalog_search(text,text,text,text,text,public.card_finish,text[],text[],text,boolean,text,numeric,numeric,date,date,boolean,boolean,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated sessions may execute bounded catalog search'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.catalog_search(text,text,text,text,text,public.card_finish,text[],text[],text,boolean,text,numeric,numeric,date,date,boolean,boolean,text,text,integer)',
    'EXECUTE'
  ),
  'anonymous sessions cannot search the catalog'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_queue_catalog_sync(uuid,boolean,text)',
    'EXECUTE'
  ),
  'ordinary authenticated users cannot queue catalog work'
);

select * from finish();

rollback;
