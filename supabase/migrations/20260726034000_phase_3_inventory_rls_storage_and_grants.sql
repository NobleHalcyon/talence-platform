-- Phase 3: default-deny inventory RLS, exact private import-object policies,
-- and least-privilege RPC grants.

create policy inventory_balances_select_workspace
on public.inventory_balances
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = inventory_balances.collection_id
      and collection.workspace_id = inventory_balances.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

create policy inventory_transactions_select_workspace
on public.inventory_transactions
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = inventory_transactions.collection_id
      and collection.workspace_id = inventory_transactions.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

create policy inventory_transaction_lines_select_workspace
on public.inventory_transaction_lines
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = inventory_transaction_lines.collection_id
      and collection.workspace_id =
        inventory_transaction_lines.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

create policy inventory_import_jobs_select_workspace_editor
on public.inventory_import_jobs
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'editor'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = inventory_import_jobs.collection_id
      and collection.workspace_id = inventory_import_jobs.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

create policy inventory_import_rows_select_workspace_editor
on public.inventory_import_rows
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'editor'::public.membership_role
  )
  and exists (
    select 1
    from public.collections as collection
    where collection.id = inventory_import_rows.collection_id
      and collection.workspace_id = inventory_import_rows.workspace_id
      and collection.status <> 'deleted'::public.resource_status
  )
);

create function app_private.can_access_inventory_import_object(
  p_bucket_id text,
  p_object_name text,
  p_minimum_role public.membership_role,
  p_require_mutable_job boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    app_api.is_admitted_user(auth.uid())
    and exists (
      select 1
      from public.inventory_import_jobs as job
      join public.collections as collection
        on collection.id = job.collection_id
        and collection.workspace_id = job.workspace_id
      where job.storage_bucket = p_bucket_id
        and job.storage_path = p_object_name
        and collection.status <> 'deleted'::public.resource_status
        and (
          not p_require_mutable_job
          or job.status in (
            'queued'::public.job_status,
            'running'::public.job_status
          )
        )
        and app_api.has_workspace_role(
          job.workspace_id,
          p_minimum_role
        )
    )
$$;

create policy inventory_import_objects_select_exact_job
on storage.objects
for select
to authenticated
using (
  app_private.can_access_inventory_import_object(
    bucket_id,
    name,
    'editor'::public.membership_role,
    false
  )
);

create policy inventory_import_objects_insert_exact_job
on storage.objects
for insert
to authenticated
with check (
  app_private.can_access_inventory_import_object(
    bucket_id,
    name,
    'editor'::public.membership_role,
    true
  )
  and (
    owner = auth.uid()
    or owner_id = auth.uid()::text
  )
);

revoke all on function app_private.can_access_inventory_import_object(
  text,
  text,
  public.membership_role,
  boolean
)
  from public, anon, authenticated;
grant execute on function app_private.can_access_inventory_import_object(
  text,
  text,
  public.membership_role,
  boolean
) to authenticated;

grant execute on function public.collection_create(
  uuid,
  text,
  text,
  uuid
) to authenticated;
grant execute on function public.collection_update(
  uuid,
  text,
  text,
  uuid,
  timestamptz
) to authenticated;
grant execute on function public.collection_archive(
  uuid,
  timestamptz
) to authenticated;
grant execute on function public.collection_restore(
  uuid,
  timestamptz
) to authenticated;
grant execute on function public.collection_delete(
  uuid,
  timestamptz
) to authenticated;
grant execute on function public.collection_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
) to authenticated;
grant execute on function public.collection_detail(
  uuid,
  text
) to authenticated;
grant execute on function public.collection_inventory_page(
  uuid,
  text,
  text,
  public.card_finish,
  public.card_condition,
  text,
  text,
  integer,
  text
) to authenticated;
grant execute on function public.calculate_collection_summary(
  uuid,
  text
) to authenticated;
grant execute on function public.collection_analytics(
  uuid,
  text,
  text,
  public.card_finish,
  public.card_condition,
  text
) to authenticated;
grant execute on function public.collection_transaction_history(
  uuid,
  text,
  integer
) to authenticated;
grant execute on function public.collection_transaction_lines(
  uuid,
  integer,
  integer
) to authenticated;
grant execute on function public.collection_inventory_export(
  uuid,
  text,
  integer
) to authenticated;
grant execute on function public.apply_inventory_transaction(
  uuid,
  text,
  timestamptz,
  jsonb,
  text,
  text,
  jsonb
) to authenticated;
grant execute on function public.transfer_inventory(
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb,
  text,
  jsonb
) to authenticated;
grant execute on function public.reverse_inventory_transaction(
  uuid,
  text,
  timestamptz,
  text
) to authenticated;
grant execute on function public.inventory_import_create(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) to authenticated;
grant execute on function public.inventory_import_stage_rows(
  uuid,
  jsonb,
  boolean
) to authenticated;
grant execute on function public.inventory_import_resolve_row(
  uuid,
  integer,
  text,
  uuid
) to authenticated;
grant execute on function public.inventory_import_preview(
  uuid,
  integer,
  integer
) to authenticated;
grant execute on function public.inventory_import_error_report(
  uuid,
  integer,
  integer
) to authenticated;
grant execute on function public.inventory_import_commit(
  uuid,
  text,
  timestamptz,
  text
) to authenticated;
grant execute on function public.inventory_import_cancel(uuid)
  to authenticated;

grant execute on function public.inventory_import_retention_candidates(
  timestamptz,
  integer
) to service_role;
grant execute on function public.inventory_import_expire_stale(
  timestamptz,
  integer
) to service_role;
grant execute on function public.inventory_import_mark_purged(
  uuid,
  timestamptz
) to service_role;

comment on policy inventory_balances_select_workspace
on public.inventory_balances is
  'Future direct reads remain workspace-scoped; ordinary roles receive no table write privilege.';
