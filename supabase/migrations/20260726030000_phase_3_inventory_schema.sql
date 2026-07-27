-- Phase 3: collection inventory, immutable audit ledger, CSV import staging,
-- private idempotency state, and private import-storage prerequisites.

create type public.card_condition as enum (
  'unknown',
  'near_mint',
  'lightly_played',
  'moderately_played',
  'heavily_played',
  'damaged'
);

create type public.inventory_source as enum (
  'manual',
  'csv_import',
  'device',
  'transfer',
  'reversal',
  'admin_correction'
);

create type public.inventory_transfer_direction as enum (
  'out',
  'in'
);

create type public.inventory_import_row_status as enum (
  'matched',
  'ambiguous',
  'rejected',
  'excluded'
);

alter table public.collections
  add column cover_printing_id uuid null
    references public.catalog_printings (id) on delete set null;

alter table public.collections
  drop constraint collections_workspace_id_fkey;

alter table public.collections
  add constraint collections_workspace_id_fkey
  foreign key (workspace_id)
  references public.workspaces (id)
  on delete restrict;

alter table public.collections
  add constraint collections_workspace_id_id_key unique (workspace_id, id);

comment on column public.collections.cover_printing_id is
  'Optional exact active catalog printing used as the collection cover.';

create table app_private.inventory_value_tiers (
  tier_code text primary key,
  sort_order smallint not null unique,
  label text not null,
  minimum_unit_value numeric(14, 4) null,
  maximum_unit_value numeric(14, 4) null,
  is_unpriced boolean not null default false,
  constraint inventory_value_tiers_code_shape check (
    tier_code = lower(tier_code)
    and tier_code ~ '^[a-z0-9][a-z0-9_]{1,31}$'
  ),
  constraint inventory_value_tiers_label_bounded check (
    char_length(btrim(label)) between 1 and 80
  ),
  constraint inventory_value_tiers_bounds_valid check (
    (
      is_unpriced
      and minimum_unit_value is null
      and maximum_unit_value is null
    )
    or (
      not is_unpriced
      and minimum_unit_value is not null
      and minimum_unit_value >= 0
      and (
        maximum_unit_value is null
        or maximum_unit_value > minimum_unit_value
      )
    )
  )
);

comment on table app_private.inventory_value_tiers is
  'Central Phase 3 analytical value-tier policy. Numeric bounds apply in the requested display currency; upper bounds are exclusive.';

insert into app_private.inventory_value_tiers (
  tier_code,
  sort_order,
  label,
  minimum_unit_value,
  maximum_unit_value,
  is_unpriced
)
values
  ('under_1', 10, 'Under 1', 0, 1, false),
  ('1_to_5', 20, '1 to under 5', 1, 5, false),
  ('5_to_25', 30, '5 to under 25', 5, 25, false),
  ('25_to_100', 40, '25 to under 100', 25, 100, false),
  ('100_and_up', 50, '100 and up', 100, null, false),
  ('unpriced', 60, 'Unpriced', null, null, true);

create table public.inventory_import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  collection_id uuid not null,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  status public.job_status not null default 'queued',
  original_filename text not null,
  storage_bucket text not null default 'inventory-imports',
  storage_path text not null,
  file_size bigint not null,
  file_sha256 text not null,
  parser_version text not null,
  total_rows integer not null default 0,
  matched_rows integer not null default 0,
  ambiguous_rows integer not null default 0,
  rejected_rows integer not null default 0,
  excluded_rows integer not null default 0,
  staging_completed_at timestamptz null,
  committed_transaction_id uuid null,
  failure_code text null,
  failure_detail jsonb not null default '{}'::jsonb,
  cancelled_at timestamptz null,
  completed_at timestamptz null,
  purge_after timestamptz not null
    default (statement_timestamp() + interval '30 days'),
  purged_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_import_jobs_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict,
  constraint inventory_import_jobs_workspace_scope_key
    unique (id, workspace_id, collection_id),
  constraint inventory_import_jobs_filename_bounded check (
    char_length(btrim(original_filename)) between 1 and 255
  ),
  constraint inventory_import_jobs_bucket_fixed check (
    storage_bucket = 'inventory-imports'
  ),
  constraint inventory_import_jobs_storage_path_exact check (
    storage_path = workspace_id::text || '/' || id::text || '/source.csv'
  ),
  constraint inventory_import_jobs_file_size_bounded check (
    file_size between 1 and 2097152
  ),
  constraint inventory_import_jobs_sha256_shape check (
    file_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint inventory_import_jobs_parser_version_bounded check (
    char_length(btrim(parser_version)) between 1 and 80
  ),
  constraint inventory_import_jobs_counts_bounded check (
    total_rows between 0 and 5000
    and matched_rows between 0 and total_rows
    and ambiguous_rows between 0 and total_rows
    and rejected_rows between 0 and total_rows
    and excluded_rows between 0 and total_rows
    and matched_rows + ambiguous_rows + rejected_rows + excluded_rows
      = total_rows
  ),
  constraint inventory_import_jobs_failure_code_bounded check (
    failure_code is null
    or char_length(btrim(failure_code)) between 1 and 128
  ),
  constraint inventory_import_jobs_failure_detail_object check (
    jsonb_typeof(failure_detail) = 'object'
    and pg_column_size(failure_detail) <= 16384
  ),
  constraint inventory_import_jobs_failure_state_valid check (
    (
      status = 'failed'::public.job_status
      and failure_code is not null
    )
    or (
      status <> 'failed'::public.job_status
      and failure_code is null
      and failure_detail = '{}'::jsonb
    )
  ),
  constraint inventory_import_jobs_retention_valid check (
    purge_after >= created_at
    and (purged_at is null or purged_at >= created_at)
  ),
  constraint inventory_import_jobs_terminal_state_valid check (
    (
      status in ('queued'::public.job_status, 'running'::public.job_status)
      and completed_at is null
      and cancelled_at is null
      and committed_transaction_id is null
    )
    or (
      status = 'succeeded'::public.job_status
      and completed_at is not null
      and cancelled_at is null
      and committed_transaction_id is not null
      and staging_completed_at is not null
      and failure_code is null
    )
    or (
      status = 'failed'::public.job_status
      and completed_at is not null
      and cancelled_at is null
      and failure_code is not null
      and committed_transaction_id is null
    )
    or (
      status = 'cancelled'::public.job_status
      and completed_at is not null
      and cancelled_at is not null
      and committed_transaction_id is null
    )
  )
);

create index inventory_import_jobs_workspace_status_idx
  on public.inventory_import_jobs (
    workspace_id,
    status,
    created_at desc,
    id
  );
create index inventory_import_jobs_collection_idx
  on public.inventory_import_jobs (
    collection_id,
    created_at desc,
    id
  );
create index inventory_import_jobs_retention_idx
  on public.inventory_import_jobs (purge_after, id)
  where purged_at is null;

create trigger inventory_import_jobs_set_updated_at
before update on public.inventory_import_jobs
for each row execute function app_private.set_updated_at();

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  collection_id uuid not null,
  source public.inventory_source not null,
  actor_user_id uuid null references auth.users (id) on delete restrict,
  device_id uuid null,
  import_job_id uuid null,
  idempotency_key text not null,
  external_reference text null,
  reverses_transaction_id uuid null,
  transfer_group_id uuid null,
  transfer_direction public.inventory_transfer_direction null,
  occurred_at timestamptz not null,
  committed_at timestamptz not null default statement_timestamp(),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint inventory_transactions_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict,
  constraint inventory_transactions_import_job_fk
    foreign key (import_job_id, workspace_id, collection_id)
    references public.inventory_import_jobs (id, workspace_id, collection_id)
    on delete restrict,
  constraint inventory_transactions_reverses_fk
    foreign key (reverses_transaction_id, workspace_id, collection_id)
    references public.inventory_transactions (id, workspace_id, collection_id)
    on delete restrict,
  constraint inventory_transactions_scope_key
    unique (id, workspace_id, collection_id),
  constraint inventory_transactions_idempotency_key_bounded check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint inventory_transactions_external_reference_bounded check (
    external_reference is null
    or char_length(btrim(external_reference)) between 1 and 200
  ),
  constraint inventory_transactions_note_bounded check (
    note is null or char_length(note) <= 4000
  ),
  constraint inventory_transactions_metadata_object check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 16384
  ),
  constraint inventory_transactions_principal_valid check (
    (
      source = 'device'::public.inventory_source
      and actor_user_id is null
      and device_id is not null
    )
    or (
      source <> 'device'::public.inventory_source
      and actor_user_id is not null
      and device_id is null
    )
  ),
  constraint inventory_transactions_import_valid check (
    (
      source = 'csv_import'::public.inventory_source
      and import_job_id is not null
    )
    or (
      source <> 'csv_import'::public.inventory_source
      and import_job_id is null
    )
  ),
  constraint inventory_transactions_reversal_valid check (
    (
      source = 'reversal'::public.inventory_source
      and reverses_transaction_id is not null
    )
    or (
      source <> 'reversal'::public.inventory_source
      and reverses_transaction_id is null
    )
  ),
  constraint inventory_transactions_transfer_valid check (
    (
      source = 'transfer'::public.inventory_source
      and transfer_group_id is not null
      and transfer_direction is not null
    )
    or (
      source = 'reversal'::public.inventory_source
      and (
        (
          transfer_group_id is null
          and transfer_direction is null
        )
        or (
          transfer_group_id is not null
          and transfer_direction is not null
        )
      )
    )
    or (
      source not in (
        'transfer'::public.inventory_source,
        'reversal'::public.inventory_source
      )
      and transfer_group_id is null
      and transfer_direction is null
    )
  )
);

create unique index inventory_transactions_reverses_once_idx
  on public.inventory_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;
create unique index inventory_transactions_transfer_leg_idx
  on public.inventory_transactions (transfer_group_id, transfer_direction)
  where transfer_group_id is not null;
create index inventory_transactions_collection_history_idx
  on public.inventory_transactions (
    collection_id,
    occurred_at desc,
    committed_at desc,
    id desc
  );
create index inventory_transactions_workspace_history_idx
  on public.inventory_transactions (
    workspace_id,
    committed_at desc,
    id desc
  );
create index inventory_transactions_actor_idx
  on public.inventory_transactions (actor_user_id, committed_at desc)
  where actor_user_id is not null;
create index inventory_transactions_import_job_idx
  on public.inventory_transactions (import_job_id)
  where import_job_id is not null;
create unique index inventory_transactions_import_job_once_idx
  on public.inventory_transactions (import_job_id)
  where import_job_id is not null;

alter table public.inventory_import_jobs
  add constraint inventory_import_jobs_committed_transaction_fk
  foreign key (committed_transaction_id, workspace_id, collection_id)
  references public.inventory_transactions (id, workspace_id, collection_id)
  on delete restrict;

create table public.inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  workspace_id uuid not null,
  collection_id uuid not null,
  line_number integer not null,
  client_line_ids text[] not null,
  printing_id uuid not null references public.catalog_printings (id) on delete restrict,
  finish public.card_finish not null,
  condition public.card_condition not null,
  quantity_delta integer not null,
  quantity_before integer not null,
  quantity_after integer not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint inventory_transaction_lines_transaction_fk
    foreign key (transaction_id, workspace_id, collection_id)
    references public.inventory_transactions (id, workspace_id, collection_id)
    on delete restrict,
  constraint inventory_transaction_lines_number_key
    unique (transaction_id, line_number),
  constraint inventory_transaction_lines_balance_key
    unique (transaction_id, printing_id, finish, condition),
  constraint inventory_transaction_lines_number_bounded check (
    line_number between 1 and 5000
  ),
  constraint inventory_transaction_lines_client_ids_valid check (
    cardinality(client_line_ids) between 1 and 5000
    and array_position(client_line_ids, null) is null
  ),
  constraint inventory_transaction_lines_delta_bounded check (
    quantity_delta between -50000000 and 50000000
    and quantity_delta <> 0
  ),
  constraint inventory_transaction_lines_quantities_valid check (
    quantity_before >= 0
    and quantity_after >= 0
    and quantity_after = quantity_before + quantity_delta
  )
);

create index inventory_transaction_lines_collection_idx
  on public.inventory_transaction_lines (
    collection_id,
    created_at desc,
    transaction_id,
    line_number
  );
create index inventory_transaction_lines_printing_idx
  on public.inventory_transaction_lines (
    printing_id,
    created_at desc,
    transaction_id
  );

create table public.inventory_balances (
  workspace_id uuid not null,
  collection_id uuid not null,
  printing_id uuid not null references public.catalog_printings (id) on delete restrict,
  finish public.card_finish not null,
  condition public.card_condition not null,
  quantity integer not null,
  last_transaction_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (collection_id, printing_id, finish, condition),
  constraint inventory_balances_collection_fk
    foreign key (workspace_id, collection_id)
    references public.collections (workspace_id, id)
    on delete restrict,
  constraint inventory_balances_last_transaction_fk
    foreign key (last_transaction_id, workspace_id, collection_id)
    references public.inventory_transactions (id, workspace_id, collection_id)
    on delete restrict,
  constraint inventory_balances_quantity_nonnegative check (quantity >= 0)
);

create index inventory_balances_workspace_idx
  on public.inventory_balances (
    workspace_id,
    collection_id,
    updated_at desc
  );
create index inventory_balances_printing_idx
  on public.inventory_balances (
    printing_id,
    finish,
    condition,
    collection_id
  )
  where quantity > 0;
create index inventory_balances_positive_collection_idx
  on public.inventory_balances (
    collection_id,
    updated_at desc,
    printing_id,
    finish,
    condition
  )
  where quantity > 0;

create table public.inventory_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null,
  workspace_id uuid not null,
  collection_id uuid not null,
  row_number integer not null,
  raw_data jsonb not null,
  raw_scryfall_id text null,
  raw_set_code text null,
  raw_collector_number text null,
  raw_language text null,
  raw_name text null,
  raw_finish text null,
  raw_condition text null,
  raw_quantity text null,
  finish public.card_finish null,
  condition public.card_condition null,
  quantity integer null,
  status public.inventory_import_row_status not null,
  resolution_source text null,
  resolved_printing_id uuid null
    references public.catalog_printings (id) on delete restrict,
  suggested_printing_ids uuid[] not null default '{}'::uuid[],
  error_code text null,
  error_detail jsonb not null default '{}'::jsonb,
  row_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_import_rows_job_fk
    foreign key (import_job_id, workspace_id, collection_id)
    references public.inventory_import_jobs (id, workspace_id, collection_id)
    on delete cascade,
  constraint inventory_import_rows_job_row_key
    unique (import_job_id, row_number),
  constraint inventory_import_rows_row_number_bounded check (
    row_number between 2 and 5001
  ),
  constraint inventory_import_rows_raw_data_object check (
    jsonb_typeof(raw_data) = 'object'
    and pg_column_size(raw_data) <= 131072
  ),
  constraint inventory_import_rows_raw_fields_bounded check (
    (raw_scryfall_id is null or char_length(raw_scryfall_id) <= 4096)
    and (raw_set_code is null or char_length(raw_set_code) <= 4096)
    and (raw_collector_number is null or char_length(raw_collector_number) <= 4096)
    and (raw_language is null or char_length(raw_language) <= 4096)
    and (raw_name is null or char_length(raw_name) <= 4096)
    and (raw_finish is null or char_length(raw_finish) <= 4096)
    and (raw_condition is null or char_length(raw_condition) <= 4096)
    and (raw_quantity is null or char_length(raw_quantity) <= 4096)
  ),
  constraint inventory_import_rows_quantity_bounded check (
    quantity is null or quantity between 1 and 10000
  ),
  constraint inventory_import_rows_known_physical_state check (
    finish is null or finish <> 'unknown'::public.card_finish
  ),
  constraint inventory_import_rows_known_condition check (
    condition is null or condition <> 'unknown'::public.card_condition
  ),
  constraint inventory_import_rows_resolution_source_bounded check (
    resolution_source is null
    or resolution_source in (
      'scryfall_id',
      'set_collector_language',
      'manual'
    )
  ),
  constraint inventory_import_rows_suggestions_bounded check (
    cardinality(suggested_printing_ids) <= 5
    and array_position(suggested_printing_ids, null) is null
  ),
  constraint inventory_import_rows_error_code_bounded check (
    error_code is null
    or char_length(btrim(error_code)) between 1 and 128
  ),
  constraint inventory_import_rows_error_detail_object check (
    jsonb_typeof(error_detail) = 'object'
    and pg_column_size(error_detail) <= 16384
  ),
  constraint inventory_import_rows_hash_shape check (
    row_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint inventory_import_rows_status_valid check (
    (
      status = 'matched'::public.inventory_import_row_status
      and resolved_printing_id is not null
      and finish is not null
      and condition is not null
      and quantity is not null
      and error_code is null
    )
    or (
      status = 'ambiguous'::public.inventory_import_row_status
      and resolved_printing_id is null
      and cardinality(suggested_printing_ids) > 0
      and finish is not null
      and condition is not null
      and quantity is not null
      and error_code is not null
    )
    or (
      status = 'rejected'::public.inventory_import_row_status
      and resolved_printing_id is null
      and error_code is not null
    )
    or (
      status = 'excluded'::public.inventory_import_row_status
      and resolved_printing_id is null
    )
  )
);

create index inventory_import_rows_job_status_idx
  on public.inventory_import_rows (
    import_job_id,
    status,
    row_number
  );
create index inventory_import_rows_printing_idx
  on public.inventory_import_rows (resolved_printing_id)
  where resolved_printing_id is not null;

create trigger inventory_import_rows_set_updated_at
before update on public.inventory_import_rows
for each row execute function app_private.set_updated_at();

create table app_private.inventory_operation_requests (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  principal_kind text not null,
  principal_id uuid not null,
  actor_user_id uuid null references auth.users (id) on delete restrict,
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  scope_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  transaction_ids uuid[] not null default '{}'::uuid[],
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint inventory_operation_requests_scope_key
    unique (
      operation_type,
      principal_kind,
      principal_id,
      scope_id,
      idempotency_key
    ),
  constraint inventory_operation_requests_type_bounded check (
    operation_type in (
      'apply',
      'transfer',
      'reversal',
      'import_create',
      'import_commit'
    )
  ),
  constraint inventory_operation_requests_principal_valid check (
    (
      principal_kind = 'human'
      and actor_user_id is not null
      and actor_user_id = principal_id
    )
    or (
      principal_kind in ('device', 'system')
      and actor_user_id is null
    )
  ),
  constraint inventory_operation_requests_key_bounded check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint inventory_operation_requests_hash_shape check (
    request_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint inventory_operation_requests_transaction_ids_valid check (
    cardinality(transaction_ids) <= 2
    and array_position(transaction_ids, null) is null
  ),
  constraint inventory_operation_requests_response_object check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 8388608
  )
);

create index inventory_operation_requests_created_idx
  on app_private.inventory_operation_requests (created_at, id);

create function app_private.reject_immutable_inventory_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_inventory_history_immutable';
end;
$$;

create trigger inventory_transactions_immutable
before update or delete on public.inventory_transactions
for each row execute function app_private.reject_immutable_inventory_change();

create trigger inventory_transaction_lines_immutable
before update or delete on public.inventory_transaction_lines
for each row execute function app_private.reject_immutable_inventory_change();

create trigger inventory_operation_requests_immutable
before update or delete on app_private.inventory_operation_requests
for each row execute function app_private.reject_immutable_inventory_change();

create function app_private.guard_inventory_balance_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception using
      errcode = '42501',
      message = 'talence_inventory_balance_direct_write_denied';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger inventory_balances_trusted_write_only
before insert or update or delete on public.inventory_balances
for each row execute function app_private.guard_inventory_balance_write();

create function app_private.validate_collection_phase_3_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_cover_game_id uuid;
begin
  if tg_op = 'UPDATE' and new.game_id is distinct from old.game_id then
    raise exception using
      errcode = '55000',
      message = 'talence_collection_game_immutable';
  end if;

  if tg_op = 'INSERT'
    or new.cover_printing_id is distinct from old.cover_printing_id
  then
    if new.cover_printing_id is not null then
      select printing.game_id
      into v_cover_game_id
      from public.catalog_printings as printing
      join public.catalog_sets as catalog_set
        on catalog_set.id = printing.set_id
      left join public.catalog_cards as card
        on card.id = printing.card_id
      where printing.id = new.cover_printing_id
        and printing.active
        and catalog_set.active
        and (card.id is null or card.active);

      if v_cover_game_id is null or v_cover_game_id <> new.game_id then
        raise exception using
          errcode = '23514',
          message = 'talence_collection_cover_printing_invalid';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'deleted'::public.resource_status then
      raise exception using
        errcode = '55000',
        message = 'talence_collection_deleted_terminal';
    end if;

    if new.status in (
      'archived'::public.resource_status,
      'deleted'::public.resource_status
    )
      and exists (
        select 1
        from public.profiles as profile
        where profile.default_collection_id = old.id
      )
    then
      raise exception using
        errcode = '55000',
        message = 'talence_collection_is_profile_default';
    end if;

    if new.status = 'deleted'::public.resource_status
      and exists (
        select 1
        from public.inventory_balances as balance
        where balance.collection_id = old.id
          and balance.quantity > 0
      )
    then
      raise exception using
        errcode = '55000',
        message = 'talence_collection_delete_requires_empty_inventory';
    end if;

    if new.status = 'deleted'::public.resource_status
      and exists (
        select 1
        from public.inventory_import_jobs as import_job
        where import_job.collection_id = old.id
          and import_job.status in (
            'queued'::public.job_status,
            'running'::public.job_status
          )
      )
    then
      raise exception using
        errcode = '55000',
        message =
          'talence_collection_delete_requires_terminal_imports';
    end if;
  end if;

  return new;
end;
$$;

create trigger collections_validate_phase_3_integrity
before insert or update of cover_printing_id, game_id, status
on public.collections
for each row execute function app_private.validate_collection_phase_3_integrity();

create function app_private.reject_collection_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'talence_collection_hard_delete_prohibited';
end;
$$;

create trigger collections_reject_hard_delete
before delete on public.collections
for each row execute function app_private.reject_collection_hard_delete();

create function app_private.validate_inventory_import_job_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_transaction record;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'queued'::public.job_status
      or new.total_rows <> 0
      or new.staging_completed_at is not null
      or new.committed_transaction_id is not null
      or new.completed_at is not null
      or new.cancelled_at is not null
      or new.failure_code is not null
    then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_import_initial_state_invalid';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.collection_id is distinct from old.collection_id
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.original_filename is distinct from old.original_filename
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.file_size is distinct from old.file_size
    or new.file_sha256 is distinct from old.file_sha256
    or new.parser_version is distinct from old.parser_version
    or new.created_at is distinct from old.created_at
    or old.staging_completed_at is not null
      and new.staging_completed_at is distinct from old.staging_completed_at
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_identity_immutable';
  end if;

  if old.status in (
    'succeeded'::public.job_status,
    'failed'::public.job_status,
    'cancelled'::public.job_status
  )
  then
    if (
      to_jsonb(new) - 'purged_at' - 'updated_at'
    ) <> (
      to_jsonb(old) - 'purged_at' - 'updated_at'
    )
      or old.purged_at is not null
      or new.purged_at is null
      or new.purged_at < old.purge_after
    then
      raise exception using
        errcode = '55000',
        message = 'talence_inventory_import_terminal_immutable';
    end if;

    return new;
  end if;

  if (
    old.status = 'queued'::public.job_status
    and new.status not in (
      'queued'::public.job_status,
      'running'::public.job_status,
      'failed'::public.job_status,
      'cancelled'::public.job_status
    )
  )
    or (
      old.status = 'running'::public.job_status
      and new.status not in (
        'running'::public.job_status,
        'succeeded'::public.job_status,
        'failed'::public.job_status,
        'cancelled'::public.job_status
      )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_transition_invalid';
  end if;

  if new.status = 'succeeded'::public.job_status then
    if new.staging_completed_at is null
      or new.ambiguous_rows <> 0
      or new.committed_transaction_id is null
      or new.failure_code is not null
    then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_import_commit_state_invalid';
    end if;

    select
      transaction.source,
      transaction.import_job_id,
      transaction.workspace_id,
      transaction.collection_id
    into v_transaction
    from public.inventory_transactions as transaction
    where transaction.id = new.committed_transaction_id;

    if not found
      or v_transaction.source <> 'csv_import'::public.inventory_source
      or v_transaction.import_job_id <> new.id
      or v_transaction.workspace_id <> new.workspace_id
      or v_transaction.collection_id <> new.collection_id
    then
      raise exception using
        errcode = '23514',
        message = 'talence_inventory_import_commit_transaction_invalid';
    end if;
  elsif new.committed_transaction_id is not null then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_import_commit_pointer_invalid';
  end if;

  return new;
end;
$$;

create trigger inventory_import_jobs_validate_transition
before insert or update on public.inventory_import_jobs
for each row execute function app_private.validate_inventory_import_job_transition();

create function app_private.guard_inventory_import_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job_status public.job_status;
  v_purge_after timestamptz;
  v_job_id uuid := case
    when tg_op = 'DELETE' then old.import_job_id
    else new.import_job_id
  end;
begin
  select job.status, job.purge_after
  into v_job_status, v_purge_after
  from public.inventory_import_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'talence_inventory_import_job_not_found';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and v_job_status not in (
      'queued'::public.job_status,
      'running'::public.job_status
    )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_rows_terminal';
  end if;

  if tg_op = 'DELETE'
    and v_job_status not in (
      'queued'::public.job_status,
      'running'::public.job_status
    )
    and not (
      current_user in ('postgres', 'supabase_admin')
      and v_purge_after <= statement_timestamp()
    )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_inventory_import_rows_terminal';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger inventory_import_rows_guard_mutation
before insert or update or delete on public.inventory_import_rows
for each row execute function app_private.guard_inventory_import_row_mutation();

create function app_private.validate_paired_inventory_transfer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_transfer_group_id uuid;
  v_header_count integer;
  v_line_count integer;
begin
  if tg_table_name = 'inventory_transactions' then
    v_transfer_group_id := new.transfer_group_id;
  else
    select transaction.transfer_group_id
    into v_transfer_group_id
    from public.inventory_transactions as transaction
    where transaction.id = new.transaction_id;
  end if;

  if v_transfer_group_id is null then
    return null;
  end if;

  select count(*)
  into v_header_count
  from public.inventory_transactions as transaction
  where transaction.transfer_group_id = v_transfer_group_id;

  if v_header_count <> 2
    or (
      select count(distinct transaction.workspace_id)
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 1
    or (
      select count(distinct collection.game_id)
      from public.inventory_transactions as transaction
      join public.collections as collection
        on collection.id = transaction.collection_id
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 1
    or (
      select count(distinct transaction.collection_id)
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 2
    or (
      select count(distinct transaction.transfer_direction)
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 2
    or (
      select count(distinct transaction.source)
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 1
    or (
      select transaction.source not in (
        'transfer'::public.inventory_source,
        'reversal'::public.inventory_source
      )
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
      limit 1
    )
    or (
      select count(distinct coalesce(transaction.actor_user_id::text, ''))
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 1
    or (
      select count(distinct transaction.idempotency_key)
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 1
    or (
      select count(distinct transaction.occurred_at)
      from public.inventory_transactions as transaction
      where transaction.transfer_group_id = v_transfer_group_id
    ) <> 1
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_transfer_pair_invalid';
  end if;

  select count(*)
  into v_line_count
  from public.inventory_transaction_lines as line
  join public.inventory_transactions as transaction
    on transaction.id = line.transaction_id
  where transaction.transfer_group_id = v_transfer_group_id;

  if v_line_count < 2
    or (
      select count(*)
      from public.inventory_transaction_lines as line
      join public.inventory_transactions as transaction
        on transaction.id = line.transaction_id
      where transaction.transfer_group_id = v_transfer_group_id
        and (
          transaction.transfer_direction = 'out'
            and line.quantity_delta >= 0
          or transaction.transfer_direction = 'in'
            and line.quantity_delta <= 0
        )
    ) > 0
    or exists (
      (
        select
          line.printing_id,
          line.finish,
          line.condition,
          -line.quantity_delta as quantity_delta
        from public.inventory_transaction_lines as line
        join public.inventory_transactions as transaction
          on transaction.id = line.transaction_id
        where transaction.transfer_group_id = v_transfer_group_id
          and transaction.transfer_direction = 'out'
        except
        select
          line.printing_id,
          line.finish,
          line.condition,
          line.quantity_delta
        from public.inventory_transaction_lines as line
        join public.inventory_transactions as transaction
          on transaction.id = line.transaction_id
        where transaction.transfer_group_id = v_transfer_group_id
          and transaction.transfer_direction = 'in'
      )
      union all
      (
        select
          line.printing_id,
          line.finish,
          line.condition,
          line.quantity_delta
        from public.inventory_transaction_lines as line
        join public.inventory_transactions as transaction
          on transaction.id = line.transaction_id
        where transaction.transfer_group_id = v_transfer_group_id
          and transaction.transfer_direction = 'in'
        except
        select
          line.printing_id,
          line.finish,
          line.condition,
          -line.quantity_delta
        from public.inventory_transaction_lines as line
        join public.inventory_transactions as transaction
          on transaction.id = line.transaction_id
        where transaction.transfer_group_id = v_transfer_group_id
          and transaction.transfer_direction = 'out'
      )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_transfer_lines_invalid';
  end if;

  if (
    select transaction.source = 'reversal'::public.inventory_source
    from public.inventory_transactions as transaction
    where transaction.transfer_group_id = v_transfer_group_id
    limit 1
  )
    and exists (
      select 1
      from public.inventory_transactions as reversal
      join public.inventory_transactions as original
        on original.id = reversal.reverses_transaction_id
      where reversal.transfer_group_id = v_transfer_group_id
        and (
          original.transfer_group_id is null
          or original.transfer_direction = reversal.transfer_direction
        )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_transfer_reversal_pair_invalid';
  end if;

  return null;
end;
$$;

create constraint trigger inventory_transactions_validate_transfer_pair
after insert on public.inventory_transactions
deferrable initially deferred
for each row execute function app_private.validate_paired_inventory_transfer();

create constraint trigger inventory_transaction_lines_validate_transfer_pair
after insert on public.inventory_transaction_lines
deferrable initially deferred
for each row execute function app_private.validate_paired_inventory_transfer();

create function app_private.validate_inventory_reversal_target()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reversal_id uuid;
  v_reversal public.inventory_transactions;
  v_original public.inventory_transactions;
begin
  if tg_table_name = 'inventory_transactions' then
    v_reversal_id := new.id;
  else
    v_reversal_id := new.transaction_id;
  end if;

  select transaction.*
  into v_reversal
  from public.inventory_transactions as transaction
  where transaction.id = v_reversal_id;

  if not found or v_reversal.source <> 'reversal'::public.inventory_source then
    return null;
  end if;

  select transaction.*
  into v_original
  from public.inventory_transactions as transaction
  where transaction.id = v_reversal.reverses_transaction_id;

  if not found
    or v_original.source = 'reversal'::public.inventory_source
    or v_original.workspace_id <> v_reversal.workspace_id
    or v_original.collection_id <> v_reversal.collection_id
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_reversal_target_invalid';
  end if;

  if not exists (
    select 1
    from public.inventory_transaction_lines as line
    where line.transaction_id = v_reversal.id
  )
    or exists (
      (
        select
          line.printing_id,
          line.finish,
          line.condition,
          -line.quantity_delta as quantity_delta
        from public.inventory_transaction_lines as line
        where line.transaction_id = v_original.id
        except
        select
          line.printing_id,
          line.finish,
          line.condition,
          line.quantity_delta
        from public.inventory_transaction_lines as line
        where line.transaction_id = v_reversal.id
      )
      union all
      (
        select
          line.printing_id,
          line.finish,
          line.condition,
          line.quantity_delta
        from public.inventory_transaction_lines as line
        where line.transaction_id = v_reversal.id
        except
        select
          line.printing_id,
          line.finish,
          line.condition,
          -line.quantity_delta
        from public.inventory_transaction_lines as line
        where line.transaction_id = v_original.id
      )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_reversal_lines_invalid';
  end if;

  if v_reversal.transfer_group_id is not null
    and (
      exists (
        select 1
        from public.inventory_transactions as paired_reversal
        join public.inventory_transactions as paired_original
          on paired_original.id = paired_reversal.reverses_transaction_id
        where paired_reversal.transfer_group_id
          = v_reversal.transfer_group_id
          and (
            paired_original.source <> 'transfer'::public.inventory_source
            or paired_original.transfer_group_id is null
          )
      )
      or (
        select count(distinct paired_original.transfer_group_id)
        from public.inventory_transactions as paired_reversal
        join public.inventory_transactions as paired_original
          on paired_original.id = paired_reversal.reverses_transaction_id
        where paired_reversal.transfer_group_id
          = v_reversal.transfer_group_id
      ) <> 1
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_inventory_transfer_reversal_target_invalid';
  end if;

  return null;
end;
$$;

create constraint trigger inventory_transactions_validate_reversal_target
after insert on public.inventory_transactions
deferrable initially deferred
for each row execute function app_private.validate_inventory_reversal_target();

create constraint trigger inventory_transaction_lines_validate_reversal_target
after insert on public.inventory_transaction_lines
deferrable initially deferred
for each row execute function app_private.validate_inventory_reversal_target();

revoke all on table app_private.inventory_value_tiers
  from public, anon, authenticated;
revoke all on table app_private.inventory_operation_requests
  from public, anon, authenticated;
revoke all on function app_private.reject_immutable_inventory_change()
  from public, anon, authenticated;
revoke all on function app_private.guard_inventory_balance_write()
  from public, anon, authenticated;
revoke all on function app_private.validate_collection_phase_3_integrity()
  from public, anon, authenticated;
revoke all on function app_private.reject_collection_hard_delete()
  from public, anon, authenticated;
revoke all on function app_private.validate_inventory_import_job_transition()
  from public, anon, authenticated;
revoke all on function app_private.guard_inventory_import_row_mutation()
  from public, anon, authenticated;
revoke all on function app_private.validate_paired_inventory_transfer()
  from public, anon, authenticated;
revoke all on function app_private.validate_inventory_reversal_target()
  from public, anon, authenticated;

alter table public.inventory_import_jobs enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_transaction_lines enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_import_rows enable row level security;

revoke all privileges on table public.inventory_import_jobs
  from public, anon, authenticated;
revoke all privileges on table public.inventory_transactions
  from public, anon, authenticated;
revoke all privileges on table public.inventory_transaction_lines
  from public, anon, authenticated;
revoke all privileges on table public.inventory_balances
  from public, anon, authenticated;
revoke all privileges on table public.inventory_import_rows
  from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'inventory-imports',
  'inventory-imports',
  false,
  2097152,
  array[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.inventory_balances is
  'Workspace-scoped materialized inventory state. Only trusted ledger functions may mutate it.';
comment on table public.inventory_transactions is
  'Immutable inventory transaction headers. Request hashes and replay results live only in app_private.';
comment on table public.inventory_transaction_lines is
  'Immutable before/delta/after inventory audit lines.';
comment on table public.inventory_import_jobs is
  'Workspace-scoped bounded private CSV import lifecycle and retention metadata.';
comment on table public.inventory_import_rows is
  'Bounded CSV staging rows, including explicit ambiguity/rejection state; no silent name resolution.';
comment on table app_private.inventory_operation_requests is
  'Server-only canonical request hashes, idempotency scopes, transaction mappings, and replay payloads.';
