begin;

select no_plan();

select has_table(
  'public',
  'inventory_balances',
  'workspace-scoped inventory balances exist'
);
select has_table(
  'public',
  'inventory_transactions',
  'immutable inventory transaction headers exist'
);
select has_table(
  'public',
  'inventory_transaction_lines',
  'immutable inventory transaction lines exist'
);
select has_table(
  'public',
  'inventory_import_jobs',
  'bounded inventory import jobs exist'
);
select has_table(
  'public',
  'inventory_import_rows',
  'bounded inventory import staging rows exist'
);
select has_table(
  'app_private',
  'inventory_operation_requests',
  'canonical request hashes remain private'
);

select has_column(
  'public',
  'collections',
  'cover_printing_id',
  'collections support catalog-backed covers'
);
select has_column(
  'public',
  'inventory_balances',
  'workspace_id',
  'balances carry explicit workspace scope'
);
select has_column(
  'public',
  'inventory_transactions',
  'transfer_group_id',
  'transaction headers support paired transfers'
);
select has_column(
  'public',
  'inventory_transactions',
  'reverses_transaction_id',
  'transaction headers support compensating reversal links'
);
select has_column(
  'public',
  'inventory_import_jobs',
  'purged_at',
  'import retention is first-class'
);

select enum_has_labels(
  'public',
  'card_condition',
  array[
    'unknown',
    'near_mint',
    'lightly_played',
    'moderately_played',
    'heavily_played',
    'damaged'
  ],
  'card condition is bounded by the canonical enum'
);
select enum_has_labels(
  'public',
  'inventory_source',
  array[
    'manual',
    'csv_import',
    'device',
    'transfer',
    'reversal',
    'admin_correction'
  ],
  'inventory sources are bounded'
);

select has_function(
  'public',
  'apply_inventory_transaction',
  array[
    'uuid',
    'text',
    'timestamp with time zone',
    'jsonb',
    'text',
    'text',
    'jsonb'
  ],
  'bounded human ledger mutation RPC exists'
);
select has_function(
  'public',
  'transfer_inventory',
  array[
    'uuid',
    'uuid',
    'text',
    'timestamp with time zone',
    'jsonb',
    'text',
    'jsonb'
  ],
  'atomic transfer RPC exists'
);
select has_function(
  'public',
  'reverse_inventory_transaction',
  array['uuid', 'text', 'timestamp with time zone', 'text'],
  'compensating reversal RPC exists'
);
select has_function(
  'public',
  'collection_transaction_lines',
  array['uuid', 'integer', 'integer'],
  'bounded complete transaction-line paging RPC exists'
);
select has_function(
  'public',
  'collection_analytics',
  array[
    'uuid',
    'text',
    'text',
    'public.card_finish',
    'public.card_condition',
    'text'
  ],
  'analytical inventory RPC exposes the structured-view filters'
);
select has_function(
  'public',
  'inventory_import_commit',
  array['uuid', 'text', 'timestamp with time zone', 'text'],
  'atomic inventory import commit RPC exists'
);
select has_function(
  'public',
  'inventory_import_mark_purged',
  array['uuid', 'timestamp with time zone'],
  'storage-coordinated retention completion RPC exists'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'inventory_balances',
        'inventory_transactions',
        'inventory_transaction_lines',
        'inventory_import_jobs',
        'inventory_import_rows'
      )
      and relation.relrowsecurity
  ),
  5,
  'every exposed Phase 3 inventory table has RLS enabled'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.inventory_balances',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.inventory_balances',
    'UPDATE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.inventory_balances',
    'DELETE'
  ),
  'ordinary sessions have no direct balance write privilege'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.inventory_transactions',
    'UPDATE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.inventory_transaction_lines',
    'DELETE'
  ),
  'ordinary sessions have no history mutation privilege'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.inventory_operation_requests',
    'SELECT'
  ),
  'ordinary sessions cannot read request hashes or raw idempotency keys'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.collection_transaction_lines(uuid,integer,integer)',
    'EXECUTE'
  ),
  'authenticated sessions can use safe history-line paging'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.collection_analytics(uuid,text,text,public.card_finish,public.card_condition,text)',
    'EXECUTE'
  ),
  'authenticated sessions can use filter-aligned analytics'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.inventory_import_mark_purged(uuid,timestamp with time zone)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.inventory_import_mark_purged(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'retention completion is service-only'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_inventory_transaction(uuid,text,timestamp with time zone,jsonb,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous sessions cannot mutate inventory'
);

select is(
  (
    select bucket.public
    from storage.buckets as bucket
    where bucket.id = 'inventory-imports'
  ),
  false,
  'the inventory import bucket is private'
);
select is(
  (
    select bucket.file_size_limit
    from storage.buckets as bucket
    where bucket.id = 'inventory-imports'
  ),
  2097152::bigint,
  'the import bucket has the canonical 2 MiB bound'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation
      on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy.polname like 'inventory_import_objects_%'
      and policy.polcmd in ('w', 'd')
  ),
  0,
  'ordinary import-object policies permit no update or delete'
);

select is(
  (
    select constraint_record.confdeltype::text
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conname = 'collections_workspace_id_fkey'
  ),
  'r',
  'collection workspace deletion is restricted once Phase 3 data exists'
);

select * from finish();
rollback;
