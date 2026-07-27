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
  '42600000-0000-4000-8000-000000000001',
  '42600000-0000-4000-8000-000000000011',
  'phase4-bounds@example.test'
);
select set_config(
  'test.user',
  '42600000-0000-4000-8000-000000000011',
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

insert into public.catalog_cards (
  id,
  game_id,
  source_provider,
  source_id,
  name,
  normalized_name,
  type_line
)
select
  md5('phase4-bound-card-' || series.value::text)::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  'fixture',
  'phase4-bound-card-' || series.value::text,
  'Boundary Card '
    || lpad(series.value::text, 4, '0')
    || ' '
    || repeat('Name', 100),
  app_private.normalize_catalog_search_text(
    'Boundary Card '
      || lpad(series.value::text, 4, '0')
      || ' '
      || repeat('Name', 100)
  ),
  'Creature — Construct'
from generate_series(1, 2000) as series(value);

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.create',
  public.deck_create(
    current_setting('test.workspace')::uuid,
    'Maximum Bounds',
    'modern'
  )::text,
  true
);
select set_config(
  'test.deck',
  current_setting('test.create')::jsonb #>> '{deck,deck_id}',
  true
);

select set_config('test.replace_started', clock_timestamp()::text, true);
select set_config(
  'test.replace',
  public.deck_entries_replace(
    current_setting('test.deck')::uuid,
    (
      select jsonb_agg(
        jsonb_build_object(
          'card_id',
            md5('phase4-bound-card-' || series.value::text)::uuid,
          'zone', 'mainboard',
          'quantity', 1,
          'notes', 'bounded import row'
        )
        order by series.value
      )
      from generate_series(1, 2000) as series(value)
    ),
    1
  )::text,
  true
);
select is(
  (
    current_setting('test.replace')::jsonb
      ->> 'entry_count'
  )::integer,
  2000,
  'the documented 2,000-entry replacement cap records one revision'
);
select is(
  (
    current_setting('test.replace')::jsonb
      #>> '{deck,current_revision}'
  )::integer,
  2,
  'maximum replacement advances the optimistic revision exactly once'
);
select ok(
  clock_timestamp()
    - current_setting('test.replace_started')::timestamptz
      < interval '30 seconds',
  '2,000-entry replacement and revision snapshot finish within a bounded local budget'
);

reset role;
with ranked as (
  select
    entry.id,
    row_number() over (order by card.name, entry.id) as position
  from public.deck_entries as entry
  join public.catalog_cards as card on card.id = entry.card_id
  where entry.deck_id = current_setting('test.deck')::uuid
)
update public.deck_entries as entry
set
  zone = case
    when ranked.position <= 1001
      then 'mainboard'::public.deck_zone
    else 'sideboard'::public.deck_zone
  end,
  sort_order = case
    when ranked.position <= 1001 then 1000000
    else 0
  end
from ranked
where ranked.id = entry.id;
select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config(
  'test.export',
  public.deck_export(current_setting('test.deck')::uuid)::text,
  true
);
select ok(
  (
    string_to_array(
      current_setting('test.export')::jsonb ->> 'plain_text',
      E'\n'
    )
  )[1001] not like '%[sideboard]%',
  'export keeps every mainboard row before sideboard despite high sort values'
);
select ok(
  (
    string_to_array(
      current_setting('test.export')::jsonb ->> 'plain_text',
      E'\n'
    )
  )[1002] like '%[sideboard]',
  'export crosses the zone boundary deterministically after more than one thousand tied rows'
);
reset role;
update public.deck_entries
set
  zone = 'mainboard'::public.deck_zone,
  sort_order = 0
where deck_id = current_setting('test.deck')::uuid;
update public.deck_entries
set notes = repeat('x', 2000)
where deck_id = current_setting('test.deck')::uuid;
insert into public.catalog_legalities (
  card_id,
  format_code,
  legality
)
select
  md5('phase4-bound-card-' || series.value::text)::uuid,
  'modern',
  'banned'
from generate_series(1, 1000) as series(value);

select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config('test.snapshot_started', clock_timestamp()::text, true);
select public.deck_update(
  current_setting('test.deck')::uuid,
  'Maximum Bounds',
  null,
  'Record the maximum-note fixture',
  '{}'::text[],
  'modern',
  null,
  null,
  2
);
select ok(
  (
    select octet_length((revision.snapshot -> 'logical_content')::text)
    from public.deck_revisions as revision
    where revision.deck_id = current_setting('test.deck')::uuid
      and revision.revision = 3
  ) > 4000000,
  'logical snapshot stores a true max-note payload above four megabytes'
);
select ok(
  (
    select pg_column_size(revision.snapshot)
    from public.deck_revisions as revision
    where revision.deck_id = current_setting('test.deck')::uuid
      and revision.revision = 3
  ) <= 41943040,
  'de-duplicated audit snapshot remains inside the explicit forty-megabyte hard cap'
);
select ok(
  clock_timestamp()
    - current_setting('test.snapshot_started')::timestamptz
      < interval '30 seconds',
  'maximum-note revision creation finishes within a bounded local budget'
);

select set_config('test.validation_started', clock_timestamp()::text, true);
select set_config(
  'test.validation',
  public.validate_deck(current_setting('test.deck')::uuid)::text,
  true
);
select is(
  (
    current_setting('test.validation')::jsonb
      #>> '{summary,errors}'
  )::integer,
  1000,
  'worst-case per-card legality failures retain the complete error total'
);
select is(
  (
    current_setting('test.validation')::jsonb
      #>> '{summary,legality_unknown_count}'
  )::integer,
  1000,
  'unknown-legality summary retains the exact count beyond detail truncation'
);
select ok(
  (
    select count(*)
    from jsonb_array_elements(
      current_setting('test.validation')::jsonb -> 'issues'
    ) as issue(value)
    where issue.value ->> 'code' = 'legality_unknown'
  ) < (
    current_setting('test.validation')::jsonb
      #>> '{summary,legality_unknown_count}'
  )::integer,
  'complete unknown-legality count does not depend on truncated issue detail'
);
select is(
  current_setting('test.validation')::jsonb
    #>> '{summary,issues_truncated}',
  'true',
  'worst-case validation deterministically marks truncated issue detail'
);
select is(
  jsonb_array_length(
    current_setting('test.validation')::jsonb -> 'issues'
  ),
  1001,
  'validation returns one thousand details plus an explicit truncation marker'
);
select is(
  current_setting('test.validation')::jsonb
    #>> '{issues,1000,code}',
  'validation_issues_truncated',
  'truncation cannot silently hide omitted validation failures'
);
select ok(
  (
    select pg_column_size(run.result)
    from public.deck_validation_runs as run
    where run.id = (
      current_setting('test.validation')::jsonb
        ->> 'validation_run_id'
    )::uuid
  ) <= 1048576,
  'persisted worst-case validation result remains inside its one-megabyte cap'
);
select ok(
  clock_timestamp()
    - current_setting('test.validation_started')::timestamptz
      < interval '30 seconds',
  '2,000-card validation finishes within a bounded local budget'
);

reset role;
insert into public.decks (
  id,
  workspace_id,
  game_id,
  format_code,
  format_version_id,
  name,
  slug,
  created_by_user_id
)
select
  md5('phase4-list-page-' || series.value::text)::uuid,
  current_setting('test.workspace')::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  'modern',
  '40000000-0000-4000-8000-000000000003'::uuid,
  'List Page ' || lpad(series.value::text, 2, '0'),
  'list-page-' || lpad(series.value::text, 2, '0'),
  current_setting('test.user')::uuid
from generate_series(1, 49) as series(value);
select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
set local role authenticated;
select set_config('test.list_started', clock_timestamp()::text, true);
select set_config(
  'test.list_page',
  public.deck_list(
    current_setting('test.workspace')::uuid,
    false,
    null,
    50,
    'active'
  )::text,
  true
);
select is(
  jsonb_array_length(
    current_setting('test.list_page')::jsonb -> 'items'
  ),
  50,
  'maximum list page returns fifty decks including one maximum-entry deck'
);
select is(
  (
    select (item ->> 'required_quantity')::integer
    from jsonb_array_elements(
      current_setting('test.list_page')::jsonb -> 'items'
    ) as items(item)
    where item ->> 'deck_id' = current_setting('test.deck')
  ),
  2000,
  'set-based list summary reports the maximum deck without entry JSON construction'
);
select ok(
  clock_timestamp()
    - current_setting('test.list_started')::timestamptz
      < interval '30 seconds',
  'maximum fifty-deck list page with a 2,000-entry deck completes within a bounded local budget'
);
select ok(
  position(
    'calculate_deck_ownership_internal'
    in pg_get_functiondef(
    'public.deck_list(uuid,boolean,text,integer,public.resource_status)'
      ::regprocedure
    )
  ) = 0,
  'deck list does not invoke the full per-entry ownership renderer in an N+1 loop'
);

select set_config('test.resolve_started', clock_timestamp()::text, true);
select set_config(
  'test.resolve',
  public.deck_import_resolve(
    current_setting('test.deck')::uuid,
    (
      select jsonb_agg(
        jsonb_build_object(
          'line_id', 'line-' || lpad(series.value::text, 4, '0'),
          'name', 'Unresolved Import ' || lpad(series.value::text, 4, '0')
        )
        order by series.value
      )
      from generate_series(1, 2000) as series(value)
    )
  )::text,
  true
);
select is(
  jsonb_array_length(current_setting('test.resolve')::jsonb -> 'items'),
  2000,
  'resolver accepts and classifies all 2,000 bounded import lines'
);
select ok(
  (
    select coalesce(sum(jsonb_array_length(item -> 'candidates')), 0)
    from jsonb_array_elements(
      current_setting('test.resolve')::jsonb -> 'items'
    ) as items(item)
  ) <= 150,
  'resolver caps fuzzy candidate output at fifty lines by three suggestions'
);
select is(
  current_setting('test.resolve')::jsonb
    #>> '{items,50,suggestions_omitted}',
  'true',
  'resolver explicitly marks unresolved lines beyond the suggestion work budget'
);
select is(
  current_setting('test.resolve')::jsonb
    #>> '{limits,max_suggestion_lines}',
  '50',
  'resolver publishes its bounded fuzzy-work contract'
);
select ok(
  clock_timestamp()
    - current_setting('test.resolve_started')::timestamptz
      < interval '30 seconds',
  '2,000-line resolver call completes within a bounded local budget'
);

select * from finish();
rollback;
