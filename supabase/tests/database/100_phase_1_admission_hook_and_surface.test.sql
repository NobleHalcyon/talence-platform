begin;

select plan(25);

select has_schema(
  'app_private',
  'Phase 1 creates the non-exposed private schema'
);

select has_schema(
  'app_api',
  'Phase 1 creates the non-exposed authorization helper schema'
);

select has_table(
  'app_private',
  'invited_users',
  'the canonical private admission ledger exists'
);

select has_table(
  'public',
  'profiles',
  'profiles exist in the exposed schema'
);

select has_table(
  'public',
  'workspaces',
  'workspaces exist as the tenancy root'
);

select has_table(
  'public',
  'collections',
  'the default-collection prerequisite exists'
);

select has_function(
  'app_private',
  'before_user_created_hook',
  array['jsonb'],
  'the Supabase Before User Created hook exists'
);

select has_function(
  'public',
  'finalize_admitted_user',
  array[]::text[],
  'the authenticated admission finalizer exists'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
  ),
  'profiles have RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles',
        'platform_user_roles',
        'workspaces',
        'workspace_memberships',
        'workspace_invitations',
        'user_preferences',
        'games',
        'collections'
      )
      and c.relrowsecurity
  ),
  8,
  'every Phase 1 exposed table has RLS enabled'
);

select ok(
  not has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  'authenticated users cannot resolve private-ledger objects'
);

select ok(
  has_schema_privilege('authenticated', 'app_api', 'USAGE'),
  'authenticated users may resolve only the narrowly granted policy helpers'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'app_private.before_user_created_hook(jsonb)',
    'EXECUTE'
  ),
  'Supabase Auth may execute the creation hook'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.before_user_created_hook(jsonb)',
    'EXECUTE'
  ),
  'authenticated users cannot execute the creation hook'
);

select ok(
  not has_function_privilege(
    'service_role',
    'app_private.before_user_created_hook(jsonb)',
    'EXECUTE'
  ),
  'the service role cannot bypass the dedicated hook grant'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.finalize_admitted_user()',
    'EXECUTE'
  ),
  'authenticated users may execute only their no-argument finalizer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.finalize_admitted_user()',
    'EXECUTE'
  ),
  'anonymous users cannot execute admission finalization'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_prepare_invited_user(uuid,text,timestamp with time zone,text)',
    'EXECUTE'
  ),
  'the service role may execute the trusted invitation preparation RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_prepare_invited_user(uuid,text,timestamp with time zone,text)',
    'EXECUTE'
  ),
  'ordinary authenticated users cannot execute trusted invitation RPCs'
);

select is(
  app_private.before_user_created_hook(
    '{"user":{"email":"unknown@example.test"}}'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'an unknown email is rejected by the auth hook'
);

insert into app_private.invited_users (email, expires_at)
values ('  VALID@Example.Test  ', statement_timestamp() + interval '1 day');

select is(
  (
    select email
    from app_private.invited_users
    where email = 'valid@example.test'
  ),
  'valid@example.test',
  'invitation email is stored in normalized form'
);

select is(
  app_private.before_user_created_hook(
    '{"user":{"email":"Valid@Example.Test"}}'::jsonb
  ),
  '{}'::jsonb,
  'a current draft invitation is allowed by the auth hook'
);

insert into app_private.invited_users (email, expires_at)
values ('expired@example.test', statement_timestamp() - interval '1 minute');

select is(
  app_private.before_user_created_hook(
    '{"user":{"email":"expired@example.test"}}'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'an expired invitation is rejected by the auth hook'
);

insert into app_private.invited_users (
  email,
  status,
  expires_at,
  revoked_at
)
values (
  'revoked@example.test',
  'revoked',
  statement_timestamp() + interval '1 day',
  statement_timestamp()
);

select is(
  app_private.before_user_created_hook(
    '{"user":{"email":"revoked@example.test"}}'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'a revoked invitation is rejected by the auth hook'
);

insert into app_private.invited_users (
  email,
  status,
  expires_at,
  last_error_code
)
values (
  'failed@example.test',
  'failed',
  statement_timestamp() + interval '1 day',
  'provider_failure'
);

select is(
  app_private.before_user_created_hook(
    '{"user":{"email":"failed@example.test"}}'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'a failed invitation is rejected by the auth hook'
);

select * from finish();

rollback;
