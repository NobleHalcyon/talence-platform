-- Phase 1: admission hook, trusted invitation transitions, user finalization,
-- authorization helpers, and final-owner/default-resource protections.

create function app_private.membership_role_rank(p_role public.membership_role)
returns smallint
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case p_role
    when 'viewer'::public.membership_role then 1
    when 'editor'::public.membership_role then 2
    when 'admin'::public.membership_role then 3
    when 'owner'::public.membership_role then 4
  end::smallint
$$;

create function app_private.is_admitted_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.platform_user_roles as pur
    join public.profiles as p
      on p.user_id = pur.user_id
    join app_private.invited_users as iu
      on iu.id = p.admission_invite_id
    where pur.user_id = p_user_id
      and pur.role = 'platform_admin'
      and p.status = 'active'::public.profile_status
      and iu.status = 'accepted'::public.invite_status
      and iu.auth_user_id = p_user_id
      and iu.accepted_at is not null
      and iu.revoked_at is null
  )
$$;

create function app_private.assert_invite_admin_actor(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_has_admin boolean;
begin
  -- Serializes the zero-admin bootstrap window with first-admin creation.
  perform pg_advisory_xact_lock(
    hashtextextended('talence:platform-admin-bootstrap', 0)
  );

  select exists (
    select 1
    from public.platform_user_roles as pur
    where pur.role = 'platform_admin'
  )
  into v_has_admin;

  if not v_has_admin then
    if p_actor_user_id is not null then
      raise exception using
        errcode = 'P0001',
        message = 'talence_bootstrap_actor_must_be_null';
    end if;
    return;
  end if;

  if p_actor_user_id is null
    or not app_private.is_admitted_platform_admin(p_actor_user_id)
  then
    raise exception using
      errcode = 'P0001',
      message = 'talence_platform_admin_required';
  end if;
end;
$$;

create function app_private.invited_user_to_json(p_invited_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', iu.id,
    'email', iu.email,
    'status', iu.status,
    'effective_status',
      case
        when iu.status in (
          'draft'::public.invite_status,
          'sent'::public.invite_status
        )
          and iu.expires_at <= statement_timestamp()
        then 'expired'::public.invite_status
        else iu.status
      end,
    'invited_by_user_id', iu.invited_by_user_id,
    'auth_user_id', iu.auth_user_id,
    'expires_at', iu.expires_at,
    'sent_at', iu.sent_at,
    'accepted_at', iu.accepted_at,
    'revoked_at', iu.revoked_at,
    'last_error_code', iu.last_error_code,
    'note', iu.note,
    'created_at', iu.created_at,
    'updated_at', iu.updated_at
  )
  from app_private.invited_users as iu
  where iu.id = p_invited_user_id
$$;

create function app_private.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text;
begin
  v_email := app_private.normalize_email(event -> 'user' ->> 'email');

  if v_email is not null
    and exists (
      select 1
      from app_private.invited_users as iu
      where iu.email = v_email
        and iu.status in (
          'draft'::public.invite_status,
          'sent'::public.invite_status
        )
        and iu.expires_at > statement_timestamp()
        and iu.revoked_at is null
    )
  then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code',
      403,
      'message',
      'Account creation is restricted to a valid Talence invitation.'
    )
  );
end;
$$;

comment on function app_private.before_user_created_hook(jsonb) is
  'Supabase Before User Created hook. Allows only a current, non-revoked invited email.';

create function app_api.is_admitted_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles as p
    join app_private.invited_users as iu
      on iu.id = p.admission_invite_id
    where p.user_id = p_user_id
      and p.status = 'active'::public.profile_status
      and iu.status = 'accepted'::public.invite_status
      and iu.auth_user_id = p_user_id
      and iu.accepted_at is not null
      and iu.revoked_at is null
  )
$$;

create function app_api.has_workspace_role(
  p_workspace_id uuid,
  p_minimum_role public.membership_role
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
      from public.workspace_memberships as wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'::public.membership_status
        and app_private.membership_role_rank(wm.role)
          >= app_private.membership_role_rank(p_minimum_role)
    )
$$;

create function app_api.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.is_admitted_platform_admin(auth.uid())
$$;

create function app_private.validate_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_collection_workspace_id uuid;
begin
  if new.default_collection_id is not null
    and new.default_workspace_id is null
  then
    raise exception using
      errcode = '23514',
      message = 'talence_default_collection_requires_workspace';
  end if;

  if new.default_workspace_id is not null
    and not exists (
      select 1
      from public.workspace_memberships as wm
      join public.workspaces as w
        on w.id = wm.workspace_id
      where wm.workspace_id = new.default_workspace_id
        and wm.user_id = new.user_id
        and wm.status = 'active'::public.membership_status
        and w.status = 'active'::public.resource_status
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_default_workspace_inaccessible';
  end if;

  if new.default_collection_id is not null then
    select c.workspace_id
    into v_collection_workspace_id
    from public.collections as c
    where c.id = new.default_collection_id
      and c.status = 'active'::public.resource_status;

    if v_collection_workspace_id is null
      or v_collection_workspace_id <> new.default_workspace_id
    then
      raise exception using
        errcode = '23514',
        message = 'talence_default_collection_inaccessible';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_validate_defaults
before insert or update of default_workspace_id, default_collection_id
on public.profiles
for each row execute function app_private.validate_profile_defaults();

create function app_private.protect_final_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_removes_active_owner boolean;
  v_workspace_active boolean;
begin
  v_removes_active_owner :=
    old.role = 'owner'::public.membership_role
    and old.status = 'active'::public.membership_status
    and (
      tg_op = 'DELETE'
      or new.workspace_id <> old.workspace_id
      or new.user_id <> old.user_id
      or new.role <> 'owner'::public.membership_role
      or new.status <> 'active'::public.membership_status
    );

  if not v_removes_active_owner then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Locking the tenancy root serializes concurrent owner removals.
  select w.status = 'active'::public.resource_status
  into v_workspace_active
  from public.workspaces as w
  where w.id = old.workspace_id
  for update;

  if coalesce(v_workspace_active, false)
    and not exists (
      select 1
      from public.workspace_memberships as remaining
      where remaining.workspace_id = old.workspace_id
        and remaining.user_id <> old.user_id
        and remaining.role = 'owner'::public.membership_role
        and remaining.status = 'active'::public.membership_status
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_final_workspace_owner_required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger workspace_memberships_protect_final_owner
before delete or update of workspace_id, user_id, role, status
on public.workspace_memberships
for each row execute function app_private.protect_final_workspace_owner();

create function app_private.enforce_active_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_workspace_id uuid;
  v_new_workspace_id uuid;
begin
  if tg_table_name = 'workspaces' then
    if tg_op <> 'INSERT' then
      v_old_workspace_id := old.id;
    end if;
    if tg_op <> 'DELETE' then
      v_new_workspace_id := new.id;
    end if;
  else
    if tg_op <> 'INSERT' then
      v_old_workspace_id := old.workspace_id;
    end if;
    if tg_op <> 'DELETE' then
      v_new_workspace_id := new.workspace_id;
    end if;
  end if;

  if v_old_workspace_id is not null
    and exists (
      select 1
      from public.workspaces as w
      where w.id = v_old_workspace_id
        and w.status = 'active'::public.resource_status
    )
    and not exists (
      select 1
      from public.workspace_memberships as wm
      where wm.workspace_id = v_old_workspace_id
        and wm.role = 'owner'::public.membership_role
        and wm.status = 'active'::public.membership_status
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_active_workspace_owner_required';
  end if;

  if v_new_workspace_id is not null
    and v_new_workspace_id is distinct from v_old_workspace_id
    and exists (
      select 1
      from public.workspaces as w
      where w.id = v_new_workspace_id
        and w.status = 'active'::public.resource_status
    )
    and not exists (
      select 1
      from public.workspace_memberships as wm
      where wm.workspace_id = v_new_workspace_id
        and wm.role = 'owner'::public.membership_role
        and wm.status = 'active'::public.membership_status
    )
  then
    raise exception using
      errcode = '23514',
      message = 'talence_active_workspace_owner_required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create constraint trigger workspaces_require_active_owner
after insert or update or delete on public.workspaces
deferrable initially deferred
for each row execute function app_private.enforce_active_workspace_owner();

create constraint trigger workspace_memberships_require_active_owner
after insert or update or delete on public.workspace_memberships
deferrable initially deferred
for each row execute function app_private.enforce_active_workspace_owner();

create function public.finalize_admitted_user()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_auth_metadata jsonb;
  v_metadata_invite_text text;
  v_invite_id uuid;
  v_invite app_private.invited_users%rowtype;
  v_profile public.profiles%rowtype;
  v_workspace_id uuid;
  v_collection_id uuid;
  v_mtg_game_id uuid;
  v_replayed boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'talence_authenticated_user_required';
  end if;

  select
    app_private.normalize_email(u.email),
    u.email_confirmed_at,
    coalesce(u.raw_user_meta_data, '{}'::jsonb)
  into v_auth_email, v_email_confirmed_at, v_auth_metadata
  from auth.users as u
  where u.id = v_user_id;

  if v_auth_email is null then
    raise exception using
      errcode = '28000',
      message = 'talence_auth_user_missing_email';
  end if;

  if v_email_confirmed_at is null then
    raise exception using
      errcode = '28000',
      message = 'talence_auth_email_unverified';
  end if;

  v_metadata_invite_text := v_auth_metadata ->> 'invited_user_id';
  if v_metadata_invite_text is null then
    raise exception using
      errcode = '28000',
      message = 'talence_invitation_metadata_required';
  end if;

  begin
    v_invite_id := v_metadata_invite_text::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '28000',
        message = 'talence_invitation_metadata_invalid';
  end;

  select iu.*
  into v_invite
  from app_private.invited_users as iu
  where iu.id = v_invite_id
  for update;

  if not found then
    raise exception using
      errcode = '28000',
      message = 'talence_invitation_not_found';
  end if;

  if v_invite.email <> v_auth_email then
    raise exception using
      errcode = '28000',
      message = 'talence_invitation_email_mismatch';
  end if;

  if v_invite.revoked_at is not null
    or v_invite.status = 'revoked'::public.invite_status
  then
    raise exception using
      errcode = '28000',
      message = 'talence_invitation_revoked';
  end if;

  if v_invite.status = 'accepted'::public.invite_status then
    if v_invite.auth_user_id <> v_user_id then
      raise exception using
        errcode = '28000',
        message = 'talence_invitation_user_mismatch';
    end if;
    v_replayed := true;
  else
    if v_invite.status not in (
      'draft'::public.invite_status,
      'sent'::public.invite_status
    )
    then
      raise exception using
        errcode = '28000',
        message = 'talence_invitation_not_finalizable';
    end if;

    if v_invite.expires_at <= statement_timestamp() then
      raise exception using
        errcode = '28000',
        message = 'talence_invitation_expired';
    end if;

    if v_invite.auth_user_id is not null
      and v_invite.auth_user_id <> v_user_id
    then
      raise exception using
        errcode = '28000',
        message = 'talence_invitation_user_mismatch';
    end if;

    update app_private.invited_users
    set
      status = 'accepted'::public.invite_status,
      auth_user_id = v_user_id,
      accepted_at = statement_timestamp(),
      last_error_code = null
    where id = v_invite.id;
  end if;

  insert into public.profiles (
    user_id,
    admission_invite_id,
    display_name,
    status
  )
  values (
    v_user_id,
    v_invite.id,
    nullif(btrim(v_auth_metadata ->> 'display_name'), ''),
    'active'::public.profile_status
  )
  on conflict (user_id) do nothing;

  select p.*
  into v_profile
  from public.profiles as p
  where p.user_id = v_user_id
  for update;

  if v_profile.admission_invite_id <> v_invite.id then
    raise exception using
      errcode = '28000',
      message = 'talence_profile_invitation_mismatch';
  end if;

  if v_profile.status <> 'active'::public.profile_status
    and not v_replayed
  then
    update public.profiles
    set status = 'active'::public.profile_status
    where user_id = v_user_id;
    v_profile.status := 'active'::public.profile_status;
  end if;

  if v_profile.status <> 'active'::public.profile_status then
    raise exception using
      errcode = '28000',
      message = 'talence_profile_inactive';
  end if;

  if v_profile.default_workspace_id is not null
    and exists (
      select 1
      from public.workspaces as w
      join public.workspace_memberships as wm
        on wm.workspace_id = w.id
      where w.id = v_profile.default_workspace_id
        and w.type = 'personal'::public.workspace_type
        and w.status = 'active'::public.resource_status
        and wm.user_id = v_user_id
        and wm.role = 'owner'::public.membership_role
        and wm.status = 'active'::public.membership_status
    )
  then
    v_workspace_id := v_profile.default_workspace_id;
  else
    select w.id
    into v_workspace_id
    from public.workspaces as w
    join public.workspace_memberships as wm
      on wm.workspace_id = w.id
    where w.type = 'personal'::public.workspace_type
      and w.status = 'active'::public.resource_status
      and w.created_by_user_id = v_user_id
      and wm.user_id = v_user_id
      and wm.role = 'owner'::public.membership_role
      and wm.status = 'active'::public.membership_status
    order by w.created_at, w.id
    limit 1;
  end if;

  if v_workspace_id is null then
    insert into public.workspaces (
      type,
      name,
      slug,
      status,
      created_by_user_id
    )
    values (
      'personal'::public.workspace_type,
      coalesce(
        nullif(btrim(v_profile.display_name), '') || '''s workspace',
        'Personal workspace'
      ),
      'personal-' || replace(v_user_id::text, '-', ''),
      'active'::public.resource_status,
      v_user_id
    )
    returning id into v_workspace_id;

    insert into public.workspace_memberships (
      workspace_id,
      user_id,
      role,
      status,
      created_by_user_id
    )
    values (
      v_workspace_id,
      v_user_id,
      'owner'::public.membership_role,
      'active'::public.membership_status,
      v_user_id
    );
  end if;

  select g.id
  into v_mtg_game_id
  from public.games as g
  where g.code = 'mtg'
    and g.active
  order by g.created_at, g.id
  limit 1;

  if v_mtg_game_id is null then
    raise exception using
      errcode = '55000',
      message = 'talence_default_mtg_game_missing';
  end if;

  if v_profile.default_collection_id is not null
    and exists (
      select 1
      from public.collections as c
      where c.id = v_profile.default_collection_id
        and c.workspace_id = v_workspace_id
        and c.game_id = v_mtg_game_id
        and c.status = 'active'::public.resource_status
    )
  then
    v_collection_id := v_profile.default_collection_id;
  else
    select c.id
    into v_collection_id
    from public.collections as c
    where c.workspace_id = v_workspace_id
      and c.game_id = v_mtg_game_id
      and c.status = 'active'::public.resource_status
      and c.slug = 'main-collection'
    order by c.created_at, c.id
    limit 1;
  end if;

  if v_collection_id is null then
    insert into public.collections (
      workspace_id,
      game_id,
      name,
      slug,
      visibility,
      status,
      created_by_user_id
    )
    values (
      v_workspace_id,
      v_mtg_game_id,
      'Main Collection',
      'main-collection',
      'private'::public.visibility,
      'active'::public.resource_status,
      v_user_id
    )
    returning id into v_collection_id;
  end if;

  update public.profiles
  set
    default_workspace_id = v_workspace_id,
    default_collection_id = v_collection_id
  where user_id = v_user_id;

  insert into public.user_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object(
    'user_id', v_user_id,
    'invited_user_id', v_invite.id,
    'profile_user_id', v_user_id,
    'workspace_id', v_workspace_id,
    'collection_id', v_collection_id,
    'replayed', v_replayed
  );
end;
$$;

comment on function public.finalize_admitted_user() is
  'Atomically accepts the current Auth user invitation and provisions profile, personal workspace, owner membership, preferences, and default MTG collection.';

create function public.current_user_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null
    or not app_api.is_admitted_user(v_user_id)
  then
    return null;
  end if;

  select jsonb_build_object(
    'user_id', p.user_id,
    'is_platform_admin', app_private.is_admitted_platform_admin(p.user_id),
    'profile', jsonb_build_object(
      'user_id', p.user_id,
      'handle', p.handle,
      'display_name', p.display_name,
      'avatar_path', p.avatar_path,
      'preferred_currency', p.preferred_currency,
      'status', p.status,
      'default_workspace_id', p.default_workspace_id,
      'default_collection_id', p.default_collection_id
    ),
    'workspace', jsonb_build_object(
      'id', w.id,
      'type', w.type,
      'name', w.name,
      'slug', w.slug,
      'status', w.status,
      'role', wm.role
    )
  )
  into v_result
  from public.profiles as p
  join public.workspaces as w
    on w.id = p.default_workspace_id
  join public.workspace_memberships as wm
    on wm.workspace_id = w.id
    and wm.user_id = p.user_id
    and wm.status = 'active'::public.membership_status
  where p.user_id = v_user_id;

  return v_result;
end;
$$;

create function public.admin_prepare_invited_user(
  p_actor_user_id uuid,
  p_email text,
  p_expires_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text;
  v_invited_user_id uuid;
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  v_email := app_private.normalize_email(p_email);

  if v_email is null
    or char_length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_email_invalid';
  end if;

  if p_expires_at <= statement_timestamp() then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_expiry_invalid';
  end if;

  if p_note is not null and char_length(p_note) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_note_too_long';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talence:invite:' || v_email, 0)
  );

  update app_private.invited_users
  set status = 'expired'::public.invite_status
  where email = v_email
    and status in (
      'draft'::public.invite_status,
      'sent'::public.invite_status
    )
    and expires_at <= statement_timestamp();

  if exists (
    select 1
    from app_private.invited_users as accepted
    where accepted.email = v_email
      and accepted.status = 'accepted'::public.invite_status
  )
  then
    raise exception using
      errcode = '23505',
      message = 'talence_invitation_email_already_accepted';
  end if;

  select iu.id
  into v_invited_user_id
  from app_private.invited_users as iu
  where iu.email = v_email
    and iu.status in (
      'draft'::public.invite_status,
      'sent'::public.invite_status
    )
  for update;

  if v_invited_user_id is not null then
    if exists (
      select 1
      from app_private.invited_users as sent
      where sent.id = v_invited_user_id
        and sent.status = 'sent'::public.invite_status
    )
    then
      raise exception using
        errcode = '55000',
        message = 'talence_invitation_already_sent';
    end if;

    update app_private.invited_users
    set
      expires_at = p_expires_at,
      note = p_note,
      invited_by_user_id = coalesce(
        p_actor_user_id,
        invited_by_user_id
      ),
      last_error_code = null
    where id = v_invited_user_id;

    return app_private.invited_user_to_json(v_invited_user_id);
  end if;

  if exists (
    select 1
    from app_private.invited_users as linked
    where linked.email = v_email
      and linked.auth_user_id is not null
  )
  then
    raise exception using
      errcode = '23505',
      message = 'talence_invitation_auth_user_still_linked';
  end if;

  insert into app_private.invited_users (
    email,
    status,
    invited_by_user_id,
    expires_at,
    note
  )
  values (
    v_email,
    'draft'::public.invite_status,
    p_actor_user_id,
    p_expires_at,
    p_note
  )
  returning id into v_invited_user_id;

  return app_private.invited_user_to_json(v_invited_user_id);
end;
$$;

create function public.admin_mark_invited_user_sent(
  p_actor_user_id uuid,
  p_invited_user_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invite app_private.invited_users%rowtype;
  v_auth_email text;
  v_auth_invite_id text;
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  select iu.*
  into v_invite
  from app_private.invited_users as iu
  where iu.id = p_invited_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_invitation_not_found';
  end if;

  if v_invite.status not in (
    'draft'::public.invite_status,
    'sent'::public.invite_status
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_invitation_not_sendable';
  end if;

  if v_invite.expires_at <= statement_timestamp()
    or v_invite.revoked_at is not null
  then
    raise exception using
      errcode = '55000',
      message = 'talence_invitation_not_sendable';
  end if;

  if v_invite.auth_user_id is not null
    and v_invite.auth_user_id <> p_auth_user_id
  then
    raise exception using
      errcode = '23505',
      message = 'talence_invitation_auth_user_conflict';
  end if;

  select
    app_private.normalize_email(u.email),
    u.raw_user_meta_data ->> 'invited_user_id'
  into v_auth_email, v_auth_invite_id
  from auth.users as u
  where u.id = p_auth_user_id;

  if v_auth_email is null then
    raise exception using
      errcode = 'P0002',
      message = 'talence_auth_user_not_found';
  end if;

  if v_auth_email <> v_invite.email then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_email_mismatch';
  end if;

  if v_auth_invite_id is distinct from p_invited_user_id::text then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_metadata_mismatch';
  end if;

  update app_private.invited_users
  set
    status = 'sent'::public.invite_status,
    auth_user_id = p_auth_user_id,
    sent_at = coalesce(sent_at, statement_timestamp()),
    last_error_code = null
  where id = p_invited_user_id;

  return app_private.invited_user_to_json(p_invited_user_id);
end;
$$;

create function public.admin_mark_invited_user_failed(
  p_actor_user_id uuid,
  p_invited_user_id uuid,
  p_error_code text,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invite app_private.invited_users%rowtype;
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  if p_error_code is null
    or char_length(p_error_code) not between 1 and 128
  then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_error_code_invalid';
  end if;

  select iu.*
  into v_invite
  from app_private.invited_users as iu
  where iu.id = p_invited_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_invitation_not_found';
  end if;

  if v_invite.status in (
    'accepted'::public.invite_status,
    'revoked'::public.invite_status
  )
  then
    raise exception using
      errcode = '55000',
      message = 'talence_invitation_not_fail_markable';
  end if;

  if p_auth_user_id is not null
    and v_invite.auth_user_id is not null
    and p_auth_user_id <> v_invite.auth_user_id
  then
    raise exception using
      errcode = '23505',
      message = 'talence_invitation_auth_user_conflict';
  end if;

  update app_private.invited_users
  set
    status = 'failed'::public.invite_status,
    auth_user_id = coalesce(p_auth_user_id, auth_user_id),
    last_error_code = p_error_code
  where id = p_invited_user_id;

  return app_private.invited_user_to_json(p_invited_user_id);
end;
$$;

create function public.admin_record_invited_user_error(
  p_actor_user_id uuid,
  p_invited_user_id uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  if p_error_code is null
    or char_length(p_error_code) not between 1 and 128
  then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_error_code_invalid';
  end if;

  update app_private.invited_users
  set last_error_code = p_error_code
  where id = p_invited_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_invitation_not_found';
  end if;

  return app_private.invited_user_to_json(p_invited_user_id);
end;
$$;

create function public.admin_revoke_invited_user(
  p_actor_user_id uuid,
  p_invited_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status public.invite_status;
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  select iu.status
  into v_status
  from app_private.invited_users as iu
  where iu.id = p_invited_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_invitation_not_found';
  end if;

  if v_status = 'accepted'::public.invite_status then
    raise exception using
      errcode = '55000',
      message = 'talence_accepted_invitation_not_revocable';
  end if;

  if v_status <> 'revoked'::public.invite_status then
    update app_private.invited_users
    set
      status = 'revoked'::public.invite_status,
      revoked_at = statement_timestamp()
    where id = p_invited_user_id;
  end if;

  return app_private.invited_user_to_json(p_invited_user_id);
end;
$$;

create function public.admin_get_invited_user(
  p_actor_user_id uuid,
  p_invited_user_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invited_user_id uuid;
  v_email text;
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  if (p_invited_user_id is null) = (p_email is null) then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_exactly_one_selector_required';
  end if;

  if p_invited_user_id is not null then
    v_invited_user_id := p_invited_user_id;
  else
    v_email := app_private.normalize_email(p_email);
    select iu.id
    into v_invited_user_id
    from app_private.invited_users as iu
    where iu.email = v_email
    order by iu.created_at desc, iu.id desc
    limit 1;
  end if;

  if v_invited_user_id is null
    or not exists (
      select 1
      from app_private.invited_users as iu
      where iu.id = v_invited_user_id
    )
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_invitation_not_found';
  end if;

  return app_private.invited_user_to_json(v_invited_user_id);
end;
$$;

create function public.admin_list_invited_users(
  p_actor_user_id uuid,
  p_limit integer default 100,
  p_status public.invite_status default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  perform app_private.assert_invite_admin_actor(p_actor_user_id);

  if p_limit is null or p_limit not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'talence_invitation_list_limit_invalid';
  end if;

  select coalesce(
    jsonb_agg(
      app_private.invited_user_to_json(selected.id)
      order by selected.created_at desc, selected.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select iu.id, iu.created_at
    from app_private.invited_users as iu
    where p_status is null
      or case
        when iu.status in (
          'draft'::public.invite_status,
          'sent'::public.invite_status
        )
          and iu.expires_at <= statement_timestamp()
        then 'expired'::public.invite_status
        else iu.status
      end = p_status
    order by iu.created_at desc, iu.id desc
    limit p_limit
  ) as selected;

  return v_result;
end;
$$;

create function public.admin_bootstrap_platform_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_created_at timestamptz;
  v_already_granted boolean := false;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('talence:platform-admin-bootstrap', 0)
  );

  select pur.created_at
  into v_created_at
  from public.platform_user_roles as pur
  where pur.user_id = p_user_id
    and pur.role = 'platform_admin';

  if found then
    v_already_granted := true;
  else
    if exists (
      select 1
      from public.platform_user_roles as existing
      where existing.role = 'platform_admin'
    )
    then
      raise exception using
        errcode = '55000',
        message = 'talence_platform_admin_already_bootstrapped';
    end if;

    if not app_api.is_admitted_user(p_user_id) then
      raise exception using
        errcode = '28000',
        message = 'talence_bootstrap_user_not_admitted';
    end if;

    insert into public.platform_user_roles (
      user_id,
      role,
      granted_by_user_id
    )
    values (
      p_user_id,
      'platform_admin',
      null
    )
    returning created_at into v_created_at;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'role', 'platform_admin',
    'already_granted', v_already_granted,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function app_private.membership_role_rank(public.membership_role)
  from public, anon, authenticated;
revoke all on function app_private.is_admitted_platform_admin(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_invite_admin_actor(uuid)
  from public, anon, authenticated;
revoke all on function app_private.invited_user_to_json(uuid)
  from public, anon, authenticated;
revoke all on function app_private.before_user_created_hook(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.validate_profile_defaults()
  from public, anon, authenticated;
revoke all on function app_private.protect_final_workspace_owner()
  from public, anon, authenticated;
revoke all on function app_private.enforce_active_workspace_owner()
  from public, anon, authenticated;

grant usage on schema app_private to supabase_auth_admin;
grant execute on function app_private.before_user_created_hook(jsonb)
  to supabase_auth_admin;

revoke all on function app_api.is_admitted_user(uuid)
  from public, anon;
revoke all on function app_api.has_workspace_role(
  uuid,
  public.membership_role
) from public, anon;
revoke all on function app_api.is_platform_admin()
  from public, anon;

grant usage on schema app_api to authenticated, service_role;
grant execute on function app_api.is_admitted_user(uuid)
  to authenticated, service_role;
grant execute on function app_api.has_workspace_role(
  uuid,
  public.membership_role
) to authenticated, service_role;
grant execute on function app_api.is_platform_admin()
  to authenticated, service_role;

revoke all on function public.finalize_admitted_user()
  from public, anon, service_role;
revoke all on function public.current_user_context()
  from public, anon, service_role;
grant execute on function public.finalize_admitted_user() to authenticated;
grant execute on function public.current_user_context() to authenticated;

revoke all on function public.admin_prepare_invited_user(
  uuid,
  text,
  timestamptz,
  text
) from public, anon, authenticated;
revoke all on function public.admin_mark_invited_user_sent(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.admin_mark_invited_user_failed(
  uuid,
  uuid,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function public.admin_record_invited_user_error(
  uuid,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.admin_revoke_invited_user(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_get_invited_user(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_list_invited_users(
  uuid,
  integer,
  public.invite_status
) from public, anon, authenticated;
revoke all on function public.admin_bootstrap_platform_admin(uuid)
  from public, anon, authenticated;

grant execute on function public.admin_prepare_invited_user(
  uuid,
  text,
  timestamptz,
  text
) to service_role;
grant execute on function public.admin_mark_invited_user_sent(
  uuid,
  uuid,
  uuid
) to service_role;
grant execute on function public.admin_mark_invited_user_failed(
  uuid,
  uuid,
  text,
  uuid
) to service_role;
grant execute on function public.admin_record_invited_user_error(
  uuid,
  uuid,
  text
) to service_role;
grant execute on function public.admin_revoke_invited_user(uuid, uuid)
  to service_role;
grant execute on function public.admin_get_invited_user(uuid, uuid, text)
  to service_role;
grant execute on function public.admin_list_invited_users(
  uuid,
  integer,
  public.invite_status
) to service_role;
grant execute on function public.admin_bootstrap_platform_admin(uuid)
  to service_role;
