begin;

select plan(28);

create function pg_temp.create_auth_user(
  p_user_id uuid,
  p_email text,
  p_invited_user_id uuid default null,
  p_email_confirmed boolean default true
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
    case when p_email_confirmed then statement_timestamp() else null end,
    '{"provider":"email","providers":["email"]}'::jsonb,
    case
      when p_invited_user_id is null then '{}'::jsonb
      else jsonb_build_object(
        'invited_user_id',
        p_invited_user_id::text
      )
    end,
    statement_timestamp(),
    statement_timestamp()
  )
$$;

insert into app_private.invited_users (
  id,
  email,
  status,
  expires_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  'valid-finalize@example.test',
  'draft',
  statement_timestamp() + interval '1 day'
);

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000001',
  'valid-finalize@example.test',
  '10000000-0000-4000-8000-000000000001',
  true
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"valid-finalize@example.test"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.finalize_admitted_user()$$,
  'a confirmed Auth user with matching invitation metadata finalizes'
);

reset role;

select is(
  (
    select status::text
    from app_private.invited_users
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'accepted',
  'finalization marks the invitation accepted'
);

select is(
  (
    select auth_user_id
    from app_private.invited_users
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'finalization links the canonical Auth user'
);

select ok(
  (
    select accepted_at is not null
    from app_private.invited_users
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'finalization records an acceptance instant'
);

select is(
  (
    select status::text
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000001'
  ),
  'active',
  'finalization creates an active profile'
);

select ok(
  (
    select
      default_workspace_id is not null
      and default_collection_id is not null
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000001'
  ),
  'the profile receives canonical default resource IDs'
);

select is(
  (
    select count(*)::integer
    from public.workspaces
    where created_by_user_id = '20000000-0000-4000-8000-000000000001'
      and type = 'personal'
  ),
  1,
  'finalization provisions exactly one personal workspace'
);

select is(
  (
    select role::text
    from public.workspace_memberships
    where user_id = '20000000-0000-4000-8000-000000000001'
  ),
  'owner',
  'the admitted user owns the personal workspace'
);

select is(
  (
    select count(*)::integer
    from public.collections as c
    join public.games as g on g.id = c.game_id
    where c.created_by_user_id =
      '20000000-0000-4000-8000-000000000001'
      and c.slug = 'main-collection'
      and g.code = 'mtg'
  ),
  1,
  'finalization provisions one default MTG collection'
);

select is(
  (
    select count(*)::integer
    from public.user_preferences
    where user_id = '20000000-0000-4000-8000-000000000001'
  ),
  1,
  'finalization provisions one preference row'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  public.finalize_admitted_user() ->> 'replayed',
  'true',
  'a repeated finalization reports an idempotent replay'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.workspaces
    where created_by_user_id = '20000000-0000-4000-8000-000000000001'
      and type = 'personal'
  ),
  1,
  'replay does not duplicate the personal workspace'
);

select is(
  (
    select count(*)::integer
    from public.collections
    where created_by_user_id = '20000000-0000-4000-8000-000000000001'
      and slug = 'main-collection'
  ),
  1,
  'replay does not duplicate the default collection'
);

select is(
  (
    select public.finalize_admitted_user() ->> 'workspace_id'
    from (select set_config(
      'request.jwt.claim.sub',
      '20000000-0000-4000-8000-000000000001',
      true
    )) as configured
  ),
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000001'
  ),
  'replay returns the canonical existing workspace ID'
);

insert into app_private.invited_users (
  id,
  email,
  expires_at
)
values (
  '10000000-0000-4000-8000-000000000002',
  'unverified@example.test',
  statement_timestamp() + interval '1 day'
);

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000002',
  'unverified@example.test',
  '10000000-0000-4000-8000-000000000002',
  false
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.finalize_admitted_user()$$,
  '28000',
  'talence_auth_email_unverified',
  'an unverified Auth email cannot finalize admission'
);

reset role;

select is(
  (
    select status::text
    from app_private.invited_users
    where id = '10000000-0000-4000-8000-000000000002'
  ),
  'draft',
  'failed unverified finalization leaves the invitation unchanged'
);

insert into app_private.invited_users (id, email, expires_at)
values
  (
    '10000000-0000-4000-8000-000000000003',
    'metadata-a@example.test',
    statement_timestamp() + interval '1 day'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'metadata-b@example.test',
    statement_timestamp() + interval '1 day'
  );

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000003',
  'metadata-a@example.test',
  '10000000-0000-4000-8000-000000000004',
  true
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.finalize_admitted_user()$$,
  '28000',
  'talence_invitation_email_mismatch',
  'server-controlled invitation metadata must match the Auth email'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000003'
  ),
  0,
  'metadata mismatch provisions no application profile'
);

insert into app_private.invited_users (id, email, expires_at)
values (
  '10000000-0000-4000-8000-000000000005',
  'expired-finalize@example.test',
  statement_timestamp() - interval '1 minute'
);

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000005',
  'expired-finalize@example.test',
  '10000000-0000-4000-8000-000000000005',
  true
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000005',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.finalize_admitted_user()$$,
  '28000',
  'talence_invitation_expired',
  'an expired invitation cannot finalize'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000005'
  ),
  0,
  'expired finalization provisions no profile'
);

insert into app_private.invited_users (
  id,
  email,
  status,
  expires_at,
  revoked_at
)
values (
  '10000000-0000-4000-8000-000000000006',
  'revoked-finalize@example.test',
  'revoked',
  statement_timestamp() + interval '1 day',
  statement_timestamp()
);

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000006',
  'revoked-finalize@example.test',
  '10000000-0000-4000-8000-000000000006',
  true
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000006',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.finalize_admitted_user()$$,
  '28000',
  'talence_invitation_revoked',
  'a revoked invitation cannot finalize'
);

reset role;

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000007',
  'missing-metadata@example.test',
  null,
  true
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000007',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.finalize_admitted_user()$$,
  '28000',
  'talence_invitation_metadata_required',
  'an Auth user without invitation metadata cannot finalize'
);

reset role;

insert into app_private.invited_users (id, email, expires_at)
values (
  '10000000-0000-4000-8000-000000000008',
  'reactivate-on-accept@example.test',
  statement_timestamp() + interval '1 day'
);

select pg_temp.create_auth_user(
  '20000000-0000-4000-8000-000000000008',
  'reactivate-on-accept@example.test',
  '10000000-0000-4000-8000-000000000008',
  true
);

insert into public.profiles (
  user_id,
  admission_invite_id,
  status
)
values (
  '20000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000008',
  'suspended'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000008',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.finalize_admitted_user()$$,
  'first acceptance safely reactivates a pre-existing same-invite profile'
);

reset role;

select is(
  (
    select status::text
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000008'
  ),
  'active',
  'first acceptance leaves the admitted profile active'
);

update public.profiles
set status = 'suspended'
where user_id = '20000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  app_api.is_admitted_user(
    '20000000-0000-4000-8000-000000000001'
  ),
  false,
  'a suspended profile fails the ongoing admission helper'
);

select is(
  public.current_user_context(),
  null::jsonb,
  'a suspended profile receives no application context'
);

select throws_ok(
  $$select public.finalize_admitted_user()$$,
  '28000',
  'talence_profile_inactive',
  'replaying finalization cannot reactivate a suspended profile'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '20000000-0000-4000-8000-000000000001'
  ),
  1,
  'failed replay leaves the canonical profile unique'
);

select * from finish();

rollback;
