begin;

select no_plan();

create function pg_temp.create_admitted_user(
  p_invite_id uuid,
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  insert into app_private.invited_users (id, email, expires_at)
  values (
    p_invite_id,
    p_email,
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
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'authenticated',
    'authenticated',
    p_email,
    '',
    statement_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('invited_user_id', p_invite_id::text),
    statement_timestamp(),
    statement_timestamp()
  );

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  execute 'set local role authenticated';
  perform public.finalize_admitted_user();
  execute 'reset role';
end;
$$;

select pg_temp.create_admitted_user(
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000011',
  'phase5-device-owner@example.test'
);
select pg_temp.create_admitted_user(
  '51000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000012',
  'phase5-device-viewer@example.test'
);

select set_config(
  'test.owner_id',
  '51000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.viewer_id',
  '51000000-0000-4000-8000-000000000012',
  true
);
select set_config(
  'test.workspace_a',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.owner_id')::uuid
  ),
  true
);
select set_config(
  'test.workspace_b',
  (
    select profile.default_workspace_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.viewer_id')::uuid
  ),
  true
);
select set_config(
  'test.collection_a',
  (
    select profile.default_collection_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.owner_id')::uuid
  ),
  true
);
select set_config(
  'test.collection_b',
  (
    select profile.default_collection_id::text
    from public.profiles as profile
    where profile.user_id = current_setting('test.viewer_id')::uuid
  ),
  true
);

insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  status,
  created_by_user_id
)
values (
  current_setting('test.workspace_a')::uuid,
  current_setting('test.viewer_id')::uuid,
  'viewer',
  'active',
  current_setting('test.owner_id')::uuid
);

set local role service_role;

select set_config(
  'test.registration',
  public.device_register(
    current_setting('test.owner_id')::uuid,
    current_setting('test.workspace_a')::uuid,
    'Sorting Station One',
    'talence_sorter',
    'Talence',
    'T1',
    'SERIAL-510-A',
    'dev510prefixa',
    repeat('a', 64),
    statement_timestamp() + interval '30 days'
  )::text,
  true
);

select throws_ok(
  format(
    $statement$
      select public.device_register(
        %L::uuid,
        %L::uuid,
        'Viewer Device',
        'scanner',
        null,
        null,
        null,
        'dev510prefixb',
        repeat('b', 64),
        null
      )
    $statement$,
    current_setting('test.viewer_id'),
    current_setting('test.workspace_a')
  ),
  '42501',
  'talence_device_admin_denied',
  'service registration independently rejects a non-admin actor'
);

select throws_ok(
  format(
    $statement$
      select public.device_register(
        %L::uuid,
        %L::uuid,
        'Invalid Type',
        null,
        null,
        null,
        null,
        'dev510prefixc',
        repeat('c', 64),
        null
      )
    $statement$,
    current_setting('test.owner_id'),
    current_setting('test.workspace_a')
  ),
  '22023',
  'talence_device_input_invalid',
  'registration rejects a null device type with a stable error'
);

reset role;

select set_config(
  'test.device_id',
  current_setting('test.registration')::jsonb #>> '{device,device_id}',
  true
);
select set_config(
  'test.credential_a',
  current_setting('test.registration')::jsonb
    #>> '{credential,credential_id}',
  true
);

select ok(
  not (current_setting('test.registration')::jsonb ? 'secret')
    and not (
      current_setting('test.registration')::jsonb
        -> 'credential' ? 'secret_digest'
    ),
  'registration response contains neither a raw secret nor its digest'
);
select is(
  (
    select credential.secret_digest
    from app_private.device_credentials as credential
    where credential.id = current_setting('test.credential_a')::uuid
  ),
  repeat('a', 64),
  'only the supplied digest is retained in the private credential table'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'app_private'
      and table_name = 'device_credentials'
      and column_name in (
        'secret',
        'raw_secret',
        'credential',
        'credential_value'
      )
  ),
  0,
  'the private credential table has no raw-secret column'
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.viewer_id'),
  true
);
set local role authenticated;

select is(
  public.device_list(
    current_setting('test.workspace_a')::uuid
  ) #>> '{permissions,can_manage}',
  'false',
  'a workspace viewer can list devices without management permission'
);
select throws_ok(
  format(
    'select public.device_list(%L::uuid, null, null, null)',
    current_setting('test.workspace_a')
  ),
  '22023',
  'talence_device_page_invalid',
  'a null device-list limit cannot bypass the bounded read'
);
select is(
  jsonb_array_length(
    public.device_detail(
      current_setting('test.device_id')::uuid
    ) -> 'credentials'
  ),
  0,
  'a workspace viewer cannot see credential metadata'
);
select throws_ok(
  format(
    $statement$
      select public.device_update(
        %L::uuid,
        'Viewer Rename',
        'scanner',
        null,
        null,
        null,
        (
          select updated_at
          from public.devices
          where id = %L::uuid
        )
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.device_id')
  ),
  '42501',
  'talence_device_admin_denied',
  'a viewer cannot mutate device administration'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  current_setting('test.owner_id'),
  true
);
set local role authenticated;

select is(
  jsonb_array_length(
    public.device_detail(
      current_setting('test.device_id')::uuid
    ) -> 'credentials'
  ),
  1,
  'an owner sees credential metadata'
);
select ok(
  not (
    public.device_detail(
      current_setting('test.device_id')::uuid
    ) -> 'credentials' -> 0 ? 'secret_digest'
  ),
  'owner-visible credential metadata still excludes the digest'
);

select throws_ok(
  format(
    $statement$
      select public.device_grants_replace(
        %L::uuid,
        '[{
          "collection_id":"%s",
          "permissions":["inventory_read"]
        }]'::jsonb
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.collection_b')
  ),
  '23514',
  'talence_device_grant_collection_invalid',
  'cross-workspace collection grants are rejected atomically'
);

select set_config(
  'test.grants',
  public.device_grants_replace(
    current_setting('test.device_id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'collection_id',
        current_setting('test.collection_a')::uuid,
        'permissions',
        jsonb_build_array(
          'inventory_read',
          'inventory_write',
          'run_summary_write'
        )
      )
    )
  )::text,
  true
);
select is(
  jsonb_array_length(
    current_setting('test.grants')::jsonb
      #> '{grants,0,permissions}'
  ),
  3,
  'grant replacement stores the complete explicit permission set'
);

select throws_ok(
  format(
    $statement$
      select public.device_grants_replace(
        %L::uuid,
        '[{
          "collection_id":"%s",
          "permissions":["inventory_read","inventory_read"]
        }]'::jsonb
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.collection_a')
  ),
  '22023',
  'talence_device_grants_duplicate',
  'duplicate device grants are rejected'
);

select set_config(
  'test.updated_device',
  public.device_update(
    current_setting('test.device_id')::uuid,
    'Sorting Station Renamed',
    'scanner',
    'Talence',
    'T2',
    'SERIAL-510-A',
    (
      public.device_detail(
        current_setting('test.device_id')::uuid
      ) #>> '{device,updated_at}'
    )::timestamptz
  )::text,
  true
);
select is(
  current_setting('test.updated_device')::jsonb #>> '{device,name}',
  'Sorting Station Renamed',
  'device metadata updates through the managed RPC'
);

select throws_ok(
  format(
    $statement$
      select public.device_set_status(
        %L::uuid,
        null,
        %L::timestamptz
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.updated_device')::jsonb
      #>> '{device,updated_at}'
  ),
  '22023',
  'talence_device_status_invalid',
  'status mutation rejects null with a stable error'
);

select set_config(
  'test.suspended_device',
  public.device_set_status(
    current_setting('test.device_id')::uuid,
    'suspended',
    (
      current_setting('test.updated_device')::jsonb
        #>> '{device,updated_at}'
    )::timestamptz
  )::text,
  true
);
select ok(
  current_setting('test.suspended_device')::jsonb
      #>> '{device,status}' = 'suspended'
    and current_setting('test.suspended_device')::jsonb
      #>> '{device,suspended_at}' is not null,
  'suspension sets status and timestamp together'
);

select set_config(
  'test.active_device',
  public.device_set_status(
    current_setting('test.device_id')::uuid,
    'active',
    (
      current_setting('test.suspended_device')::jsonb
        #>> '{device,updated_at}'
    )::timestamptz
  )::text,
  true
);
select ok(
  current_setting('test.active_device')::jsonb
      #>> '{device,status}' = 'active'
    and current_setting('test.active_device')::jsonb
      #> '{device,suspended_at}' = 'null'::jsonb,
  'reactivation clears the suspension timestamp'
);

reset role;
set local role service_role;

select set_config(
  'test.rotation',
  public.device_rotate_credential(
    current_setting('test.owner_id')::uuid,
    current_setting('test.device_id')::uuid,
    'dev510prefixd',
    repeat('d', 64),
    null
  )::text,
  true
);

reset role;
select set_config(
  'test.credential_b',
  current_setting('test.rotation')::jsonb
    #>> '{credential,credential_id}',
  true
);
select ok(
  (
    select credential.revoked_at is not null
    from app_private.device_credentials as credential
    where credential.id = current_setting('test.credential_a')::uuid
  )
    and (
      select credential.revoked_at is null
      from app_private.device_credentials as credential
      where credential.id = current_setting('test.credential_b')::uuid
    ),
  'credential rotation revokes every prior active credential'
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.owner_id'),
  true
);
set local role authenticated;

select set_config(
  'test.revoked_device',
  public.device_revoke(
    current_setting('test.device_id')::uuid,
    (
      public.device_detail(
        current_setting('test.device_id')::uuid
      ) #>> '{device,updated_at}'
    )::timestamptz
  )::text,
  true
);
select is(
  current_setting('test.revoked_device')::jsonb #>> '{device,status}',
  'revoked',
  'device revocation is terminal'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.device_collection_grants as grant_row
    where grant_row.device_id = current_setting('test.device_id')::uuid
  ),
  0,
  'device revocation removes every collection grant'
);
select is(
  (
    select count(*)::integer
    from app_private.device_credentials as credential
    where credential.device_id = current_setting('test.device_id')::uuid
      and credential.revoked_at is null
  ),
  0,
  'device revocation revokes every credential'
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('test.owner_id'),
  true
);
set local role authenticated;

select throws_ok(
  format(
    $statement$
      select public.device_set_status(
        %L::uuid,
        'active',
        %L::timestamptz
      )
    $statement$,
    current_setting('test.device_id'),
    current_setting('test.revoked_device')::jsonb
      #>> '{device,updated_at}'
  ),
  '55000',
  'talence_device_revoked',
  'a revoked device cannot be reactivated'
);

select set_config(
  'test.deleted_device',
  public.device_delete(
    current_setting('test.device_id')::uuid,
    (
      current_setting('test.revoked_device')::jsonb
        #>> '{device,updated_at}'
    )::timestamptz
  )::text,
  true
);
select ok(
  current_setting('test.deleted_device')::jsonb
    #>> '{device,deleted_at}' is not null,
  'soft deletion succeeds only after revocation'
);
select is(
  jsonb_array_length(
    public.device_list(
      current_setting('test.workspace_a')::uuid
    ) -> 'items'
  ),
  0,
  'soft-deleted devices are omitted from normal lists'
);

reset role;

select * from finish();

rollback;
