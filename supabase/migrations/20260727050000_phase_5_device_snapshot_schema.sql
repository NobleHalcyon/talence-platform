-- Phase 5: workspace devices, digest-only credentials, explicit collection
-- grants, immutable device receipts/run summaries, catalog snapshot metadata,
-- and private device feature/quota state.

create type public.device_status as enum (
  'active',
  'suspended',
  'revoked'
);

create type public.device_type as enum (
  'talence_sorter',
  'scanner',
  'kiosk',
  'third_party'
);

create type public.grant_permission as enum (
  'inventory_read',
  'inventory_write',
  'run_summary_write'
);

create type public.device_run_status as enum (
  'completed',
  'failed',
  'cancelled',
  'partially_posted'
);

create function app_private.catalog_snapshot_counts_valid(p_counts jsonb)
returns boolean
language plpgsql
stable
strict
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(p_counts) is distinct from 'object'
    or pg_column_size(p_counts) > 1024
    or not p_counts ?& array[
      'sets',
      'oracle_cards',
      'printings',
      'faces',
      'prices'
    ]
    or p_counts
      - 'sets'
      - 'oracle_cards'
      - 'printings'
      - 'faces'
      - 'prices' <> '{}'::jsonb
    or jsonb_typeof(p_counts -> 'sets') is distinct from 'number'
    or jsonb_typeof(p_counts -> 'oracle_cards') is distinct from 'number'
    or jsonb_typeof(p_counts -> 'printings') is distinct from 'number'
    or jsonb_typeof(p_counts -> 'faces') is distinct from 'number'
    or jsonb_typeof(p_counts -> 'prices') is distinct from 'number'
    or (p_counts ->> 'sets') !~ '^[0-9]+$'
    or (p_counts ->> 'oracle_cards') !~ '^[0-9]+$'
    or (p_counts ->> 'printings') !~ '^[0-9]+$'
    or (p_counts ->> 'faces') !~ '^[0-9]+$'
    or (p_counts ->> 'prices') !~ '^[0-9]+$'
  then
    return false;
  end if;

  return
    (p_counts ->> 'sets')::numeric <= 2147483647
    and (p_counts ->> 'oracle_cards')::numeric <= 2147483647
    and (p_counts ->> 'printings')::numeric <= 2147483647
    and (p_counts ->> 'faces')::numeric <= 2147483647
    and (p_counts ->> 'prices')::numeric <= 2147483647;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create function app_private.device_safe_metadata_valid(
  p_value jsonb,
  p_max_properties integer,
  p_max_bytes integer
)
returns boolean
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  if p_value is null
    or jsonb_typeof(p_value) is distinct from 'object'
    or p_max_properties is null
    or p_max_properties < 0
    or p_max_bytes is null
    or p_max_bytes < 0
    or pg_column_size(p_value) > p_max_bytes
  then
    return false;
  end if;

  return (
      select count(*)
      from jsonb_object_keys(p_value) as key_name(value)
    ) <= p_max_properties
    and not exists (
      select 1
      from jsonb_each(p_value) as item(key, value)
      where jsonb_typeof(item.value) not in (
        'string',
        'number',
        'boolean',
        'null'
      )
        or char_length(item.key) not between 1 and 80
        or lower(
          regexp_replace(
            regexp_replace(
              item.key,
              '([[:lower:][:digit:]])([[:upper:]])',
              '\1_\2',
              'g'
            ),
            '[^[:alnum:]]+',
            '_',
            'g'
          )
        ) ~ (
          '(^|_)(motion|movement|move|move_event|move_events|'
          || 'motor_command|motor_commands|motor_state|camera_frame|'
          || 'camera_frames|sensor_reading|sensor_readings|'
          || 'sensor_telemetry|bin_occupancy|coordinate|coordinates|'
          || 'restart_checkpoint|execution_checkpoint|execution_state|'
          || 'physical_checkpoint|checkpoint|motion_plan|movement_plan)'
          || '(_|$)'
        )
        or jsonb_typeof(item.value) = 'string'
          and char_length(item.value #>> '{}') > 512
    );
end;
$$;

create table public.catalog_snapshots (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  catalog_import_id uuid not null
    references public.catalog_import_runs (id) on delete restrict,
  game_id uuid not null references public.games (id) on delete restrict,
  schema_version integer not null,
  status public.job_status not null default 'succeeded',
  storage_bucket text not null default 'catalog-snapshots',
  storage_path text not null,
  sha256 text not null,
  byte_size bigint not null,
  record_counts jsonb not null,
  minimum_client_version text not null,
  api_contract_version text not null default 'v1',
  provider_observed_at timestamptz not null,
  source_sha256 text not null,
  generated_at timestamptz not null,
  published_at timestamptz not null default statement_timestamp(),
  superseded_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  constraint catalog_snapshots_version_shape check (
    version ~ '^mtg-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}-s[1-9][0-9]*$'
    and char_length(version) <= 160
  ),
  constraint catalog_snapshots_schema_positive check (
    schema_version between 1 and 32767
  ),
  constraint catalog_snapshots_published_only check (
    status = 'succeeded'::public.job_status
  ),
  constraint catalog_snapshots_bucket_fixed check (
    storage_bucket = 'catalog-snapshots'
  ),
  constraint catalog_snapshots_storage_path_exact check (
    storage_path = 'mtg/' || version || '/catalog.sqlite'
  ),
  constraint catalog_snapshots_sha256_shape check (
    sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint catalog_snapshots_source_sha256_shape check (
    source_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint catalog_snapshots_size_bounded check (
    byte_size between 1 and 1073741824
  ),
  constraint catalog_snapshots_record_counts_valid check (
    app_private.catalog_snapshot_counts_valid(record_counts)
  ),
  constraint catalog_snapshots_client_version_shape check (
    minimum_client_version
      ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$'
    and char_length(minimum_client_version) <= 80
  ),
  constraint catalog_snapshots_api_version_shape check (
    api_contract_version ~ '^v[1-9][0-9]*$'
    and char_length(api_contract_version) <= 20
  ),
  constraint catalog_snapshots_temporal_order check (
    generated_at <= published_at
    and created_at <= published_at
    and (
      superseded_at is null
      or superseded_at >= published_at
    )
  ),
  constraint catalog_snapshots_import_version_key
    unique (catalog_import_id, version),
  constraint catalog_snapshots_id_version_key
    unique (id, version)
);

create index catalog_snapshots_compatibility_idx
  on public.catalog_snapshots (
    schema_version,
    published_at desc,
    id desc
  )
  where status = 'succeeded'::public.job_status;
create index catalog_snapshots_import_idx
  on public.catalog_snapshots (catalog_import_id, published_at desc);

alter table public.catalog_state
  add constraint catalog_state_current_robot_snapshot_fk
  foreign key (current_robot_snapshot_id)
  references public.catalog_snapshots (id)
  on delete restrict;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,
  name text not null,
  type public.device_type not null,
  manufacturer text null,
  model text null,
  serial_number text null,
  status public.device_status not null default 'active',
  last_seen_at timestamptz null,
  last_catalog_snapshot_id uuid null
    references public.catalog_snapshots (id) on delete restrict,
  last_client_version text null,
  last_firmware_version text null,
  created_by_user_id uuid not null
    references auth.users (id) on delete restrict,
  suspended_at timestamptz null,
  revoked_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint devices_workspace_scope_key unique (workspace_id, id),
  constraint devices_name_bounded check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint devices_identity_bounded check (
    (
      manufacturer is null
      or char_length(btrim(manufacturer)) between 1 and 120
    )
    and (
      model is null
      or char_length(btrim(model)) between 1 and 120
    )
    and (
      serial_number is null
      or char_length(btrim(serial_number)) between 1 and 160
    )
  ),
  constraint devices_versions_bounded check (
    (
      last_client_version is null
      or char_length(btrim(last_client_version)) between 1 and 80
    )
    and (
      last_firmware_version is null
      or char_length(btrim(last_firmware_version)) between 1 and 80
    )
  ),
  constraint devices_status_timestamps check (
    (
      status = 'active'::public.device_status
      and suspended_at is null
      and revoked_at is null
      and deleted_at is null
    )
    or (
      status = 'suspended'::public.device_status
      and suspended_at is not null
      and revoked_at is null
      and deleted_at is null
    )
    or (
      status = 'revoked'::public.device_status
      and revoked_at is not null
      and (
        deleted_at is null
        or deleted_at >= revoked_at
      )
    )
  ),
  constraint devices_temporal_order check (
    (last_seen_at is null or last_seen_at >= created_at)
    and (suspended_at is null or suspended_at >= created_at)
    and (revoked_at is null or revoked_at >= created_at)
  )
);

create index devices_workspace_status_idx
  on public.devices (
    workspace_id,
    status,
    created_at desc,
    id desc
  )
  where deleted_at is null;
create index devices_last_seen_idx
  on public.devices (workspace_id, last_seen_at desc, id)
  where deleted_at is null;
create index devices_snapshot_idx
  on public.devices (last_catalog_snapshot_id)
  where last_catalog_snapshot_id is not null;
create unique index devices_workspace_serial_idx
  on public.devices (
    workspace_id,
    lower(manufacturer),
    lower(serial_number)
  )
  where manufacturer is not null
    and serial_number is not null
    and deleted_at is null;

create table app_private.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null
    references public.devices (id) on delete restrict,
  prefix text not null unique,
  secret_digest text not null,
  created_by_user_id uuid not null
    references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  constraint device_credentials_device_scope_key unique (device_id, id),
  constraint device_credentials_prefix_shape check (
    prefix = lower(prefix)
    and prefix ~ '^[a-z0-9]{12,32}$'
  ),
  constraint device_credentials_digest_shape check (
    secret_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint device_credentials_temporal_order check (
    (expires_at is null or expires_at > created_at)
    and (last_used_at is null or last_used_at >= created_at)
    and (revoked_at is null or revoked_at >= created_at)
  )
);

create index device_credentials_device_active_idx
  on app_private.device_credentials (
    device_id,
    created_at desc,
    id desc
  )
  where revoked_at is null;
create index device_credentials_expiry_idx
  on app_private.device_credentials (expires_at, id)
  where revoked_at is null and expires_at is not null;

create table public.device_collection_grants (
  workspace_id uuid not null,
  device_id uuid not null,
  collection_id uuid not null,
  permission public.grant_permission not null,
  granted_by_user_id uuid not null
    references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (device_id, collection_id, permission),
  constraint device_collection_grants_device_fk
    foreign key (workspace_id, device_id)
    references public.devices (workspace_id, id)
    on delete restrict,
  constraint device_collection_grants_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict
);

create index device_collection_grants_workspace_idx
  on public.device_collection_grants (
    workspace_id,
    collection_id,
    device_id,
    permission
  );
create index device_collection_grants_collection_idx
  on public.device_collection_grants (
    collection_id,
    device_id,
    permission
  );

alter table public.inventory_transactions
  add constraint inventory_transactions_device_fk
  foreign key (workspace_id, device_id)
  references public.devices (workspace_id, id)
  on delete restrict;

create table public.device_sync_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  device_id uuid not null,
  collection_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  catalog_snapshot_id uuid not null
    references public.catalog_snapshots (id) on delete restrict,
  catalog_snapshot_version text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  status text not null default 'committed',
  inventory_transaction_id uuid not null,
  external_run_id text null,
  response_code text not null default 'committed',
  correlation_id uuid not null,
  result_lines jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint device_sync_batches_device_fk
    foreign key (workspace_id, device_id)
    references public.devices (workspace_id, id)
    on delete restrict,
  constraint device_sync_batches_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict,
  constraint device_sync_batches_snapshot_fk
    foreign key (catalog_snapshot_id, catalog_snapshot_version)
    references public.catalog_snapshots (id, version)
    on delete restrict,
  constraint device_sync_batches_transaction_fk
    foreign key (
      inventory_transaction_id,
      workspace_id,
      collection_id
    )
    references public.inventory_transactions (
      id,
      workspace_id,
      collection_id
    )
    on delete restrict,
  constraint device_sync_batches_device_key
    unique (device_id, idempotency_key),
  constraint device_sync_batches_transaction_key
    unique (inventory_transaction_id),
  constraint device_sync_batches_idempotency_bounded check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint device_sync_batches_request_hash_shape check (
    request_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint device_sync_batches_snapshot_version_match check (
    char_length(catalog_snapshot_version) between 1 and 160
  ),
  constraint device_sync_batches_committed_only check (
    status = 'committed'
    and response_code = 'committed'
  ),
  constraint device_sync_batches_external_run_bounded check (
    external_run_id is null
    or char_length(btrim(external_run_id)) between 1 and 128
  ),
  constraint device_sync_batches_result_lines_valid check (
    jsonb_typeof(result_lines) = 'array'
    and jsonb_array_length(result_lines) between 1 and 500
    and pg_column_size(result_lines) <= 2097152
  ),
  constraint device_sync_batches_temporal_order check (
    occurred_at <= received_at + interval '5 minutes'
    and created_at = received_at
  )
);

create index device_sync_batches_device_history_idx
  on public.device_sync_batches (
    device_id,
    received_at desc,
    id desc
  );
create index device_sync_batches_collection_history_idx
  on public.device_sync_batches (
    collection_id,
    received_at desc,
    id desc
  );
create index device_sync_batches_snapshot_idx
  on public.device_sync_batches (catalog_snapshot_id, received_at desc);

create table public.device_run_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  device_id uuid not null,
  collection_id uuid not null,
  idempotency_key text not null,
  external_run_id text not null,
  status public.device_run_status not null,
  catalog_snapshot_id uuid not null
    references public.catalog_snapshots (id) on delete restrict,
  catalog_snapshot_version text not null,
  total_count integer not null,
  recognized_count integer not null,
  unrecognized_count integer not null,
  posted_count integer not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  diagnostic_code text null,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint device_run_summaries_device_fk
    foreign key (workspace_id, device_id)
    references public.devices (workspace_id, id)
    on delete restrict,
  constraint device_run_summaries_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict,
  constraint device_run_summaries_snapshot_fk
    foreign key (catalog_snapshot_id, catalog_snapshot_version)
    references public.catalog_snapshots (id, version)
    on delete restrict,
  constraint device_run_summaries_external_key
    unique (device_id, external_run_id),
  constraint device_run_summaries_idempotency_key
    unique (device_id, idempotency_key),
  constraint device_run_summaries_external_id_bounded check (
    char_length(btrim(external_run_id)) between 1 and 128
  ),
  constraint device_run_summaries_idempotency_bounded check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint device_run_summaries_snapshot_version_bounded check (
    char_length(catalog_snapshot_version) between 1 and 160
  ),
  constraint device_run_summaries_counts_valid check (
    total_count >= 0
    and recognized_count >= 0
    and unrecognized_count >= 0
    and posted_count >= 0
    and recognized_count + unrecognized_count = total_count
    and posted_count <= recognized_count
  ),
  constraint device_run_summaries_temporal_order check (
    completed_at >= started_at
    and completed_at <= received_at + interval '5 minutes'
    and created_at = received_at
  ),
  constraint device_run_summaries_diagnostic_bounded check (
    diagnostic_code is null
    or char_length(btrim(diagnostic_code)) between 1 and 128
  ),
  constraint device_run_summaries_metadata_safe check (
    app_private.device_safe_metadata_valid(metadata, 20, 16384)
  )
);

create index device_run_summaries_device_history_idx
  on public.device_run_summaries (
    device_id,
    completed_at desc,
    id desc
  );
create index device_run_summaries_collection_history_idx
  on public.device_run_summaries (
    collection_id,
    completed_at desc,
    id desc
  );
create index device_run_summaries_snapshot_idx
  on public.device_run_summaries (catalog_snapshot_id, completed_at desc);

create table app_private.device_mutation_requests (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  device_id uuid not null
    references public.devices (id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  resource_id uuid not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint device_mutation_requests_scope_key
    unique (operation_type, device_id, idempotency_key),
  constraint device_mutation_requests_resource_key
    unique (operation_type, device_id, resource_id),
  constraint device_mutation_requests_type_valid check (
    operation_type = 'run_summary'
  ),
  constraint device_mutation_requests_idempotency_bounded check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint device_mutation_requests_hash_shape check (
    request_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint device_mutation_requests_response_valid check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 262144
  )
);

create index device_mutation_requests_created_idx
  on app_private.device_mutation_requests (created_at, id);

create table app_private.device_feature_policies (
  feature_key text primary key,
  enabled boolean not null default true,
  per_minute_requests integer not null,
  per_day_requests integer not null,
  per_day_units integer not null,
  max_request_bytes integer not null,
  max_items integer not null,
  updated_by_user_id uuid null
    references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint device_feature_policies_key_valid check (
    feature_key in (
      'device_heartbeat',
      'device_inventory_reads',
      'device_inventory_writes',
      'device_run_summaries',
      'snapshot_downloads'
    )
  ),
  constraint device_feature_policies_limits_positive check (
    per_minute_requests between 1 and 10000
    and per_day_requests between 1 and 10000000
    and per_day_units between 1 and 100000000
    and max_request_bytes between 0 and 16777216
    and max_items between 0 and 10000
  )
);

create trigger device_feature_policies_set_updated_at
before update on app_private.device_feature_policies
for each row execute function app_private.set_updated_at();

insert into app_private.device_feature_policies (
  feature_key,
  enabled,
  per_minute_requests,
  per_day_requests,
  per_day_units,
  max_request_bytes,
  max_items
)
values
  ('device_heartbeat', true, 12, 10000, 10000, 16384, 20),
  ('device_inventory_reads', true, 60, 2000, 400000, 8192, 200),
  ('device_inventory_writes', true, 30, 500, 250000, 1048576, 500),
  ('device_run_summaries', true, 30, 1000, 1000, 65536, 20),
  ('snapshot_downloads', true, 6, 50, 50, 8192, 16);

create table app_private.device_usage_windows (
  feature_key text not null
    references app_private.device_feature_policies (feature_key)
    on delete restrict,
  device_id uuid not null
    references public.devices (id) on delete restrict,
  window_seconds integer not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  units_consumed bigint not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (
    feature_key,
    device_id,
    window_seconds,
    window_started_at
  ),
  constraint device_usage_windows_window_valid check (
    window_seconds in (60, 86400)
  ),
  constraint device_usage_windows_counts_nonnegative check (
    request_count >= 0 and units_consumed >= 0
  )
);

create index device_usage_windows_retention_idx
  on app_private.device_usage_windows (
    window_started_at,
    feature_key,
    device_id
  );

create function app_private.reject_phase_5_immutable_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_device_history_immutable';
end;
$$;

create trigger catalog_snapshots_immutable
before update or delete on public.catalog_snapshots
for each row execute function app_private.reject_phase_5_immutable_change();

create trigger device_sync_batches_immutable
before update or delete on public.device_sync_batches
for each row execute function app_private.reject_phase_5_immutable_change();

create trigger device_run_summaries_immutable
before update or delete on public.device_run_summaries
for each row execute function app_private.reject_phase_5_immutable_change();

create trigger device_mutation_requests_immutable
before update or delete on app_private.device_mutation_requests
for each row execute function app_private.reject_phase_5_immutable_change();

create function app_private.guard_device_table_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception using
      errcode = '42501',
      message = 'talence_device_direct_write_denied';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger devices_trusted_write_only
before insert or update or delete on public.devices
for each row execute function app_private.guard_device_table_write();

create trigger device_collection_grants_trusted_write_only
before insert or update or delete on public.device_collection_grants
for each row execute function app_private.guard_device_table_write();

create trigger device_credentials_trusted_write_only
before insert or update or delete on app_private.device_credentials
for each row execute function app_private.guard_device_table_write();

alter table public.catalog_snapshots enable row level security;
alter table public.devices enable row level security;
alter table public.device_collection_grants enable row level security;
alter table public.device_sync_batches enable row level security;
alter table public.device_run_summaries enable row level security;

revoke all privileges on table public.catalog_snapshots
  from public, anon, authenticated, service_role;
revoke all privileges on table public.devices
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_collection_grants
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_sync_batches
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_run_summaries
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.device_credentials
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.device_mutation_requests
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.device_feature_policies
  from public, anon, authenticated, service_role;
revoke all privileges on table app_private.device_usage_windows
  from public, anon, authenticated, service_role;

revoke all on function app_private.catalog_snapshot_counts_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.device_safe_metadata_valid(
  jsonb,
  integer,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function app_private.reject_phase_5_immutable_change()
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_device_table_write()
  from public, anon, authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'catalog-snapshots',
  'catalog-snapshots',
  false,
  1073741824,
  array[
    'application/vnd.sqlite3',
    'application/x-sqlite3',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.devices is
  'Workspace-scoped registered machines. Human sessions never authenticate as a device.';
comment on table app_private.device_credentials is
  'Private device credential prefixes and full-secret digests. Raw credentials are never stored.';
comment on table public.device_collection_grants is
  'Explicit per-collection device capabilities; no workspace-wide implicit machine access.';
comment on table public.device_sync_batches is
  'Immutable projection of accepted idempotent device inventory mutations onto the Phase 3 ledger.';
comment on table public.device_run_summaries is
  'Immutable thin device outcomes. Robot motion, sensor, camera, bin, and restart state are prohibited.';
comment on table public.catalog_snapshots is
  'Immutable metadata for uploaded and published SQLite catalog artifacts.';
comment on table app_private.device_feature_policies is
  'Server-only feature kill switches and configurable request/unit limits for device routes.';
