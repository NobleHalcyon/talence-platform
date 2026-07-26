begin;

select plan(31);

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

select set_config(
  'test.bootstrap_invite',
  public.admin_prepare_invited_user(
    null,
    '  FIRST.ADMIN@Example.Test ',
    statement_timestamp() + interval '1 day',
    'bootstrap administrator'
  ) ->> 'id',
  true
);

select is(
  public.admin_get_invited_user(
    null,
    current_setting('test.bootstrap_invite')::uuid,
    null
  ) ->> 'email',
  'first.admin@example.test',
  'the service-only bootstrap path prepares and normalizes the first invitation'
);

select throws_ok(
  $$
    select public.admin_prepare_invited_user(
      '50000000-0000-4000-8000-000000000099',
      'should-fail@example.test',
      statement_timestamp() + interval '1 day',
      null
    )
  $$,
  'P0001',
  'talence_bootstrap_actor_must_be_null',
  'the zero-admin window accepts only an explicit null actor'
);

select is(
  public.admin_prepare_invited_user(
    null,
    'first.admin@example.test',
    statement_timestamp() + interval '2 days',
    'updated bootstrap note'
  ) ->> 'id',
  current_setting('test.bootstrap_invite'),
  'preparing the same draft invitation is idempotent'
);

select pg_temp.create_auth_user(
  '50000000-0000-4000-8000-000000000001',
  'first.admin@example.test',
  current_setting('test.bootstrap_invite')::uuid
);

select is(
  public.admin_mark_invited_user_sent(
    null,
    current_setting('test.bootstrap_invite')::uuid,
    '50000000-0000-4000-8000-000000000001'
  ) ->> 'status',
  'sent',
  'the trusted transition links the Auth identity and marks the invite sent'
);

select throws_ok(
  $$
    select public.admin_prepare_invited_user(
      null,
      'first.admin@example.test',
      statement_timestamp() + interval '3 days',
      null
    )
  $$,
  '55000',
  'talence_invitation_already_sent',
  'a duplicate issue attempt cannot reuse a current sent invitation'
);

select is(
  public.admin_get_invited_user(
    null,
    current_setting('test.bootstrap_invite')::uuid,
    null
  ) ->> 'status',
  'sent',
  'a rejected duplicate issue leaves the original invitation sent'
);

select set_config(
  'request.jwt.claim.sub',
  '50000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.finalize_admitted_user()$$,
  'the first invited administrator can finalize before platform bootstrap'
);

reset role;

select is(
  public.admin_bootstrap_platform_admin(
    '50000000-0000-4000-8000-000000000001'
  ) ->> 'already_granted',
  'false',
  'the admitted first user can become the one-time bootstrap administrator'
);

select is(
  public.admin_bootstrap_platform_admin(
    '50000000-0000-4000-8000-000000000001'
  ) ->> 'already_granted',
  'true',
  'bootstrapping the same first administrator is idempotent'
);

select set_config(
  'test.invite_b',
  public.admin_prepare_invited_user(
    '50000000-0000-4000-8000-000000000001',
    'invitee@example.test',
    statement_timestamp() + interval '1 day',
    'private beta tester'
  ) ->> 'id',
  true
);

select is(
  public.admin_get_invited_user(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid,
    null
  ) ->> 'invited_by_user_id',
  '50000000-0000-4000-8000-000000000001',
  'post-bootstrap invitations retain the admitted platform-admin actor'
);

select pg_temp.create_auth_user(
  '50000000-0000-4000-8000-000000000002',
  'wrong-email@example.test',
  current_setting('test.invite_b')::uuid
);

select throws_ok(
  format(
    'select public.admin_mark_invited_user_sent(%L::uuid,%L::uuid,%L::uuid)',
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b'),
    '50000000-0000-4000-8000-000000000002'
  ),
  '22023',
  'talence_invitation_email_mismatch',
  'the sent transition rejects a mismatched Auth email'
);

select pg_temp.create_auth_user(
  '50000000-0000-4000-8000-000000000003',
  'invitee@example.test',
  current_setting('test.invite_b')::uuid
);

select is(
  public.admin_mark_invited_user_sent(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid,
    '50000000-0000-4000-8000-000000000003'
  ) ->> 'auth_user_id',
  '50000000-0000-4000-8000-000000000003',
  'the sent transition stores the matching Auth user ID'
);

select lives_ok(
  format(
    'select public.admin_mark_invited_user_sent(%L::uuid,%L::uuid,%L::uuid)',
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b'),
    '50000000-0000-4000-8000-000000000003'
  ),
  'marking the same invitation sent with the same Auth user is replay safe'
);

select is(
  public.admin_get_invited_user(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid,
    null
  ) ->> 'id',
  current_setting('test.invite_b'),
  'trusted status inspection can select an invitation by ID'
);

select is(
  public.admin_get_invited_user(
    '50000000-0000-4000-8000-000000000001',
    null,
    ' INVITEE@example.test '
  ) ->> 'id',
  current_setting('test.invite_b'),
  'trusted status inspection can select the latest invitation by normalized email'
);

select throws_ok(
  format(
    'select public.admin_get_invited_user(%L::uuid,%L::uuid,%L)',
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b'),
    'invitee@example.test'
  ),
  '22023',
  'talence_invitation_exactly_one_selector_required',
  'status inspection requires exactly one selector'
);

select ok(
  jsonb_typeof(
    public.admin_list_invited_users(
      '50000000-0000-4000-8000-000000000001',
      100,
      null
    )
  ) = 'array'
  and jsonb_array_length(
    public.admin_list_invited_users(
      '50000000-0000-4000-8000-000000000001',
      100,
      null
    )
  ) >= 2,
  'trusted invitation listing returns a bounded JSON array'
);

select is(
  public.admin_revoke_invited_user(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid
  ) ->> 'status',
  'revoked',
  'an unaccepted sent invitation can be revoked'
);

select is(
  public.admin_get_invited_user(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid,
    null
  ) ->> 'auth_user_id',
  '50000000-0000-4000-8000-000000000003',
  'revocation preserves the Auth user ID for fail-closed cleanup'
);

delete from auth.users
where id = '50000000-0000-4000-8000-000000000003';

select is(
  public.admin_get_invited_user(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid,
    null
  ) ->> 'auth_user_id',
  null,
  'deleting an unaccepted Auth identity clears the pending ledger link'
);

select set_config(
  'test.invite_b_retry',
  public.admin_prepare_invited_user(
    '50000000-0000-4000-8000-000000000001',
    'invitee@example.test',
    statement_timestamp() + interval '1 day',
    'retry after cleanup'
  ) ->> 'id',
  true
);

select isnt(
  current_setting('test.invite_b_retry'),
  current_setting('test.invite_b'),
  'a cleaned-up terminal invitation can be retried with a new audit row'
);

select pg_temp.create_auth_user(
  '50000000-0000-4000-8000-000000000004',
  'invitee@example.test',
  current_setting('test.invite_b_retry')::uuid
);

select is(
  public.admin_mark_invited_user_failed(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b_retry')::uuid,
    'auth_cleanup_required',
    '50000000-0000-4000-8000-000000000004'
  ) ->> 'last_error_code',
  'auth_cleanup_required',
  'a safe failure code and optional Auth identity are recorded together'
);

delete from auth.users
where id = '50000000-0000-4000-8000-000000000004';

select set_config(
  'test.invite_b_retry_2',
  public.admin_prepare_invited_user(
    '50000000-0000-4000-8000-000000000001',
    'invitee@example.test',
    statement_timestamp() + interval '1 day',
    'second retry after cleanup'
  ) ->> 'id',
  true
);

select isnt(
  current_setting('test.invite_b_retry_2'),
  current_setting('test.invite_b_retry'),
  'a failed row is retryable only after its pending Auth identity is cleaned up'
);

select set_config(
  'test.expiring_invite',
  public.admin_prepare_invited_user(
    '50000000-0000-4000-8000-000000000001',
    'expires@example.test',
    statement_timestamp() + interval '1 day',
    null
  ) ->> 'id',
  true
);

update app_private.invited_users
set expires_at = statement_timestamp() - interval '1 minute'
where id = current_setting('test.expiring_invite')::uuid;

select is(
  public.admin_get_invited_user(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.expiring_invite')::uuid,
    null
  ) ->> 'effective_status',
  'expired',
  'status inspection computes expiry without trusting stale draft state'
);

select throws_ok(
  $$
    select public.admin_prepare_invited_user(
      '50000000-0000-4000-8000-000000000001',
      'first.admin@example.test',
      statement_timestamp() + interval '1 day',
      null
    )
  $$,
  '23505',
  'talence_invitation_email_already_accepted',
  'an accepted email cannot be invited again'
);

select throws_ok(
  format(
    'select public.admin_revoke_invited_user(%L::uuid,%L::uuid)',
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.bootstrap_invite')
  ),
  '55000',
  'talence_accepted_invitation_not_revocable',
  'an accepted admission record cannot be revoked as a pending invite'
);

select is(
  public.admin_record_invited_user_error(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.invite_b')::uuid,
    'auth_cleanup_failed'
  ) ->> 'last_error_code',
  'auth_cleanup_failed',
  'safe cleanup failures can be recorded on an already-revoked row'
);

select throws_ok(
  format(
    'select public.admin_prepare_invited_user(%L::uuid,%L,statement_timestamp() + interval %L,null)',
    '50000000-0000-4000-8000-000000000002',
    'unauthorized@example.test',
    '1 day'
  ),
  'P0001',
  'talence_platform_admin_required',
  'an admitted-looking but non-admin actor cannot issue invitations'
);

select throws_ok(
  $$
    select public.admin_list_invited_users(
      '50000000-0000-4000-8000-000000000001',
      201,
      null
    )
  $$,
  '22023',
  'talence_invitation_list_limit_invalid',
  'trusted listing enforces the configured hard limit'
);

select throws_ok(
  $$
    select public.admin_list_invited_users(
      '50000000-0000-4000-8000-000000000001',
      null,
      null
    )
  $$,
  '22023',
  'talence_invitation_list_limit_invalid',
  'trusted listing rejects a null limit instead of returning an unbounded result'
);

select throws_ok(
  $$
    select public.admin_prepare_invited_user(
      null,
      'null-after-bootstrap@example.test',
      statement_timestamp() + interval '1 day',
      null
    )
  $$,
  'P0001',
  'talence_platform_admin_required',
  'the null-actor bootstrap window closes after the first admin exists'
);

select * from finish();

rollback;
