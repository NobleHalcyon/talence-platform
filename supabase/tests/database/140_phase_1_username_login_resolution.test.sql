begin;

select plan(9);

select has_function(
  'public',
  'server_resolve_login_email',
  array['text'],
  'the trusted username-login resolver exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.server_resolve_login_email(text)',
    'EXECUTE'
  ),
  'the service role may resolve a login handle'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.server_resolve_login_email(text)',
    'EXECUTE'
  ),
  'anonymous callers cannot resolve a login handle'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.server_resolve_login_email(text)',
    'EXECUTE'
  ),
  'ordinary authenticated callers cannot resolve another login handle'
);

insert into app_private.invited_users (
  id,
  email,
  status,
  expires_at
)
values (
  '14000000-0000-4000-8000-000000000001',
  'username-login@example.test',
  'draft',
  statement_timestamp() + interval '1 day'
);

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
  '00000000-0000-0000-0000-000000000000',
  '14000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'username-login@example.test',
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

update app_private.invited_users
set
  status = 'accepted',
  auth_user_id = '14000000-0000-4000-8000-000000000002',
  accepted_at = statement_timestamp()
where id = '14000000-0000-4000-8000-000000000001';

insert into public.profiles (
  user_id,
  admission_invite_id,
  handle,
  display_name,
  status
)
values (
  '14000000-0000-4000-8000-000000000002',
  '14000000-0000-4000-8000-000000000001',
  'Arcane_User',
  'Username Login',
  'active'
);

set local role service_role;

select is(
  public.server_resolve_login_email('arcane_user'),
  'username-login@example.test',
  'handle resolution is case insensitive'
);

select is(
  public.server_resolve_login_email('unknown_user'),
  null,
  'an unknown handle returns no email'
);

select is(
  public.server_resolve_login_email('../admin'),
  null,
  'an invalid handle returns no email'
);

reset role;

update public.profiles
set status = 'suspended'
where user_id = '14000000-0000-4000-8000-000000000002';

set local role service_role;

select is(
  public.server_resolve_login_email('arcane_user'),
  null,
  'an inactive profile cannot resolve for login'
);

reset role;

update public.profiles
set status = 'active'
where user_id = '14000000-0000-4000-8000-000000000002';

update app_private.invited_users
set
  status = 'revoked',
  revoked_at = statement_timestamp()
where id = '14000000-0000-4000-8000-000000000001';

set local role service_role;

select is(
  public.server_resolve_login_email('arcane_user'),
  null,
  'a revoked admission cannot resolve for login'
);

reset role;

select * from finish();

rollback;
