-- Phase 2: default-deny privileges and Row Level Security for every exposed
-- catalog, price, and catalog-operations table.

alter table public.catalog_sets enable row level security;
alter table public.catalog_cards enable row level security;
alter table public.catalog_printings enable row level security;
alter table public.catalog_faces enable row level security;
alter table public.catalog_legalities enable row level security;
alter table public.catalog_external_ids enable row level security;
alter table public.current_prices enable row level security;
alter table public.catalog_source_files enable row level security;
alter table public.catalog_import_runs enable row level security;
alter table public.catalog_state enable row level security;

revoke all on table public.catalog_sets
  from public, anon, authenticated;
revoke all on table public.catalog_cards
  from public, anon, authenticated;
revoke all on table public.catalog_printings
  from public, anon, authenticated;
revoke all on table public.catalog_faces
  from public, anon, authenticated;
revoke all on table public.catalog_legalities
  from public, anon, authenticated;
revoke all on table public.catalog_external_ids
  from public, anon, authenticated;
revoke all on table public.current_prices
  from public, anon, authenticated;
revoke all on table public.catalog_source_files
  from public, anon, authenticated;
revoke all on table public.catalog_import_runs
  from public, anon, authenticated;
revoke all on table public.catalog_state
  from public, anon, authenticated;

-- Active catalog identity is readable to admitted users. Prices and operational
-- metadata stay behind the admitted-user/admin RPCs so source provenance and
-- freshness are returned as a coherent, bounded contract.
grant select on table public.catalog_sets to authenticated;
grant select on table public.catalog_cards to authenticated;
grant select on table public.catalog_printings to authenticated;
grant select on table public.catalog_faces to authenticated;
grant select on table public.catalog_legalities to authenticated;
grant select on table public.catalog_external_ids to authenticated;

create policy catalog_sets_select_admitted
on public.catalog_sets
for select
to authenticated
using (
  active
  and app_api.is_admitted_user(auth.uid())
);

create policy catalog_cards_select_admitted
on public.catalog_cards
for select
to authenticated
using (
  active
  and app_api.is_admitted_user(auth.uid())
);

create policy catalog_printings_select_admitted
on public.catalog_printings
for select
to authenticated
using (
  active
  and app_api.is_admitted_user(auth.uid())
  and exists (
    select 1
    from public.catalog_sets as catalog_set
    where catalog_set.id = catalog_printings.set_id
      and catalog_set.active
  )
  and (
    card_id is null
    or exists (
      select 1
      from public.catalog_cards as card
      where card.id = catalog_printings.card_id
        and card.active
    )
  )
);

create policy catalog_faces_select_admitted
on public.catalog_faces
for select
to authenticated
using (
  app_api.is_admitted_user(auth.uid())
  and exists (
    select 1
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    where printing.id = catalog_faces.printing_id
      and printing.active
      and catalog_set.active
  )
);

create policy catalog_legalities_select_admitted
on public.catalog_legalities
for select
to authenticated
using (
  app_api.is_admitted_user(auth.uid())
  and exists (
    select 1
    from public.catalog_cards as card
    where card.id = catalog_legalities.card_id
      and card.active
  )
);

create policy catalog_external_ids_select_admitted
on public.catalog_external_ids
for select
to authenticated
using (
  app_api.is_admitted_user(auth.uid())
  and case entity_type
    when 'card' then exists (
      select 1
      from public.catalog_cards as card
      where card.id = catalog_external_ids.entity_id
        and card.active
    )
    when 'printing' then exists (
      select 1
      from public.catalog_printings as printing
      where printing.id = catalog_external_ids.entity_id
        and printing.active
    )
    when 'set' then exists (
      select 1
      from public.catalog_sets as catalog_set
      where catalog_set.id = catalog_external_ids.entity_id
        and catalog_set.active
    )
    else false
  end
);

-- These policies document the admitted read boundary for trusted SQL. No
-- authenticated table privilege is granted; browser price reads use bounded
-- RPCs that always include provider and freshness.
create policy current_prices_select_admitted
on public.current_prices
for select
to authenticated
using (
  app_api.is_admitted_user(auth.uid())
  and exists (
    select 1
    from public.catalog_printings as printing
    where printing.id = current_prices.printing_id
      and printing.active
  )
);

comment on policy catalog_printings_select_admitted
  on public.catalog_printings is
  'Only active admitted users may read active global printing identity.';
comment on policy current_prices_select_admitted
  on public.current_prices is
  'Price rows are admitted-only and surfaced to browsers through bounded freshness-aware RPCs.';

-- catalog_source_files, catalog_import_runs, and catalog_state intentionally
-- have no policies. They are service/admin-only operational data.
