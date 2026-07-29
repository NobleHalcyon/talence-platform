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
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000011',
  'phase6-controls-a@example.test'
);
select pg_temp.create_admitted_user(
  '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000012',
  'phase6-controls-b@example.test'
);

select set_config(
  'test.user_a',
  '60000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.user_b',
  '60000000-0000-4000-8000-000000000012',
  true
);
select set_config(
  'test.workspace_a',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_a')::uuid
  ),
  true
);
select set_config(
  'test.workspace_b',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.user_b')::uuid
  ),
  true
);

select has_table(
  'public',
  'audit_events',
  'safe audit events are part of the exposed RLS surface'
);
select has_table(
  'app_private',
  'application_feature_policies',
  'application incident and quota policies are private'
);
select has_table(
  'app_private',
  'application_usage_windows',
  'application usage windows are private'
);
select has_table(
  'app_private',
  'external_service_policies',
  'external-service policies are private'
);
select has_table(
  'app_private',
  'external_service_usage_daily',
  'external-service usage is private'
);
select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'audit_events'
  ),
  'audit events enforce RLS'
);

select ok(
  not has_table_privilege('anon', 'public.audit_events', 'SELECT')
    and not has_table_privilege(
      'authenticated',
      'public.audit_events',
      'INSERT'
    )
    and not has_table_privilege(
      'authenticated',
      'app_private.application_feature_policies',
      'SELECT'
    )
    and not has_table_privilege(
      'service_role',
      'app_private.external_service_usage_daily',
      'SELECT'
    ),
  'audit writes and all private operational tables are denied directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.consume_application_feature_quota(text,uuid,integer,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.consume_application_feature_quota(text,uuid,integer,uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.consume_external_service_quota(text,integer,uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.consume_external_service_quota(text,integer,uuid,uuid,uuid,uuid)',
      'EXECUTE'
    ),
  'application and external quota functions have distinct least-privilege callers'
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_a'),
  true
);
set local role authenticated;

select is(
  public.consume_application_feature_quota(
    'catalog_search',
    current_setting('test.workspace_a')::uuid,
    24,
    '60000000-0000-4000-8000-000000000020'
  ) ->> 'day_units',
  '24',
  'an admitted user atomically reserves bounded catalog-search work'
);
select is(
  public.consume_application_feature_quota(
    'catalog_search',
    current_setting('test.workspace_a')::uuid,
    24,
    '60000000-0000-4000-8000-000000000021'
  ) ->> 'day_units',
  '48',
  'application usage accumulates in the same daily principal window'
);
select throws_ok(
  format(
    $statement$
      select public.consume_application_feature_quota(
        'catalog_search',
        %L::uuid,
        1,
        '60000000-0000-4000-8000-000000000022'
      )
    $statement$,
    current_setting('test.workspace_b')
  ),
  '42501',
  'talence_application_quota_authorization_denied',
  'an admitted user cannot charge a different workspace'
);
select throws_ok(
  $statement$
    select public.consume_application_feature_quota(
      'catalog_search',
      current_setting('test.workspace_a')::uuid,
      201,
      '60000000-0000-4000-8000-000000000023'
    )
  $statement$,
  '22023',
  'talence_application_request_too_large',
  'application work units are bounded before execution'
);
select throws_ok(
  $$select public.admin_operational_controls()$$,
  '42501',
  'talence_platform_admin_required',
  'ordinary admitted users cannot inspect platform controls'
);

reset role;

update app_private.application_feature_policies
set enabled = false
where feature_key = 'catalog_search';

set local role authenticated;
select throws_ok(
  $statement$
    select public.consume_application_feature_quota(
      'catalog_search',
      current_setting('test.workspace_a')::uuid,
      1,
      '60000000-0000-4000-8000-000000000024'
    )
  $statement$,
  '55000',
  'talence_application_feature_disabled',
  'database-backed application kill switches fail closed'
);
reset role;

update app_private.application_feature_policies
set
  enabled = true,
  per_minute_requests = 2,
  per_day_requests = 2
where feature_key = 'catalog_search';

set local role authenticated;
select throws_ok(
  $statement$
    select public.consume_application_feature_quota(
      'catalog_search',
      current_setting('test.workspace_a')::uuid,
      1,
      '60000000-0000-4000-8000-000000000025'
    )
  $statement$,
  'P0001',
  'talence_application_quota_exceeded',
  'application request quotas fail before high-cost work'
);
reset role;

set local role service_role;
select is(
  public.consume_external_service_quota(
    'managed_auth_invitation',
    1,
    current_setting('test.user_a')::uuid,
    current_setting('test.workspace_a')::uuid,
    null,
    '60000000-0000-4000-8000-000000000030'
  ) ->> 'units_reserved',
  '1',
  'the trusted adapter reserves external-service units before a provider call'
);
select throws_ok(
  format(
    $statement$
      select public.consume_external_service_quota(
        'managed_auth_invitation',
        1,
        %L::uuid,
        %L::uuid,
        null,
        '60000000-0000-4000-8000-000000000031'
      )
    $statement$,
    current_setting('test.user_a'),
    current_setting('test.workspace_b')
  ),
  '42501',
  'talence_external_service_authorization_denied',
  'the external adapter cannot charge a mismatched user/workspace scope'
);
reset role;

select is(
  (
    select count(usage.id)::integer
    from app_private.external_service_usage_daily as usage
    where usage.service_key = 'managed_auth_invitation'
  ),
  3,
  'one reservation atomically records global, user, and workspace scopes'
);
select is(
  (
    select sum(usage.units_consumed)::integer
    from app_private.external_service_usage_daily as usage
    where usage.service_key = 'managed_auth_invitation'
  ),
  3,
  'every applicable external-service scope consumes the same reserved unit'
);

update app_private.external_service_policies
set global_daily_units = 1
where service_key = 'managed_auth_invitation';

set local role service_role;
select throws_ok(
  $statement$
    select public.consume_external_service_quota(
      'managed_auth_invitation',
      1,
      current_setting('test.user_a')::uuid,
      current_setting('test.workspace_a')::uuid,
      null,
      '60000000-0000-4000-8000-000000000032'
    )
  $statement$,
  'P0001',
  'talence_external_service_quota_exceeded',
  'external-service global budget exhaustion fails closed'
);
reset role;

insert into public.devices (
  id,
  workspace_id,
  name,
  type,
  created_by_user_id
)
values (
  '60000000-0000-4000-8000-000000000050',
  current_setting('test.workspace_a')::uuid,
  'Generic external quota device',
  'scanner',
  current_setting('test.user_a')::uuid
);
insert into app_private.external_service_policies (
  service_key,
  enabled,
  global_daily_units,
  per_workspace_daily_units,
  per_device_daily_units
)
values ('fixture_external_adapter', true, 10, 10, 2);

set local role service_role;
select is(
  public.consume_external_service_quota(
    'fixture_external_adapter',
    1,
    null,
    current_setting('test.workspace_a')::uuid,
    '60000000-0000-4000-8000-000000000050',
    '60000000-0000-4000-8000-000000000051'
  ) ->> 'units_reserved',
  '1',
  'the generic adapter model supports a device-scoped external service'
);
select is(
  public.consume_external_service_quota(
    'fixture_external_adapter',
    1,
    null,
    current_setting('test.workspace_a')::uuid,
    '60000000-0000-4000-8000-000000000050',
    '60000000-0000-4000-8000-000000000052'
  ) ->> 'units_reserved',
  '1',
  'generic device quota reservations accumulate atomically'
);
select throws_ok(
  $statement$
    select public.consume_external_service_quota(
      'fixture_external_adapter',
      1,
      null,
      current_setting('test.workspace_a')::uuid,
      '60000000-0000-4000-8000-000000000050',
      '60000000-0000-4000-8000-000000000053'
    )
  $statement$,
  'P0001',
  'talence_external_service_quota_exceeded',
  'a generic device-scoped external adapter fails closed at its configured limit'
);
reset role;

select is(
  (
    select count(*)::integer
    from app_private.external_service_usage_daily as usage
    where usage.service_key = 'fixture_external_adapter'
  ),
  3,
  'generic external usage records only the applicable global, workspace, and device scopes'
);

select throws_ok(
  $statement$
    select app_private.record_audit_event(
      current_setting('test.user_a')::uuid,
      'security.test',
      'succeeded',
      current_setting('test.workspace_a')::uuid,
      null,
      null,
      '60000000-0000-4000-8000-000000000040',
      '{"token":"must-not-be-recorded"}'::jsonb
    )
  $statement$,
  '22023',
  'talence_audit_event_invalid',
  'secret-bearing audit metadata is rejected at the database boundary'
);

insert into public.platform_user_roles (user_id, role)
values (
  current_setting('test.user_a')::uuid,
  'platform_admin'
);
select set_config(
  'test.application_policy_updated_at',
  (
    select policy.updated_at::text
    from app_private.application_feature_policies as policy
    where policy.feature_key = 'collection_analytics'
  ),
  true
);
select set_config(
  'test.external_policy_updated_at',
  (
    select policy.updated_at::text
    from app_private.external_service_policies as policy
    where policy.service_key = 'managed_auth_invitation'
  ),
  true
);
select set_config(
  'test.device_policy_updated_at',
  (
    select policy.updated_at::text
    from app_private.device_feature_policies as policy
    where policy.feature_key = 'device_inventory_writes'
  ),
  true
);

set local role authenticated;
select is(
  jsonb_array_length(
    public.admin_operational_controls() -> 'application_features'
  ),
  2,
  'platform administrators can inspect all application incident controls'
);
select is(
  public.admin_application_feature_policy_update(
    'collection_analytics',
    false,
    30,
    1000,
    500000,
    5000,
    current_setting('test.application_policy_updated_at')::timestamptz,
    '60000000-0000-4000-8000-000000000041'
  ) ->> 'enabled',
  'false',
  'platform administrators can close a high-cost application route'
);
select is(
  public.admin_external_service_policy_update(
    'managed_auth_invitation',
    false,
    100,
    20,
    50,
    null,
    current_setting('test.external_policy_updated_at')::timestamptz,
    '60000000-0000-4000-8000-000000000042'
  ) ->> 'enabled',
  'false',
  'platform administrators can close an external-service adapter'
);
select is(
  public.admin_operational_control_toggle(
    'device',
    'device_inventory_writes',
    false,
    current_setting('test.device_policy_updated_at')::timestamptz,
    '60000000-0000-4000-8000-000000000044'
  ) ->> 'enabled',
  'false',
  'the generic control adapter safely toggles an existing device policy'
);
select is(
  (
    select count(event.id)::integer
    from public.audit_events as event
  ),
  3,
  'successful administrative control changes write safe audit events'
);
select throws_ok(
  format(
    $statement$
      select public.admin_application_feature_policy_update(
        'collection_analytics',
        true,
        30,
        1000,
        500000,
        5000,
        %L::timestamptz,
        '60000000-0000-4000-8000-000000000043'
      )
    $statement$,
    current_setting('test.application_policy_updated_at')
  ),
  '40001',
  'talence_application_feature_policy_stale',
  'application control changes use optimistic concurrency'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.user_b'),
  true
);
set local role authenticated;
select is(
  (
    select count(event.id)::integer
    from public.audit_events as event
  ),
  0,
  'ordinary users in another workspace cannot read platform audit events'
);
reset role;

set local role anon;
select throws_ok(
  $$select count(*) from public.audit_events$$,
  '42501',
  'permission denied for table audit_events',
  'anonymous callers have no audit-event table grant'
);
reset role;

select * from finish();

rollback;
