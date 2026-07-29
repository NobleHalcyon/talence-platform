-- Phase 6: application and external-service quotas, incident controls,
-- safe audit events, and operator-facing control functions.

create function app_private.safe_audit_metadata_valid(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_metadata is not null
    and jsonb_typeof(p_metadata) = 'object'
    and pg_column_size(p_metadata) <= 8192
    and p_metadata::text !~* '"(?:authorization|cookie|credential|database_url|password|raw_body|raw_payload|secret|signed_url|token)"[[:space:]]*:';
$$;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null
    references auth.users (id) on delete set null,
  event_type text not null,
  result_code text not null,
  workspace_id uuid null
    references public.workspaces (id) on delete set null,
  resource_type text null,
  resource_id uuid null,
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint audit_events_event_type_valid check (
    char_length(event_type) between 3 and 100
    and event_type ~ '^[a-z][a-z0-9_.-]*$'
  ),
  constraint audit_events_result_code_valid check (
    char_length(result_code) between 2 and 100
    and result_code ~ '^[a-z][a-z0-9_.-]*$'
  ),
  constraint audit_events_resource_type_valid check (
    resource_type is null
    or (
      char_length(resource_type) between 2 and 64
      and resource_type ~ '^[a-z][a-z0-9_]*$'
    )
  ),
  constraint audit_events_resource_pair check (
    (resource_type is null) = (resource_id is null)
  ),
  constraint audit_events_metadata_safe check (
    app_private.safe_audit_metadata_valid(metadata)
  )
);

create index audit_events_occurred_idx
  on public.audit_events (occurred_at desc, id desc);

create index audit_events_workspace_occurred_idx
  on public.audit_events (workspace_id, occurred_at desc, id desc)
  where workspace_id is not null;

create index audit_events_correlation_idx
  on public.audit_events (correlation_id);

create table app_private.application_feature_policies (
  feature_key text primary key,
  enabled boolean not null default true,
  per_minute_requests integer not null,
  per_day_requests integer not null,
  per_day_units integer not null,
  max_units_per_request integer not null,
  updated_by_user_id uuid null
    references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint application_feature_policies_key_valid check (
    feature_key in (
      'catalog_search',
      'collection_analytics'
    )
  ),
  constraint application_feature_policies_limits_valid check (
    per_minute_requests between 1 and 10000
    and per_day_requests between 1 and 10000000
    and per_day_units between 1 and 100000000
    and max_units_per_request between 1 and 1000000
  )
);

create trigger application_feature_policies_set_updated_at
before update on app_private.application_feature_policies
for each row execute function app_private.set_updated_at();

insert into app_private.application_feature_policies (
  feature_key,
  enabled,
  per_minute_requests,
  per_day_requests,
  per_day_units,
  max_units_per_request
)
values
  ('catalog_search', true, 120, 10000, 240000, 200),
  ('collection_analytics', true, 30, 1000, 500000, 5000);

create table app_private.application_usage_windows (
  feature_key text not null
    references app_private.application_feature_policies (feature_key)
    on delete restrict,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  workspace_id uuid not null
    references public.workspaces (id) on delete cascade,
  window_seconds integer not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  units_consumed bigint not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (
    feature_key,
    user_id,
    workspace_id,
    window_seconds,
    window_started_at
  ),
  constraint application_usage_windows_window_valid check (
    window_seconds in (60, 86400)
  ),
  constraint application_usage_windows_counts_nonnegative check (
    request_count >= 0 and units_consumed >= 0
  )
);

create index application_usage_windows_retention_idx
  on app_private.application_usage_windows (
    window_started_at,
    feature_key,
    workspace_id,
    user_id
  );

create table app_private.external_service_policies (
  service_key text primary key,
  enabled boolean not null default false,
  global_daily_units integer null,
  per_user_daily_units integer null,
  per_workspace_daily_units integer null,
  per_device_daily_units integer null,
  updated_by_user_id uuid null
    references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint external_service_policies_key_valid check (
    char_length(service_key) between 3 and 80
    and service_key ~ '^[a-z][a-z0-9_.-]*$'
  ),
  constraint external_service_policies_some_limit check (
    global_daily_units is not null
    or per_user_daily_units is not null
    or per_workspace_daily_units is not null
    or per_device_daily_units is not null
  ),
  constraint external_service_policies_limits_valid check (
    (global_daily_units is null or global_daily_units between 1 and 1000000000)
    and (
      per_user_daily_units is null
      or per_user_daily_units between 1 and 1000000000
    )
    and (
      per_workspace_daily_units is null
      or per_workspace_daily_units between 1 and 1000000000
    )
    and (
      per_device_daily_units is null
      or per_device_daily_units between 1 and 1000000000
    )
  )
);

create trigger external_service_policies_set_updated_at
before update on app_private.external_service_policies
for each row execute function app_private.set_updated_at();

-- Managed Auth invitation email is the only private-beta user-triggered
-- external provider operation. All future metered adapters must first add a
-- reviewed policy row and remain disabled until explicitly enabled.
insert into app_private.external_service_policies (
  service_key,
  enabled,
  global_daily_units,
  per_user_daily_units,
  per_workspace_daily_units
)
values ('managed_auth_invitation', true, 100, 20, 50);

create table app_private.external_service_usage_daily (
  id bigint generated always as identity primary key,
  usage_date date not null,
  service_key text not null
    references app_private.external_service_policies (service_key)
    on delete restrict,
  scope_kind text not null,
  user_id uuid null
    references auth.users (id) on delete cascade,
  workspace_id uuid null
    references public.workspaces (id) on delete cascade,
  device_id uuid null
    references public.devices (id) on delete cascade,
  units_consumed bigint not null default 0,
  request_count integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint external_service_usage_scope_kind_valid check (
    scope_kind in ('global', 'user', 'workspace', 'device')
  ),
  constraint external_service_usage_scope_shape check (
    (
      scope_kind = 'global'
      and user_id is null
      and workspace_id is null
      and device_id is null
    )
    or (
      scope_kind = 'user'
      and user_id is not null
      and workspace_id is null
      and device_id is null
    )
    or (
      scope_kind = 'workspace'
      and user_id is null
      and workspace_id is not null
      and device_id is null
    )
    or (
      scope_kind = 'device'
      and user_id is null
      and workspace_id is null
      and device_id is not null
    )
  ),
  constraint external_service_usage_counts_nonnegative check (
    units_consumed >= 0 and request_count >= 0
  )
);

create unique index external_service_usage_scope_unique
  on app_private.external_service_usage_daily (
    usage_date,
    service_key,
    scope_kind,
    user_id,
    workspace_id,
    device_id
  ) nulls not distinct;

create index external_service_usage_retention_idx
  on app_private.external_service_usage_daily (
    usage_date,
    service_key,
    scope_kind
  );

create function app_private.record_audit_event(
  p_actor_user_id uuid,
  p_event_type text,
  p_result_code text,
  p_workspace_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
begin
  if p_event_type is null
    or p_event_type !~ '^[a-z][a-z0-9_.-]{2,99}$'
    or p_result_code is null
    or p_result_code !~ '^[a-z][a-z0-9_.-]{1,99}$'
    or p_correlation_id is null
    or (p_resource_type is null) <> (p_resource_id is null)
    or (
      p_resource_type is not null
      and p_resource_type !~ '^[a-z][a-z0-9_]{1,63}$'
    )
    or not app_private.safe_audit_metadata_valid(
      coalesce(p_metadata, '{}'::jsonb)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_audit_event_invalid';
  end if;

  if p_actor_user_id is not null
    and not app_api.is_admitted_user(p_actor_user_id)
  then
    raise exception using
      errcode = '42501',
      message = 'talence_audit_actor_invalid';
  end if;

  if p_workspace_id is not null
    and p_actor_user_id is not null
    and not app_private.has_workspace_role_for_user(
      p_actor_user_id,
      p_workspace_id,
      'viewer'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_audit_workspace_invalid';
  end if;

  insert into public.audit_events (
    actor_user_id,
    event_type,
    result_code,
    workspace_id,
    resource_type,
    resource_id,
    correlation_id,
    metadata
  )
  values (
    p_actor_user_id,
    p_event_type,
    p_result_code,
    p_workspace_id,
    p_resource_type,
    p_resource_id,
    p_correlation_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create function public.consume_application_feature_quota(
  p_feature_key text,
  p_workspace_id uuid,
  p_units integer,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy app_private.application_feature_policies;
  v_minute_started_at timestamptz;
  v_day_started_at timestamptz;
  v_minute app_private.application_usage_windows;
  v_day app_private.application_usage_windows;
begin
  if v_user_id is null
    or p_workspace_id is null
    or p_feature_key is null
    or p_units is null
    or p_units < 1
    or p_correlation_id is null
    or not app_api.is_admitted_user(v_user_id)
    or not app_private.has_workspace_role_for_user(
      v_user_id,
      p_workspace_id,
      'viewer'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_application_quota_authorization_denied';
  end if;

  select policy.*
  into v_policy
  from app_private.application_feature_policies as policy
  where policy.feature_key = p_feature_key
  for update;

  if not found or not v_policy.enabled then
    raise exception using
      errcode = '55000',
      message = 'talence_application_feature_disabled',
      detail = jsonb_build_object('feature', p_feature_key)::text;
  end if;

  if p_units > v_policy.max_units_per_request then
    raise exception using
      errcode = '22023',
      message = 'talence_application_request_too_large',
      detail = jsonb_build_object(
        'feature', p_feature_key,
        'max_units_per_request', v_policy.max_units_per_request
      )::text;
  end if;

  v_minute_started_at := date_trunc('minute', statement_timestamp());
  v_day_started_at := (
    date_trunc('day', statement_timestamp() at time zone 'UTC')
      at time zone 'UTC'
  );

  insert into app_private.application_usage_windows (
    feature_key,
    user_id,
    workspace_id,
    window_seconds,
    window_started_at
  )
  values (
    p_feature_key,
    v_user_id,
    p_workspace_id,
    60,
    v_minute_started_at
  )
  on conflict do nothing;

  select usage.*
  into v_minute
  from app_private.application_usage_windows as usage
  where usage.feature_key = p_feature_key
    and usage.user_id = v_user_id
    and usage.workspace_id = p_workspace_id
    and usage.window_seconds = 60
    and usage.window_started_at = v_minute_started_at
  for update;

  insert into app_private.application_usage_windows (
    feature_key,
    user_id,
    workspace_id,
    window_seconds,
    window_started_at
  )
  values (
    p_feature_key,
    v_user_id,
    p_workspace_id,
    86400,
    v_day_started_at
  )
  on conflict do nothing;

  select usage.*
  into v_day
  from app_private.application_usage_windows as usage
  where usage.feature_key = p_feature_key
    and usage.user_id = v_user_id
    and usage.workspace_id = p_workspace_id
    and usage.window_seconds = 86400
    and usage.window_started_at = v_day_started_at
  for update;

  if v_minute.request_count + 1 > v_policy.per_minute_requests
    or v_day.request_count + 1 > v_policy.per_day_requests
    or v_day.units_consumed + p_units > v_policy.per_day_units
  then
    raise exception using
      errcode = 'P0001',
      message = 'talence_application_quota_exceeded',
      detail = jsonb_build_object(
        'feature', p_feature_key,
        'retry_after_seconds', case
          when v_minute.request_count + 1 > v_policy.per_minute_requests
            then 60
          else 86400
        end
      )::text;
  end if;

  update app_private.application_usage_windows
  set
    request_count = request_count + 1,
    units_consumed = units_consumed + p_units,
    updated_at = statement_timestamp()
  where feature_key = p_feature_key
    and user_id = v_user_id
    and workspace_id = p_workspace_id
    and window_seconds in (60, 86400)
    and window_started_at in (v_minute_started_at, v_day_started_at);

  return jsonb_build_object(
    'feature_key', p_feature_key,
    'request_id', p_correlation_id,
    'minute_requests', v_minute.request_count + 1,
    'day_requests', v_day.request_count + 1,
    'day_units', v_day.units_consumed + p_units
  );
end;
$$;

create function public.consume_external_service_quota(
  p_service_key text,
  p_units integer,
  p_user_id uuid,
  p_workspace_id uuid,
  p_device_id uuid default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy app_private.external_service_policies;
  v_usage_date date := (
    statement_timestamp() at time zone 'UTC'
  )::date;
  v_scope record;
  v_usage app_private.external_service_usage_daily;
  v_scopes jsonb := '[]'::jsonb;
begin
  if p_service_key is null
    or p_units is null
    or p_units not between 1 and 1000000
    or p_workspace_id is null
    or (p_user_id is null and p_device_id is null)
    or p_correlation_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'talence_external_service_request_invalid';
  end if;

  if p_user_id is not null
    and (
      not app_api.is_admitted_user(p_user_id)
      or not app_private.has_workspace_role_for_user(
        p_user_id,
        p_workspace_id,
        'viewer'::public.membership_role
      )
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_external_service_authorization_denied';
  end if;

  if p_device_id is not null
    and not exists (
      select 1
      from public.devices as device
      where device.id = p_device_id
        and device.workspace_id = p_workspace_id
        and device.status = 'active'::public.device_status
        and device.revoked_at is null
        and device.deleted_at is null
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_external_service_authorization_denied';
  end if;

  select policy.*
  into v_policy
  from app_private.external_service_policies as policy
  where policy.service_key = p_service_key
  for update;

  if not found or not v_policy.enabled then
    raise exception using
      errcode = '55000',
      message = 'talence_external_service_disabled',
      detail = jsonb_build_object('service', p_service_key)::text;
  end if;

  for v_scope in
    select *
    from (
      values
        (
          'global'::text,
          null::uuid,
          null::uuid,
          null::uuid,
          v_policy.global_daily_units
        ),
        (
          'user'::text,
          p_user_id,
          null::uuid,
          null::uuid,
          v_policy.per_user_daily_units
        ),
        (
          'workspace'::text,
          null::uuid,
          p_workspace_id,
          null::uuid,
          v_policy.per_workspace_daily_units
        ),
        (
          'device'::text,
          null::uuid,
          null::uuid,
          p_device_id,
          v_policy.per_device_daily_units
        )
    ) as scopes(
      scope_kind,
      user_id,
      workspace_id,
      device_id,
      daily_limit
    )
    where scopes.daily_limit is not null
      and (
        scopes.scope_kind not in ('user', 'device')
        or scopes.user_id is not null
        or scopes.device_id is not null
      )
  loop
    insert into app_private.external_service_usage_daily (
      usage_date,
      service_key,
      scope_kind,
      user_id,
      workspace_id,
      device_id
    )
    values (
      v_usage_date,
      p_service_key,
      v_scope.scope_kind,
      v_scope.user_id,
      v_scope.workspace_id,
      v_scope.device_id
    )
    on conflict do nothing;

    select usage.*
    into v_usage
    from app_private.external_service_usage_daily as usage
    where usage.usage_date = v_usage_date
      and usage.service_key = p_service_key
      and usage.scope_kind = v_scope.scope_kind
      and usage.user_id is not distinct from v_scope.user_id
      and usage.workspace_id is not distinct from v_scope.workspace_id
      and usage.device_id is not distinct from v_scope.device_id
    for update;

    if v_usage.units_consumed + p_units > v_scope.daily_limit then
      raise exception using
        errcode = 'P0001',
        message = 'talence_external_service_quota_exceeded',
        detail = jsonb_build_object(
          'service', p_service_key,
          'scope', v_scope.scope_kind,
          'retry_after_seconds', 86400
        )::text;
    end if;

    update app_private.external_service_usage_daily
    set
      units_consumed = units_consumed + p_units,
      request_count = request_count + 1,
      updated_at = statement_timestamp()
    where id = v_usage.id;

    v_scopes := v_scopes || jsonb_build_array(
      jsonb_build_object(
        'scope', v_scope.scope_kind,
        'units_consumed', v_usage.units_consumed + p_units,
        'daily_limit', v_scope.daily_limit
      )
    );
  end loop;

  return jsonb_build_object(
    'service_key', p_service_key,
    'request_id', p_correlation_id,
    'units_reserved', p_units,
    'usage_date', v_usage_date,
    'scopes', v_scopes
  );
end;
$$;

create function public.record_server_audit_event(
  p_actor_user_id uuid,
  p_event_type text,
  p_result_code text,
  p_workspace_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = pg_catalog
as $$
  select app_private.record_audit_event(
    p_actor_user_id,
    p_event_type,
    p_result_code,
    p_workspace_id,
    p_resource_type,
    p_resource_id,
    p_correlation_id,
    p_metadata
  );
$$;

create function public.admin_operational_controls()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_application jsonb;
  v_external jsonb;
  v_device jsonb;
  v_usage jsonb;
  v_events jsonb;
begin
  if not app_api.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(policy) - 'updated_by_user_id'
      order by policy.feature_key
    ),
    '[]'::jsonb
  )
  into v_application
  from app_private.application_feature_policies as policy;

  select coalesce(
    jsonb_agg(
      to_jsonb(policy) - 'updated_by_user_id'
      order by policy.service_key
    ),
    '[]'::jsonb
  )
  into v_external
  from app_private.external_service_policies as policy;

  select coalesce(
    jsonb_agg(
      to_jsonb(policy) - 'updated_by_user_id'
      order by policy.feature_key
    ),
    '[]'::jsonb
  )
  into v_device
  from app_private.device_feature_policies as policy;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'service_key', usage.service_key,
        'scope_kind', usage.scope_kind,
        'units_consumed', usage.units_consumed,
        'request_count', usage.request_count
      )
      order by usage.service_key, usage.scope_kind
    ),
    '[]'::jsonb
  )
  into v_usage
  from app_private.external_service_usage_daily as usage
  where usage.usage_date = (
    statement_timestamp() at time zone 'UTC'
  )::date
    and usage.scope_kind in ('global', 'workspace');

  select coalesce(
    jsonb_agg(event_payload order by event_occurred_at desc, event_id desc),
    '[]'::jsonb
  )
  into v_events
  from (
    select
      event.id as event_id,
      event.occurred_at as event_occurred_at,
      jsonb_build_object(
        'id', event.id,
        'event_type', event.event_type,
        'result_code', event.result_code,
        'workspace_id', event.workspace_id,
        'resource_type', event.resource_type,
        'resource_id', event.resource_id,
        'correlation_id', event.correlation_id,
        'metadata', event.metadata,
        'occurred_at', event.occurred_at
      ) as event_payload
    from public.audit_events as event
    order by event.occurred_at desc, event.id desc
    limit 50
  ) as recent;

  return jsonb_build_object(
    'application_features', v_application,
    'external_services', v_external,
    'device_features', v_device,
    'external_usage_today', v_usage,
    'recent_audit_events', v_events
  );
end;
$$;

create function public.admin_application_feature_policy_update(
  p_feature_key text,
  p_enabled boolean,
  p_per_minute_requests integer,
  p_per_day_requests integer,
  p_per_day_units integer,
  p_max_units_per_request integer,
  p_expected_updated_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_policy app_private.application_feature_policies;
  v_updated_at timestamptz;
begin
  if not app_private.is_admitted_platform_admin(v_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  select policy.*
  into v_policy
  from app_private.application_feature_policies as policy
  where policy.feature_key = p_feature_key
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_application_feature_policy_not_found';
  end if;

  if p_expected_updated_at is null
    or v_policy.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_application_feature_policy_stale';
  end if;

  if p_enabled is null
    or p_per_minute_requests is null
    or p_per_minute_requests not between 1 and 10000
    or p_per_day_requests is null
    or p_per_day_requests not between 1 and 10000000
    or p_per_day_units is null
    or p_per_day_units not between 1 and 100000000
    or p_max_units_per_request is null
    or p_max_units_per_request not between 1 and 1000000
    or p_correlation_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'talence_application_feature_policy_invalid';
  end if;

  update app_private.application_feature_policies
  set
    enabled = p_enabled,
    per_minute_requests = p_per_minute_requests,
    per_day_requests = p_per_day_requests,
    per_day_units = p_per_day_units,
    max_units_per_request = p_max_units_per_request,
    updated_by_user_id = v_actor_user_id
  where feature_key = p_feature_key
  returning updated_at into v_updated_at;

  perform app_private.record_audit_event(
    v_actor_user_id,
    'operational.application_feature.updated',
    'succeeded',
    null,
    null,
    null,
    p_correlation_id,
    jsonb_build_object(
      'feature_key', p_feature_key,
      'enabled', p_enabled
    )
  );

  return jsonb_build_object(
    'feature_key', p_feature_key,
    'enabled', p_enabled,
    'per_minute_requests', p_per_minute_requests,
    'per_day_requests', p_per_day_requests,
    'per_day_units', p_per_day_units,
    'max_units_per_request', p_max_units_per_request,
    'updated_at', v_updated_at
  );
end;
$$;

create function public.admin_external_service_policy_update(
  p_service_key text,
  p_enabled boolean,
  p_global_daily_units integer,
  p_per_user_daily_units integer,
  p_per_workspace_daily_units integer,
  p_per_device_daily_units integer,
  p_expected_updated_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_policy app_private.external_service_policies;
  v_updated_at timestamptz;
begin
  if not app_private.is_admitted_platform_admin(v_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  select policy.*
  into v_policy
  from app_private.external_service_policies as policy
  where policy.service_key = p_service_key
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_external_service_policy_not_found';
  end if;

  if p_expected_updated_at is null
    or v_policy.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'talence_external_service_policy_stale';
  end if;

  if p_enabled is null
    or p_correlation_id is null
    or (
      p_global_daily_units is null
      and p_per_user_daily_units is null
      and p_per_workspace_daily_units is null
      and p_per_device_daily_units is null
    )
    or (
      p_global_daily_units is not null
      and p_global_daily_units not between 1 and 1000000000
    )
    or (
      p_per_user_daily_units is not null
      and p_per_user_daily_units not between 1 and 1000000000
    )
    or (
      p_per_workspace_daily_units is not null
      and p_per_workspace_daily_units not between 1 and 1000000000
    )
    or (
      p_per_device_daily_units is not null
      and p_per_device_daily_units not between 1 and 1000000000
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_external_service_policy_invalid';
  end if;

  update app_private.external_service_policies
  set
    enabled = p_enabled,
    global_daily_units = p_global_daily_units,
    per_user_daily_units = p_per_user_daily_units,
    per_workspace_daily_units = p_per_workspace_daily_units,
    per_device_daily_units = p_per_device_daily_units,
    updated_by_user_id = v_actor_user_id
  where service_key = p_service_key
  returning updated_at into v_updated_at;

  perform app_private.record_audit_event(
    v_actor_user_id,
    'operational.external_service.updated',
    'succeeded',
    null,
    null,
    null,
    p_correlation_id,
    jsonb_build_object(
      'service_key', p_service_key,
      'enabled', p_enabled
    )
  );

  return jsonb_build_object(
    'service_key', p_service_key,
    'enabled', p_enabled,
    'global_daily_units', p_global_daily_units,
    'per_user_daily_units', p_per_user_daily_units,
    'per_workspace_daily_units', p_per_workspace_daily_units,
    'per_device_daily_units', p_per_device_daily_units,
    'updated_at', v_updated_at
  );
end;
$$;

create function public.admin_operational_control_toggle(
  p_control_kind text,
  p_control_key text,
  p_enabled boolean,
  p_expected_updated_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_current_updated_at timestamptz;
  v_updated_at timestamptz;
begin
  if not app_private.is_admitted_platform_admin(v_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'talence_platform_admin_required';
  end if;

  if p_control_kind not in ('application', 'external', 'device')
    or p_control_key is null
    or p_enabled is null
    or p_expected_updated_at is null
    or p_correlation_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'talence_operational_control_invalid';
  end if;

  if p_control_kind = 'application' then
    select policy.updated_at
    into v_current_updated_at
    from app_private.application_feature_policies as policy
    where policy.feature_key = p_control_key
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'talence_operational_control_not_found';
    end if;

    if v_current_updated_at <> p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'talence_operational_control_stale';
    end if;

    update app_private.application_feature_policies
    set
      enabled = p_enabled,
      updated_by_user_id = v_actor_user_id
    where feature_key = p_control_key
    returning updated_at into v_updated_at;
  elsif p_control_kind = 'external' then
    select policy.updated_at
    into v_current_updated_at
    from app_private.external_service_policies as policy
    where policy.service_key = p_control_key
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'talence_operational_control_not_found';
    end if;

    if v_current_updated_at <> p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'talence_operational_control_stale';
    end if;

    update app_private.external_service_policies
    set
      enabled = p_enabled,
      updated_by_user_id = v_actor_user_id
    where service_key = p_control_key
    returning updated_at into v_updated_at;
  else
    select policy.updated_at
    into v_current_updated_at
    from app_private.device_feature_policies as policy
    where policy.feature_key = p_control_key
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'talence_operational_control_not_found';
    end if;

    if v_current_updated_at <> p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'talence_operational_control_stale';
    end if;

    update app_private.device_feature_policies
    set
      enabled = p_enabled,
      updated_by_user_id = v_actor_user_id
    where feature_key = p_control_key
    returning updated_at into v_updated_at;
  end if;

  perform app_private.record_audit_event(
    v_actor_user_id,
    'operational.control.toggled',
    'succeeded',
    null,
    null,
    null,
    p_correlation_id,
    jsonb_build_object(
      'control_kind', p_control_kind,
      'control_key', p_control_key,
      'enabled', p_enabled
    )
  );

  return jsonb_build_object(
    'control_kind', p_control_kind,
    'control_key', p_control_key,
    'enabled', p_enabled,
    'updated_at', v_updated_at
  );
end;
$$;

alter table public.audit_events enable row level security;

create policy audit_events_select_platform_admin
on public.audit_events
for select
to authenticated
using (app_api.is_platform_admin());

revoke all privileges on table public.audit_events
  from public, anon, authenticated, service_role;
grant select on table public.audit_events to authenticated;

revoke all privileges on table app_private.application_feature_policies
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.application_usage_windows
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.external_service_policies
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.external_service_usage_daily
  from public, anon, authenticated, service_role;

revoke all on function app_private.safe_audit_metadata_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.record_audit_event(
  uuid,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  jsonb
)
  from public, anon, authenticated, service_role;

revoke all on function public.consume_application_feature_quota(
  text,
  uuid,
  integer,
  uuid
)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_application_feature_quota(
  text,
  uuid,
  integer,
  uuid
)
  to authenticated;

revoke all on function public.consume_external_service_quota(
  text,
  integer,
  uuid,
  uuid,
  uuid,
  uuid
)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_external_service_quota(
  text,
  integer,
  uuid,
  uuid,
  uuid,
  uuid
)
  to service_role;

revoke all on function public.record_server_audit_event(
  uuid,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  jsonb
)
  from public, anon, authenticated, service_role;
grant execute on function public.record_server_audit_event(
  uuid,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  jsonb
)
  to service_role;

revoke all on function public.admin_operational_controls()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_operational_controls()
  to authenticated;

revoke all on function public.admin_application_feature_policy_update(
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  timestamptz,
  uuid
)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_application_feature_policy_update(
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  timestamptz,
  uuid
)
  to authenticated;

revoke all on function public.admin_external_service_policy_update(
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  timestamptz,
  uuid
)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_external_service_policy_update(
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  timestamptz,
  uuid
)
  to authenticated;

revoke all on function public.admin_operational_control_toggle(
  text,
  text,
  boolean,
  timestamptz,
  uuid
)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_operational_control_toggle(
  text,
  text,
  boolean,
  timestamptz,
  uuid
)
  to authenticated;

comment on table public.audit_events is
  'Safe, bounded application audit events for administrative and security operations; never raw secrets or request bodies.';
comment on table app_private.application_feature_policies is
  'Database-backed incident switches and principal quotas for selected high-cost application routes.';
comment on table app_private.application_usage_windows is
  'Atomic per-user/workspace request and work-unit counters for selected application routes.';
comment on table app_private.external_service_policies is
  'Server-only kill switches and daily unit budgets for controlled external-service adapters.';
comment on table app_private.external_service_usage_daily is
  'Atomically reserved external-service units aggregated by global, user, workspace, and device scope.';
