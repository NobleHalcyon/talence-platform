-- Phase 1: exposed-table privileges and default-deny Row Level Security.
--
-- app_private and app_api remain absent from api.schemas. Ordinary roles get
-- no direct private-ledger access and no workspace mutation grants.

alter table public.profiles enable row level security;
alter table public.platform_user_roles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.user_preferences enable row level security;
alter table public.games enable row level security;
alter table public.collections enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.platform_user_roles from public, anon, authenticated;
revoke all on table public.workspaces from public, anon, authenticated;
revoke all on table public.workspace_memberships from public, anon, authenticated;
revoke all on table public.workspace_invitations from public, anon, authenticated;
revoke all on table public.user_preferences from public, anon, authenticated;
revoke all on table public.games from public, anon, authenticated;
revoke all on table public.collections from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (
  handle,
  display_name,
  avatar_path,
  preferred_currency,
  default_workspace_id,
  default_collection_id
) on public.profiles to authenticated;

grant select on table public.platform_user_roles to authenticated;
grant select on table public.workspaces to authenticated;
grant select on table public.workspace_memberships to authenticated;
grant select on table public.workspace_invitations to authenticated;
grant select on table public.user_preferences to authenticated;
grant insert (
  user_id,
  catalog_view,
  collection_view,
  deck_view,
  compact_mode,
  preferences
) on table public.user_preferences to authenticated;
grant update (
  catalog_view,
  collection_view,
  deck_view,
  compact_mode,
  preferences
) on table public.user_preferences to authenticated;
grant select on table public.games to authenticated;
grant select on table public.collections to authenticated;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
)
with check (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
);

create policy platform_user_roles_select_self
on public.platform_user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
);

create policy workspaces_select_membership
on public.workspaces
for select
to authenticated
using (
  status <> 'deleted'::public.resource_status
  and app_api.has_workspace_role(
    id,
    'viewer'::public.membership_role
  )
);

create policy workspace_memberships_select_membership
on public.workspace_memberships
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
);

create policy workspace_invitations_select_admin
on public.workspace_invitations
for select
to authenticated
using (
  app_api.has_workspace_role(
    workspace_id,
    'admin'::public.membership_role
  )
);

create policy user_preferences_select_self
on public.user_preferences
for select
to authenticated
using (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
);

create policy user_preferences_insert_self
on public.user_preferences
for insert
to authenticated
with check (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
);

create policy user_preferences_update_self
on public.user_preferences
for update
to authenticated
using (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
)
with check (
  user_id = auth.uid()
  and app_api.is_admitted_user(auth.uid())
);

create policy games_select_admitted
on public.games
for select
to authenticated
using (
  active
  and app_api.is_admitted_user(auth.uid())
);

create policy collections_select_membership
on public.collections
for select
to authenticated
using (
  status <> 'deleted'::public.resource_status
  and app_api.has_workspace_role(
    workspace_id,
    'viewer'::public.membership_role
  )
);

comment on policy profiles_select_self on public.profiles is
  'An active admitted user may read only their own profile.';
comment on policy workspaces_select_membership on public.workspaces is
  'Workspace reads require an active admitted viewer-or-higher membership.';
comment on policy collections_select_membership on public.collections is
  'The Phase 1 default collection is visible only to active admitted workspace members.';
