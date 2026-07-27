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
    '00000000-0000-0000-0000-000000000000',
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
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000011',
  'phase4-lifecycle@example.test'
);
select set_config(
  'test.user',
  '41000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'test.workspace',
  (
    select default_workspace_id::text
    from public.profiles
    where user_id = current_setting('test.user')::uuid
  ),
  true
);
select set_config(
  'test.collection',
  (
    select default_collection_id::text
    from public.profiles
    where user_id = current_setting('test.user')::uuid
  ),
  true
);

insert into public.catalog_sets (
  id,
  game_id,
  source_provider,
  source_id,
  code,
  name,
  digital
)
values (
  '41000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000001',
  'fixture',
  'phase4-lifecycle-set',
  'p4l',
  'Phase 4 Lifecycle',
  false
);
insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  type_line
)
values
  (
    '41000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-card-one',
    'Revision Adept',
    'revision adept',
    'Creature — Wizard'
  ),
  (
    '41000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000001',
    'fixture',
    'phase4-card-two',
    'Foreign Preference',
    'foreign preference',
    'Creature — Rogue'
  );
insert into public.catalog_printings (
  id,
  game_id,
  card_id,
  set_id,
  source_provider,
  source_id,
  collector_number,
  language,
  printed_name,
  digital,
  finishes,
  is_default_browse
)
values
  (
    '41000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000021',
    '41000000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-print-one',
    '1',
    'en',
    'Revision Adept',
    false,
    array['nonfoil'::public.card_finish],
    true
  ),
  (
    '41000000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000022',
    '41000000-0000-4000-8000-000000000020',
    'fixture',
    'phase4-print-two',
    '2',
    'en',
    'Foreign Preference',
    false,
    array['foil'::public.card_finish],
    true
  );

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;

select set_config(
  'test.create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Revision Deck',
    'modern',
    'Lifecycle fixture',
    'Plain text notes',
    array['test', 'modern'],
    array[current_setting('test.collection')::uuid]
  )::text,
  true
);
select set_config(
  'test.deck',
  current_setting('test.create')::jsonb #>> '{deck,deck_id}',
  true
);
select is(
  (
    current_setting('test.create')::jsonb
      #>> '{deck,current_revision}'
  )::integer,
  1,
  'create records revision one'
);
select is(
  (
    select count(*)::integer
    from public.deck_revisions
    where deck_id = current_setting('test.deck')::uuid
  ),
  1,
  'create persists one immutable revision'
);
select is(
  current_setting('test.create')::jsonb #>> '{deck,format_version_id}',
  '40000000-0000-4000-8000-000000000003',
  'new deck pins the latest Modern rule row'
);

select set_config(
  'test.add',
  public.deck_entry_add(
    current_setting('test.deck')::uuid,
    '41000000-0000-4000-8000-000000000021',
    'mainboard',
    4,
    1,
    '41000000-0000-4000-8000-000000000031',
    'nonfoil',
    'Primary entry'
  )::text,
  true
);
select set_config(
  'test.entry',
  current_setting('test.add')::jsonb #>> '{entry,entry_id}',
  true
);
select is(
  (
    current_setting('test.add')::jsonb
      #>> '{deck,current_revision}'
  )::integer,
  2,
  'entry add increments deck revision'
);

select throws_ok(
  format(
    $statement$
      select public.deck_entry_add(
        %L::uuid,
        '41000000-0000-4000-8000-000000000022',
        'sideboard',
        1,
        1
      )
    $statement$,
    current_setting('test.deck')
  ),
  '40001',
  'talence_deck_stale',
  'stale post-create mutations fail deterministically'
);

select throws_ok(
  format(
    $statement$
      select public.deck_entry_update(
        %L::uuid,
        4,
        'mainboard',
        '41000000-0000-4000-8000-000000000032',
        'foil',
        null,
        2
      )
    $statement$,
    current_setting('test.entry')
  ),
  '23514',
  'talence_deck_preferred_printing_mismatch',
  'preferred printing must match the oracle entry'
);

select throws_ok(
  format(
    $statement$
      select public.deck_entry_update(
        %L::uuid,
        4,
        'mainboard',
        '41000000-0000-4000-8000-000000000031',
        'foil',
        null,
        2
      )
    $statement$,
    current_setting('test.entry')
  ),
  '23514',
  'talence_deck_preferred_printing_mismatch',
  'preferred finish must be supported by the printing'
);

select set_config(
  'test.hash_before_replace',
  (
    select content_hash
    from public.deck_revisions
    where deck_id = current_setting('test.deck')::uuid
      and revision = 2
  ),
  true
);
select set_config(
  'test.replace',
  public.deck_entries_replace(
    current_setting('test.deck')::uuid,
    '[{
      "card_id":"41000000-0000-4000-8000-000000000021",
      "zone":"mainboard",
      "quantity":4,
      "preferred_printing_id":"41000000-0000-4000-8000-000000000031",
      "preferred_finish":"nonfoil",
      "notes":"Primary entry"
    }]'::jsonb,
    2
  )::text,
  true
);
select is(
  (
    select content_hash
    from public.deck_revisions
    where deck_id = current_setting('test.deck')::uuid
      and revision = 3
  ),
  current_setting('test.hash_before_replace'),
  'equivalent replacement has the same logical content hash'
);
select isnt(
  (
    select snapshot #>> '{entries,0,entry_id}'
    from public.deck_revisions
    where deck_id = current_setting('test.deck')::uuid
      and revision = 3
  ),
  (
    select snapshot #>> '{entries,0,entry_id}'
    from public.deck_revisions
    where deck_id = current_setting('test.deck')::uuid
      and revision = 2
  ),
  'audit snapshots retain changed physical row IDs independently'
);

reset role;
update public.deck_formats set active = false where code = 'modern';
select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.update',
  public.deck_update(
    current_setting('test.deck')::uuid,
    'Renamed Pinned Deck',
    'Lifecycle fixture',
    'Plain text notes',
    array['test', 'modern'],
    'modern',
    null,
    null,
    3
  )::text,
  true
);
select is(
  current_setting('test.update')::jsonb #>> '{deck,name}',
  'Renamed Pinned Deck',
  'metadata editing keeps an existing deactivated format pin'
);
select is(
  (
    current_setting('test.update')::jsonb
      #>> '{deck,current_revision}'
  )::integer,
  4,
  'metadata update records its revision'
);

select set_config(
  'test.duplicate',
  public.deck_duplicate(
    current_setting('test.deck')::uuid,
    4,
    'Deep Copy'
  )::text,
  true
);
select set_config(
  'test.duplicate_deck',
  current_setting('test.duplicate')::jsonb #>> '{deck,deck_id}',
  true
);
select is(
  (
    select count(*)::integer
    from public.deck_entries
    where deck_id = current_setting('test.duplicate_deck')::uuid
  ),
  1,
  'duplicate deep-copies entries'
);
select is(
  (
    select count(*)::integer
    from public.deck_inventory_sources
    where deck_id = current_setting('test.duplicate_deck')::uuid
  ),
  1,
  'duplicate deep-copies inventory sources'
);
select is(
  (
    select current_revision
    from public.decks
    where id = current_setting('test.duplicate_deck')::uuid
  ),
  1,
  'duplicate starts with its own revision one'
);

select set_config(
  'test.archive',
  public.deck_archive(
    current_setting('test.deck')::uuid,
    4
  )::text,
  true
);
select is(
  current_setting('test.archive')::jsonb #>> '{deck,status}',
  'archived',
  'deck archives softly'
);
select throws_ok(
  format(
    $statement$
      select public.deck_entry_add(
        %L::uuid,
        '41000000-0000-4000-8000-000000000022',
        'sideboard',
        1,
        5
      )
    $statement$,
    current_setting('test.deck')
  ),
  '55000',
  'talence_deck_not_active',
  'archived decks reject content edits'
);
select set_config(
  'test.restore',
  public.deck_restore(
    current_setting('test.deck')::uuid,
    5
  )::text,
  true
);
select is(
  current_setting('test.restore')::jsonb #>> '{deck,status}',
  'active',
  'archived deck restores'
);

reset role;
select throws_ok(
  format(
    $statement$
      update public.deck_entries
      set card_id = '41000000-0000-4000-8000-000000000022'
      where deck_id = %L::uuid
    $statement$,
    current_setting('test.deck')
  ),
  '55000',
  'talence_deck_entry_card_immutable',
  'entry oracle identity cannot drift around cover invariants'
);
select throws_ok(
  format(
    $statement$
      update public.deck_revisions
      set reason = 'tamper'
      where deck_id = %L::uuid
        and revision = 1
    $statement$,
    current_setting('test.deck')
  ),
  '55000',
  'talence_deck_revision_immutable',
  'revision snapshots are immutable'
);

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.delete',
  public.deck_delete(
    current_setting('test.duplicate_deck')::uuid,
    1
  )::text,
  true
);
select is(
  current_setting('test.delete')::jsonb #>> '{deck,status}',
  'deleted',
  'owner soft-deletes a deck'
);
select throws_ok(
  format(
    'select public.deck_restore(%L::uuid, 2)',
    current_setting('test.duplicate_deck')
  ),
  'P0002',
  'talence_deck_not_found',
  'deleted deck lifecycle is terminal'
);
reset role;

select throws_ok(
  format(
    'delete from public.decks where id = %L::uuid',
    current_setting('test.deck')
  ),
  '55000',
  'talence_deck_hard_delete_forbidden',
  'hard deck deletion is prohibited'
);
select ok(
  position(
    'talence_deck_stale'
    in lower(
      pg_get_functiondef(
        'app_private.lock_deck_for_mutation(uuid,integer,boolean)'
          ::regprocedure
      )
    )
  ) < position(
    'for update'
    in lower(
      pg_get_functiondef(
        'app_private.lock_deck_for_mutation(uuid,integer,boolean)'
          ::regprocedure
      )
    )
  )
  and position(
    'for update'
    in lower(
      pg_get_functiondef(
        'app_private.lock_deck_for_mutation(uuid,integer,boolean)'
          ::regprocedure
      )
    )
  ) < position(
    'not app_api.is_admitted_user'
    in lower(
      pg_get_functiondef(
        'app_private.lock_deck_for_mutation(uuid,integer,boolean)'
          ::regprocedure
      )
    )
  )
  and position(
    'talence_deck_stale'
    in lower(
      pg_get_functiondef(
        'public.deck_delete(uuid,integer)'::regprocedure
      )
    )
  ) < position(
    'for update'
    in lower(
      pg_get_functiondef(
        'public.deck_delete(uuid,integer)'::regprocedure
      )
    )
  )
  and position(
    'for update'
    in lower(
      pg_get_functiondef(
        'public.deck_delete(uuid,integer)'::regprocedure
      )
    )
  ) < position(
    'not app_api.is_admitted_user'
    in lower(
      pg_get_functiondef(
        'public.deck_delete(uuid,integer)'::regprocedure
      )
    )
  ),
  'mutations reject future revisions before waiting and revalidate authority after the deck lock'
);
select ok(
  not exists (
    select 1
    from (
      values
        (
          'public.deck_entry_update(uuid,integer,public.deck_zone,uuid,public.card_finish,text,integer)'
        ),
        ('public.deck_entry_remove(uuid,integer)')
    ) as expected(signature)
    where to_regprocedure(expected.signature) is null
      or lower(
        pg_get_functiondef(to_regprocedure(expected.signature))
      ) not like '%v_locked_deck_id%'
      or lower(
        pg_get_functiondef(to_regprocedure(expected.signature))
      ) not like '%is distinct from v_locked_deck_id%'
      or lower(
        pg_get_functiondef(to_regprocedure(expected.signature))
      ) not like '%talence_deck_stale%'
  ),
  'entry update and remove reject identity loss after acquiring the deck lock'
);
select ok(
  pg_get_functiondef(
    'public.deck_create(uuid,text,text,text,text,text[],uuid[])'
      ::regprocedure
  ) like '%order by source.collection_id%',
  'deck create pre-acquires source lifecycle locks in canonical UUID order'
);
select ok(
  pg_get_functiondef(
    'public.deck_sources_replace(uuid,uuid[],integer)'::regprocedure
  ) like '%order by source.collection_id%',
  'source replacement pre-acquires lifecycle locks in canonical UUID order'
);
select ok(
  pg_get_functiondef(
    'public.deck_duplicate(uuid,integer,text)'::regprocedure
  ) like '%order by source.collection_id%',
  'deep duplicate pre-acquires source lifecycle locks in canonical UUID order'
);
select ok(
  lower(
    pg_get_functiondef(
      'app_private.lock_deck_catalog_generation()'::regprocedure
    )
  ) like '%for share%',
  'catalog generation helper holds the promotion-conflicting share lock'
);
select ok(
  lower(
    pg_get_functiondef(
      'app_private.record_deck_revision(uuid,text)'::regprocedure
    )
  ) like '%lock_deck_catalog_generation%',
  'revision recording independently backstops the catalog generation lock'
);
select ok(
  not exists (
    select 1
    from (
      values
        ('public.deck_create(uuid,text,text,text,text,text[],uuid[])'),
        ('public.deck_update(uuid,text,text,text,text[],text,uuid,uuid,integer)'),
        ('public.deck_duplicate(uuid,integer,text)'),
        ('public.deck_archive(uuid,integer)'),
        ('public.deck_restore(uuid,integer)'),
        ('public.deck_delete(uuid,integer)'),
        ('public.deck_sources_replace(uuid,uuid[],integer)'),
        (
          'public.deck_entry_add(uuid,uuid,public.deck_zone,integer,integer,uuid,public.card_finish,text)'
        ),
        (
          'public.deck_entry_update(uuid,integer,public.deck_zone,uuid,public.card_finish,text,integer)'
        ),
        ('public.deck_entry_remove(uuid,integer)'),
        ('public.deck_entries_replace(uuid,jsonb,integer)')
    ) as expected(signature)
    where to_regprocedure(expected.signature) is null
      or lower(
        pg_get_functiondef(
          to_regprocedure(expected.signature)
        )
      ) not like '%lock_deck_for_mutation%'
      and lower(
        pg_get_functiondef(
          to_regprocedure(expected.signature)
        )
      ) not like '%lock_deck_catalog_generation%'
  ),
  'every public deck mutation acquires the catalog generation lock'
);

select * from finish();
rollback;
