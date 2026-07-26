-- Phase 1: invite-only identity and workspace foundation.
--
-- This migration creates only the admission, human identity, tenancy, and
-- default-collection prerequisites required by the Phase 1 canon. Catalog,
-- inventory-ledger, deck, and device tables intentionally arrive in later
-- phases.

create schema if not exists app_private authorization postgres;
create schema if not exists app_api authorization postgres;

comment on schema app_private is
  'Private Talence admission and security data. Never expose through PostgREST.';
comment on schema app_api is
  'Non-exposed Talence authorization helpers used by policies and trusted SQL.';

revoke all on schema app_private from public, anon, authenticated;
revoke all on schema app_api from public, anon, authenticated;

create type public.invite_status as enum (
  'draft',
  'sent',
  'accepted',
  'revoked',
  'expired',
  'failed'
);

create type public.profile_status as enum (
  'active',
  'suspended',
  'deletion_requested',
  'deleted'
);

create type public.workspace_type as enum (
  'personal',
  'team',
  'store'
);

create type public.membership_role as enum (
  'owner',
  'admin',
  'editor',
  'viewer'
);

create type public.membership_status as enum (
  'active',
  'suspended'
);

create type public.resource_status as enum (
  'active',
  'archived',
  'deleted'
);

create type public.visibility as enum (
  'private',
  'unlisted',
  'public'
);

create function app_private.normalize_email(p_email text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select lower(btrim(p_email))
$$;

comment on function app_private.normalize_email(text) is
  'Returns the canonical lowercase, whitespace-trimmed representation of an email address.';

create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create function app_private.normalize_email_column()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $$
begin
  new.email := app_private.normalize_email(new.email);
  return new;
end;
$$;

revoke all on function app_private.normalize_email(text) from public, anon, authenticated;
revoke all on function app_private.set_updated_at() from public, anon, authenticated;
revoke all on function app_private.normalize_email_column() from public, anon, authenticated;

create table app_private.invited_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status public.invite_status not null default 'draft',
  invited_by_user_id uuid null references auth.users (id) on delete set null,
  auth_user_id uuid null references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  sent_at timestamptz null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  last_error_code text null,
  note text null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint invited_users_email_normalized check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint invited_users_error_code_bounded check (
    last_error_code is null or char_length(last_error_code) between 1 and 128
  ),
  constraint invited_users_note_bounded check (
    note is null or char_length(note) <= 2000
  ),
  constraint invited_users_accepted_shape check (
    status <> 'accepted'
    or (
      auth_user_id is not null
      and accepted_at is not null
      and revoked_at is null
    )
  ),
  constraint invited_users_revoked_shape check (
    status <> 'revoked' or revoked_at is not null
  ),
  constraint invited_users_temporal_order check (
    (sent_at is null or sent_at >= created_at)
    and (accepted_at is null or accepted_at >= created_at)
    and (revoked_at is null or revoked_at >= created_at)
  )
);

comment on table app_private.invited_users is
  'Canonical private-beta admission ledger. It is never exposed through the Data API.';

create unique index invited_users_one_open_email_idx
  on app_private.invited_users (email)
  where status in ('draft', 'sent');
create unique index invited_users_auth_user_idx
  on app_private.invited_users (auth_user_id)
  where auth_user_id is not null;
create index invited_users_email_idx on app_private.invited_users (email);
create index invited_users_invited_by_idx
  on app_private.invited_users (invited_by_user_id);
create index invited_users_status_expiry_idx
  on app_private.invited_users (status, expires_at);

create trigger invited_users_normalize_email
before insert or update of email on app_private.invited_users
for each row execute function app_private.normalize_email_column();

create trigger invited_users_set_updated_at
before update on app_private.invited_users
for each row execute function app_private.set_updated_at();

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  admission_invite_id uuid not null unique
    references app_private.invited_users (id) on delete restrict,
  handle text null,
  display_name text null,
  avatar_path text null,
  preferred_currency text not null default 'USD',
  status public.profile_status not null default 'active',
  default_workspace_id uuid null,
  default_collection_id uuid null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_handle_shape check (
    handle is null
    or (
      char_length(handle) between 3 and 40
      and handle ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    )
  ),
  constraint profiles_display_name_bounded check (
    display_name is null or char_length(btrim(display_name)) between 1 and 120
  ),
  constraint profiles_avatar_path_bounded check (
    avatar_path is null
    or (
      char_length(avatar_path) between 1 and 512
      and avatar_path !~ '^[a-z][a-z0-9+.-]*://'
      and avatar_path !~ '(^|/)\.\.(/|$)'
    )
  ),
  constraint profiles_currency_shape check (
    preferred_currency ~ '^[A-Z]{3}$'
  )
);

create unique index profiles_handle_casefold_idx
  on public.profiles (lower(handle))
  where handle is not null;
create index profiles_default_workspace_idx
  on public.profiles (default_workspace_id);
create index profiles_default_collection_idx
  on public.profiles (default_collection_id);
create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create table public.platform_user_roles (
  user_id uuid not null references auth.users (id) on delete restrict,
  role text not null,
  granted_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, role),
  constraint platform_user_roles_known_role check (role = 'platform_admin')
);

create index platform_user_roles_granted_by_idx
  on public.platform_user_roles (granted_by_user_id);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  type public.workspace_type not null,
  name text not null,
  slug text not null,
  status public.resource_status not null default 'active',
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint workspaces_name_bounded check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint workspaces_slug_shape check (
    slug = lower(slug)
    and char_length(slug) between 3 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint workspaces_status_timestamps check (
    (
      status = 'active'
      and archived_at is null
      and deleted_at is null
    )
    or (
      status = 'archived'
      and archived_at is not null
      and deleted_at is null
    )
    or (
      status = 'deleted'
      and deleted_at is not null
    )
  )
);

create unique index workspaces_slug_casefold_idx
  on public.workspaces (lower(slug));
create index workspaces_created_by_idx
  on public.workspaces (created_by_user_id);
create index workspaces_status_idx on public.workspaces (status);

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function app_private.set_updated_at();

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default statement_timestamp(),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, user_id),
  constraint workspace_memberships_joined_order check (joined_at >= created_at)
);

create index workspace_memberships_user_idx
  on public.workspace_memberships (user_id, status, workspace_id);
create index workspace_memberships_authorization_idx
  on public.workspace_memberships (workspace_id, status, role, user_id);
create index workspace_memberships_created_by_idx
  on public.workspace_memberships (created_by_user_id);

create trigger workspace_memberships_set_updated_at
before update on public.workspace_memberships
for each row execute function app_private.set_updated_at();

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.membership_role not null,
  status public.invite_status not null default 'draft',
  invited_by_user_id uuid not null references auth.users (id) on delete restrict,
  accepted_by_user_id uuid null references auth.users (id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint workspace_invitations_role_not_owner check (role <> 'owner'),
  constraint workspace_invitations_email_normalized check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint workspace_invitations_accepted_shape check (
    status <> 'accepted'
    or (
      accepted_by_user_id is not null
      and accepted_at is not null
      and revoked_at is null
    )
  ),
  constraint workspace_invitations_revoked_shape check (
    status <> 'revoked' or revoked_at is not null
  )
);

create unique index workspace_invitations_one_open_email_idx
  on public.workspace_invitations (workspace_id, email)
  where status in ('draft', 'sent');
create index workspace_invitations_workspace_idx
  on public.workspace_invitations (workspace_id);
create index workspace_invitations_email_idx
  on public.workspace_invitations (email);
create index workspace_invitations_invited_by_idx
  on public.workspace_invitations (invited_by_user_id);
create index workspace_invitations_accepted_by_idx
  on public.workspace_invitations (accepted_by_user_id);

create trigger workspace_invitations_normalize_email
before insert or update of email on public.workspace_invitations
for each row execute function app_private.normalize_email_column();

create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function app_private.set_updated_at();

create table public.user_preferences (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  catalog_view text not null default 'table',
  collection_view text not null default 'structured',
  deck_view text not null default 'list',
  compact_mode boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_preferences_catalog_view check (
    catalog_view in ('table', 'grid')
  ),
  constraint user_preferences_collection_view check (
    collection_view in ('structured', 'gallery', 'analytical')
  ),
  constraint user_preferences_deck_view check (
    deck_view in ('list', 'visual')
  ),
  constraint user_preferences_object check (
    jsonb_typeof(preferences) = 'object'
    and pg_column_size(preferences) <= 16384
  )
);

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function app_private.set_updated_at();

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  publisher text null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint games_code_shape check (
    code = lower(code)
    and code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'
  ),
  constraint games_name_bounded check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint games_metadata_object check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 16384
  )
);

create unique index games_code_casefold_idx on public.games (lower(code));

create trigger games_set_updated_at
before update on public.games
for each row execute function app_private.set_updated_at();

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete restrict,
  name text not null,
  slug text not null,
  description text null,
  visibility public.visibility not null default 'private',
  status public.resource_status not null default 'active',
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint collections_name_bounded check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint collections_slug_shape check (
    slug = lower(slug)
    and char_length(slug) between 3 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint collections_description_bounded check (
    description is null or char_length(description) <= 4000
  ),
  constraint collections_status_timestamps check (
    (
      status = 'active'
      and archived_at is null
      and deleted_at is null
    )
    or (
      status = 'archived'
      and archived_at is not null
      and deleted_at is null
    )
    or (
      status = 'deleted'
      and deleted_at is not null
    )
  )
);

comment on table public.collections is
  'Phase 1 default-collection prerequisite. Inventory tables are introduced in Phase 3.';

create unique index collections_workspace_slug_open_idx
  on public.collections (workspace_id, lower(slug))
  where status <> 'deleted';
create index collections_workspace_idx
  on public.collections (workspace_id, status);
create index collections_game_idx on public.collections (game_id);
create index collections_created_by_idx
  on public.collections (created_by_user_id);

create trigger collections_set_updated_at
before update on public.collections
for each row execute function app_private.set_updated_at();

alter table public.profiles
  add constraint profiles_default_workspace_fk
  foreign key (default_workspace_id)
  references public.workspaces (id)
  on delete restrict;

alter table public.profiles
  add constraint profiles_default_collection_fk
  foreign key (default_collection_id)
  references public.collections (id)
  on delete restrict;

-- This stable UUID is part of the implementation seed contract so admission
-- finalization has an MTG game row in every environment, including production.
insert into public.games (
  id,
  code,
  name,
  publisher,
  active,
  metadata
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'mtg',
  'Magic: The Gathering',
  'Wizards of the Coast',
  true,
  '{"provisioning_key":"default"}'::jsonb
);

revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all sequences in schema app_private from public, anon, authenticated;
