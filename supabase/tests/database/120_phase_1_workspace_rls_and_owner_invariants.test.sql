begin;

select plan(38);

create function pg_temp.create_auth_user(
  p_user_id uuid,
  p_email text,
  p_invited_user_id uuid
)
returns void
language sql
set search_path = pg_catalog
as $$
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
    jsonb_build_object('invited_user_id', p_invited_user_id::text),
    statement_timestamp(),
    statement_timestamp()
  )
$$;

insert into app_private.invited_users (id, email, expires_at)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'workspace-a@example.test',
    statement_timestamp() + interval '1 day'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'workspace-b@example.test',
    statement_timestamp() + interval '1 day'
  );

select pg_temp.create_auth_user(
  '40000000-0000-4000-8000-000000000001',
  'workspace-a@example.test',
  '30000000-0000-4000-8000-000000000001'
);
select pg_temp.create_auth_user(
  '40000000-0000-4000-8000-000000000002',
  'workspace-b@example.test',
  '30000000-0000-4000-8000-000000000002'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.finalize_admitted_user();
reset role;

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select public.finalize_admitted_user();
reset role;

select set_config(
  'test.workspace_a',
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = '40000000-0000-4000-8000-000000000001'
  ),
  true
);
select set_config(
  'test.workspace_b',
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = '40000000-0000-4000-8000-000000000002'
  ),
  true
);
select set_config(
  'test.collection_b',
  (
    select default_collection_id::text
    from public.profiles
    where user_id = '40000000-0000-4000-8000-000000000002'
  ),
  true
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.profiles),
  1,
  'user A can read exactly their own profile'
);

select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '40000000-0000-4000-8000-000000000002'
  ),
  0,
  'user A cannot read user B profile'
);

select is(
  (select count(*)::integer from public.workspaces),
  1,
  'user A initially sees exactly their own workspace'
);

select is(
  (
    select count(*)::integer
    from public.workspaces
    where id = current_setting('test.workspace_b')::uuid
  ),
  0,
  'user A cannot read user B workspace'
);

select is(
  (select count(*)::integer from public.collections),
  1,
  'user A initially sees exactly their own collection'
);

select is(
  (
    select count(*)::integer
    from public.collections
    where id = current_setting('test.collection_b')::uuid
  ),
  0,
  'user A cannot read user B collection'
);

select is(
  (select count(*)::integer from public.games),
  1,
  'an admitted user can read the active MTG game'
);

select is(
  (select count(*)::integer from public.workspace_memberships),
  1,
  'membership listing is constrained to visible workspaces'
);

select is(
  public.current_user_context() ->> 'user_id',
  '40000000-0000-4000-8000-000000000001',
  'application context is rooted in the current admitted user'
);

select is(
  public.current_user_context() ->> 'is_platform_admin',
  'false',
  'ordinary owners are not implicitly platform administrators'
);

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'anonymous users have no profile table privilege'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.workspaces (
      type,
      name,
      slug,
      created_by_user_id
    )
    values (
      'personal',
      'Unauthorized',
      'unauthorized',
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'permission denied for table workspaces',
  'ordinary users have no direct workspace creation grant'
);

select throws_ok(
  $$
    update public.profiles
    set status = 'suspended'
    where user_id = '40000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table profiles',
  'ordinary users cannot mutate admission status'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.user_preferences',
    'catalog_view',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.user_preferences',
    'user_id',
    'INSERT'
  ),
  'authenticated users retain the intended preference write grants'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.user_preferences',
    'created_at',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.user_preferences',
    'updated_at',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.user_preferences',
    'created_at',
    'INSERT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.user_preferences',
    'updated_at',
    'INSERT'
  ),
  'authenticated users cannot write preference audit timestamps'
);

select lives_ok(
  $$
    update public.profiles
    set display_name = 'Collector A'
    where user_id = '40000000-0000-4000-8000-000000000001'
  $$,
  'an admitted user may update an allowed profile presentation column'
);

select is(
  (
    select display_name
    from public.profiles
    where user_id = '40000000-0000-4000-8000-000000000001'
  ),
  'Collector A',
  'the allowed self-profile update is persisted'
);

select throws_ok(
  $$
    update public.profiles
    set default_workspace_id = current_setting('test.workspace_b')::uuid
    where user_id = '40000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'talence_default_workspace_inaccessible',
  'a user cannot select another tenant as their default workspace'
);

select isnt(
  (
    select default_workspace_id
    from public.profiles
    where user_id = '40000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.workspace_b')::uuid,
  'a rejected cross-workspace default does not change the profile'
);

reset role;

update public.workspaces
set
  status = 'archived',
  archived_at = statement_timestamp()
where id = current_setting('test.workspace_a')::uuid;

select throws_ok(
  $$
    update public.profiles
    set default_workspace_id = current_setting('test.workspace_a')::uuid
    where user_id = '40000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'talence_default_workspace_inaccessible',
  'an archived workspace cannot remain a selected default'
);

update public.workspaces
set
  status = 'active',
  archived_at = null
where id = current_setting('test.workspace_a')::uuid;

select throws_ok(
  $$
    update public.collections
    set
      status = 'archived',
      archived_at = statement_timestamp()
    where workspace_id = current_setting('test.workspace_a')::uuid
  $$,
  '55000',
  'talence_collection_is_profile_default',
  'Phase 3 prevents a selected default collection from being archived'
);

create function pg_temp.try_ownerless_active_workspace()
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  insert into public.workspaces (
    type,
    name,
    slug,
    status,
    created_by_user_id
  )
  values (
    'team',
    'Ownerless active workspace',
    'ownerless-active-workspace',
    'active',
    '40000000-0000-4000-8000-000000000001'
  );

  set constraints public.workspaces_require_active_owner immediate;
end;
$$;

select throws_ok(
  $$select pg_temp.try_ownerless_active_workspace()$$,
  '23514',
  'talence_active_workspace_owner_required',
  'an active workspace cannot commit without an active owner'
);

set constraints all deferred;

insert into public.workspaces (
  id,
  type,
  name,
  slug,
  status,
  created_by_user_id,
  archived_at
)
values (
  '45000000-0000-4000-8000-000000000001',
  'team',
  'Archived ownerless workspace',
  'archived-ownerless-workspace',
  'archived',
  '40000000-0000-4000-8000-000000000001',
  statement_timestamp()
);

create function pg_temp.try_reactivate_ownerless_workspace()
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  update public.workspaces
  set
    status = 'active',
    archived_at = null
  where id = '45000000-0000-4000-8000-000000000001';

  set constraints public.workspaces_require_active_owner immediate;
end;
$$;

select throws_ok(
  $$select pg_temp.try_reactivate_ownerless_workspace()$$,
  '23514',
  'talence_active_workspace_owner_required',
  'an archived ownerless workspace cannot be reactivated'
);

set constraints all deferred;

select public.admin_bootstrap_platform_admin(
  '40000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.platform_user_roles),
  1,
  'a platform administrator can read their own role row'
);

select is(
  public.current_user_context() ->> 'is_platform_admin',
  'true',
  'application context carries the database-backed platform-admin flag'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.platform_user_roles),
  0,
  'an ordinary user cannot read another user platform role'
);

reset role;

insert into public.workspace_invitations (
  workspace_id,
  email,
  role,
  status,
  invited_by_user_id,
  expires_at
)
values (
  current_setting('test.workspace_a')::uuid,
  'future-member@example.test',
  'viewer',
  'draft',
  '40000000-0000-4000-8000-000000000001',
  statement_timestamp() + interval '1 day'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.workspace_invitations),
  1,
  'an owner can read workspace invitations in their workspace'
);

reset role;

insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  status,
  created_by_user_id
)
values (
  current_setting('test.workspace_a')::uuid,
  '40000000-0000-4000-8000-000000000002',
  'viewer',
  'active',
  '40000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.workspaces
    where id = current_setting('test.workspace_a')::uuid
  ),
  1,
  'an active viewer may read a granted workspace'
);

select is(
  (
    select count(*)::integer
    from public.workspace_invitations
    where workspace_id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'a viewer cannot read workspace invitation administration data'
);

select is(
  app_api.has_workspace_role(
    current_setting('test.workspace_a')::uuid,
    'viewer'
  ),
  true,
  'the indexed helper recognizes viewer capability'
);

select is(
  app_api.has_workspace_role(
    current_setting('test.workspace_a')::uuid,
    'editor'
  ),
  false,
  'the role helper does not elevate a viewer'
);

reset role;

update public.workspace_memberships
set status = 'suspended'
where workspace_id = current_setting('test.workspace_a')::uuid
  and user_id = '40000000-0000-4000-8000-000000000002';

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.workspaces
    where id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'a suspended membership has no workspace access'
);

reset role;

select throws_ok(
  format(
    'delete from public.workspace_memberships where workspace_id = %L::uuid and user_id = %L::uuid',
    current_setting('test.workspace_a'),
    '40000000-0000-4000-8000-000000000001'
  ),
  '23514',
  'talence_final_workspace_owner_required',
  'the final active owner cannot be removed'
);

select throws_ok(
  format(
    'update public.workspace_memberships set status = %L where workspace_id = %L::uuid and user_id = %L::uuid',
    'suspended',
    current_setting('test.workspace_a'),
    '40000000-0000-4000-8000-000000000001'
  ),
  '23514',
  'talence_final_workspace_owner_required',
  'the final active owner cannot be suspended'
);

update public.workspace_memberships
set
  role = 'owner',
  status = 'active'
where workspace_id = current_setting('test.workspace_a')::uuid
  and user_id = '40000000-0000-4000-8000-000000000002';

select lives_ok(
  format(
    'delete from public.workspace_memberships where workspace_id = %L::uuid and user_id = %L::uuid',
    current_setting('test.workspace_a'),
    '40000000-0000-4000-8000-000000000001'
  ),
  'an owner may leave after another active owner exists'
);

select is(
  (
    select count(*)::integer
    from public.workspace_memberships
    where workspace_id = current_setting('test.workspace_a')::uuid
      and role = 'owner'
      and status = 'active'
  ),
  1,
  'the workspace retains exactly one active owner after transfer'
);

update public.profiles
set status = 'suspended'
where user_id = '40000000-0000-4000-8000-000000000002';

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.workspaces),
  0,
  'an inactive profile loses access even while memberships remain active'
);

select is(
  public.current_user_context(),
  null::jsonb,
  'an inactive profile receives no workspace context'
);

reset role;

select * from finish();

rollback;
