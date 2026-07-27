-- Phase 4: deterministic advisory validation persisted against immutable
-- deck content, rules, and catalog-version evidence; composed deck detail.

create function app_private.deck_issue(
  p_code text,
  p_severity text,
  p_message text,
  p_entry_id uuid default null,
  p_card_id uuid default null,
  p_zone public.deck_zone default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'code', p_code,
    'severity', p_severity,
    'message', p_message,
    'entry_id', p_entry_id,
    'card_id', p_card_id,
    'zone', p_zone,
    'details', p_details
  )
$$;

create function app_private.validate_deck_internal(
  p_deck_id uuid,
  p_content_hash text,
  p_catalog_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_rules public.deck_format_versions;
  v_issues jsonb := '[]'::jsonb;
  v_mainboard integer := 0;
  v_sideboard integer := 0;
  v_commander integer := 0;
  v_companion integer := 0;
  v_maybeboard integer := 0;
  v_consuming_total integer := 0;
  v_sideboard_capacity_used integer := 0;
  v_error_count integer;
  v_warning_count integer;
  v_info_count integer;
  v_total_issue_count integer;
  v_legality_unknown_count integer := 0;
  v_omitted_error_count integer := 0;
  v_omitted_warning_count integer := 0;
  v_omitted_info_count integer := 0;
  v_commander_identity text[] := '{}'::text[];
  v_row record;
begin
  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = p_deck_id;

  select version_row.*
  into v_rules
  from public.deck_format_versions as version_row
  where version_row.id = v_deck.format_version_id;

  select
    coalesce(sum(entry.quantity)
      filter (where entry.zone = 'mainboard'::public.deck_zone), 0),
    coalesce(sum(entry.quantity)
      filter (where entry.zone = 'sideboard'::public.deck_zone), 0),
    coalesce(sum(entry.quantity)
      filter (where entry.zone = 'commander'::public.deck_zone), 0),
    coalesce(sum(entry.quantity)
      filter (where entry.zone = 'companion'::public.deck_zone), 0),
    coalesce(sum(entry.quantity)
      filter (where entry.zone = 'maybeboard'::public.deck_zone), 0)
  into
    v_mainboard,
    v_sideboard,
    v_commander,
    v_companion,
    v_maybeboard
  from public.deck_entries as entry
  where entry.deck_id = p_deck_id;

  v_consuming_total := v_mainboard + v_commander;
  v_sideboard_capacity_used := v_sideboard
    + case
      when v_rules.companion_consumes_sideboard then v_companion
      else 0
    end;

  -- Issue order is a stable public contract: global provenance/source notices,
  -- structural counts, then card issues ordered by normalized card identity.
  if p_catalog_version = 'catalog-unversioned' then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'catalog_version_unknown',
        'warning',
        'No promoted catalog version is active; legality results are pinned to an explicit unversioned sentinel.',
        null,
        null,
        null,
        jsonb_build_object('catalog_version', p_catalog_version)
      )
    );
  end if;

  if not exists (
    select 1
    from public.deck_inventory_sources as source
    where source.deck_id = p_deck_id
  )
  then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'inventory_sources_empty',
        'warning',
        'No collection sources are selected, so every consuming requirement is reported missing.',
        null,
        null,
        null,
        '{}'::jsonb
      )
    );
  end if;

  if v_mainboard < v_rules.minimum_mainboard then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'mainboard_minimum',
        'error',
        'The mainboard is below the configured minimum.',
        null,
        null,
        'mainboard'::public.deck_zone,
        jsonb_build_object(
          'actual', v_mainboard,
          'minimum', v_rules.minimum_mainboard
        )
      )
    );
  end if;

  if v_rules.maximum_mainboard is not null
    and v_mainboard > v_rules.maximum_mainboard
  then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'mainboard_maximum',
        'error',
        'The mainboard exceeds the configured maximum.',
        null,
        null,
        'mainboard'::public.deck_zone,
        jsonb_build_object(
          'actual', v_mainboard,
          'maximum', v_rules.maximum_mainboard
        )
      )
    );
  end if;

  -- Total deck size is independently useful only for commander-style rules.
  -- Constructed formats use the equivalent mainboard minimum above, avoiding
  -- duplicate explanations for one deficiency.
  if v_rules.maximum_commander > 0 then
    if v_consuming_total < v_rules.minimum_deck_size then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'deck_size_minimum',
          'error',
          'Mainboard plus commander cards are below the configured deck size.',
          null,
          null,
          null,
          jsonb_build_object(
            'actual', v_consuming_total,
            'minimum', v_rules.minimum_deck_size,
            'included_zones', jsonb_build_array(
              'mainboard',
              'commander'
            )
          )
        )
      );
    end if;
    if v_rules.maximum_deck_size is not null
      and v_consuming_total > v_rules.maximum_deck_size
    then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'deck_size_maximum',
          'error',
          'Mainboard plus commander cards exceed the configured deck size.',
          null,
          null,
          null,
          jsonb_build_object(
            'actual', v_consuming_total,
            'maximum', v_rules.maximum_deck_size,
            'included_zones', jsonb_build_array(
              'mainboard',
              'commander'
            )
          )
        )
      );
    end if;
  end if;

  if v_sideboard_capacity_used > v_rules.sideboard_max then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'sideboard_capacity',
        'error',
        'The sideboard capacity exceeds the configured maximum.',
        null,
        null,
        'sideboard'::public.deck_zone,
        jsonb_build_object(
          'actual', v_sideboard_capacity_used,
          'maximum', v_rules.sideboard_max,
          'sideboard_quantity', v_sideboard,
          'companion_quantity', v_companion,
          'companion_consumes_sideboard',
            v_rules.companion_consumes_sideboard
        )
      )
    );
  end if;

  if v_companion > v_rules.companion_max then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'companion_maximum',
        'error',
        'The companion zone exceeds the configured maximum.',
        null,
        null,
        'companion'::public.deck_zone,
        jsonb_build_object(
          'actual', v_companion,
          'maximum', v_rules.companion_max
        )
      )
    );
  end if;

  if v_commander < v_rules.minimum_commander then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'commander_minimum',
        'error',
        'The commander zone is below the configured minimum.',
        null,
        null,
        'commander'::public.deck_zone,
        jsonb_build_object(
          'actual', v_commander,
          'minimum', v_rules.minimum_commander
        )
      )
    );
  end if;

  if v_commander > v_rules.maximum_commander then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'commander_maximum',
        'error',
        'The commander zone exceeds the configured maximum.',
        null,
        null,
        'commander'::public.deck_zone,
        jsonb_build_object(
          'actual', v_commander,
          'maximum', v_rules.maximum_commander
        )
      )
    );
  end if;

  if v_rules.maximum_commander > 0 and v_commander = 2 then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'commander_pairing_not_evaluated',
        'warning',
        'Two commanders are within the configured count, but partner/background pairing eligibility is not modeled.',
        null,
        null,
        'commander'::public.deck_zone,
        jsonb_build_object('commander_quantity', v_commander)
      )
    );
  end if;

  if v_rules.maximum_commander > 0 and v_commander > 0 then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'commander_eligibility_not_evaluated',
        'warning',
        'Commander card-type and rules-text eligibility are outside this baseline validator.',
        null,
        null,
        'commander'::public.deck_zone,
        jsonb_build_object('commander_quantity', v_commander)
      )
    );
  end if;

  if v_companion > 0 then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'companion_restriction_not_evaluated',
        'warning',
        'The companion deck-building restriction is not available as structured catalog data.',
        null,
        null,
        'companion'::public.deck_zone,
        jsonb_build_object('companion_quantity', v_companion)
      )
    );
  end if;

  if v_maybeboard > 0 then
    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'maybeboard_excluded',
        'info',
        'Maybeboard cards are excluded from ownership allocation and format validation.',
        null,
        null,
        'maybeboard'::public.deck_zone,
        jsonb_build_object('quantity', v_maybeboard)
      )
    );
  end if;

  if v_rules.enforce_color_identity and v_commander > 0 then
    select coalesce(array_agg(distinct color order by color), '{}'::text[])
    into v_commander_identity
    from public.deck_entries as entry
    join public.catalog_cards as card on card.id = entry.card_id
    cross join unnest(card.color_identity) as color
    where entry.deck_id = p_deck_id
      and entry.zone = 'commander'::public.deck_zone;
  end if;

  for v_row in
    select
      card.id as card_id,
      card.name,
      card.normalized_name,
      card.type_line,
      card.oracle_text,
      card.color_identity,
      card.active,
      sum(entry.quantity)::integer as quantity,
      (
        array_agg(
          entry.id
          order by
            app_private.deck_zone_allocation_rank(entry.zone),
            entry.sort_order,
            entry.id
        )
      )[1] as entry_id,
      (
        array_agg(
          entry.zone
          order by
            app_private.deck_zone_allocation_rank(entry.zone),
            entry.sort_order,
            entry.id
        )
      )[1] as first_zone,
      legality.legality,
      bool_or(
        entry.preferred_printing_id is not null
        and not preferred_printing.active
      ) as has_inactive_preference,
      array_agg(distinct entry.zone::text order by entry.zone::text)
        as zones
    from public.deck_entries as entry
    join public.catalog_cards as card on card.id = entry.card_id
    left join public.catalog_legalities as legality
      on legality.card_id = card.id
      and legality.format_code = v_rules.legality_format_code
    left join public.catalog_printings as preferred_printing
      on preferred_printing.id = entry.preferred_printing_id
    where entry.deck_id = p_deck_id
      and entry.zone <> 'maybeboard'::public.deck_zone
    group by
      card.id,
      card.name,
      card.normalized_name,
      card.type_line,
      card.oracle_text,
      card.color_identity,
      card.active,
      legality.legality
    order by card.normalized_name, card.id
  loop
    if not v_row.active then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'catalog_card_inactive',
          'warning',
          'This pinned oracle card is inactive in the current catalog but remains in the deck.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object('zones', to_jsonb(v_row.zones))
        )
      );
    end if;

    if v_row.has_inactive_preference then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'preferred_printing_inactive',
          'warning',
          'A pinned preferred printing is inactive in the current catalog and remains visible for audit.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          '{}'::jsonb
        )
      );
    end if;

    if v_row.legality is null then
      v_legality_unknown_count := v_legality_unknown_count + 1;
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'legality_unknown',
          'warning',
          'No legality row is available for this card and pinned format.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object(
            'format_code', v_rules.legality_format_code,
            'zones', to_jsonb(v_row.zones)
          )
        )
      );
    elsif v_row.legality in ('banned', 'not_legal') then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'card_not_legal',
          'error',
          'The catalog marks this card banned or not legal in the pinned format.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object(
            'format_code', v_rules.legality_format_code,
            'legality', v_row.legality,
            'zones', to_jsonb(v_row.zones)
          )
        )
      );
    end if;

    if v_row.legality = 'restricted'
      and v_row.quantity > v_rules.restricted_copy_limit
    then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'restricted_copy_limit',
          'error',
          'The card exceeds the configured restricted copy limit across consuming zones.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object(
            'actual', v_row.quantity,
            'maximum', v_rules.restricted_copy_limit,
            'zones', to_jsonb(v_row.zones)
          )
        )
      );
    end if;

    if coalesce(v_row.oracle_text, '')
      ~* 'A deck can have up to .{1,40} cards named'
      and v_row.quantity > v_rules.default_copy_limit
    then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'copy_exception_not_evaluated',
          'warning',
          'This card has a bounded deck-size exception in oracle text that the baseline validator does not parse.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object(
            'actual', v_row.quantity,
            'default_maximum', v_rules.default_copy_limit,
            'zones', to_jsonb(v_row.zones)
          )
        )
      );
    elsif coalesce(v_row.type_line, '')
        !~* '(^|[^A-Za-z])Basic(?: Snow)? Land([^A-Za-z]|$)'
      and coalesce(v_row.oracle_text, '')
        !~* 'A deck can have any number of cards named'
      and v_row.legality is distinct from 'restricted'
      and v_row.quantity > v_rules.default_copy_limit
    then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'copy_limit',
          'error',
          'The card exceeds the configured copy limit across consuming zones.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object(
            'actual', v_row.quantity,
            'maximum', v_rules.default_copy_limit,
            'zones', to_jsonb(v_row.zones)
          )
        )
      );
    end if;

    if v_rules.enforce_color_identity
      and v_commander > 0
      and not (v_row.color_identity <@ v_commander_identity)
    then
      v_issues := v_issues || jsonb_build_array(
        app_private.deck_issue(
          'commander_color_identity',
          'error',
          'The card color identity is outside the union of configured commander identities.',
          v_row.entry_id,
          v_row.card_id,
          v_row.first_zone,
          jsonb_build_object(
            'card_color_identity', to_jsonb(v_row.color_identity),
            'commander_color_identity', to_jsonb(v_commander_identity),
            'zones', to_jsonb(v_row.zones)
          )
        )
      );
    end if;
  end loop;

  select
    count(*) filter (where issue ->> 'severity' = 'error')::integer,
    count(*) filter (where issue ->> 'severity' = 'warning')::integer,
    count(*) filter (where issue ->> 'severity' = 'info')::integer,
    count(*)::integer
  into
    v_error_count,
    v_warning_count,
    v_info_count,
    v_total_issue_count
  from jsonb_array_elements(v_issues) as issues(issue);

  if v_total_issue_count > 1000 then
    select
      count(*) filter (
        where issue ->> 'severity' = 'error'
      )::integer,
      count(*) filter (
        where issue ->> 'severity' = 'warning'
      )::integer,
      count(*) filter (
        where issue ->> 'severity' = 'info'
      )::integer
    into
      v_omitted_error_count,
      v_omitted_warning_count,
      v_omitted_info_count
    from jsonb_array_elements(v_issues)
      with ordinality as issue_row(issue, ordinality)
    where issue_row.ordinality > 1000;

    select coalesce(
      jsonb_agg(issue_row.issue order by issue_row.ordinality),
      '[]'::jsonb
    )
    into v_issues
    from jsonb_array_elements(v_issues)
      with ordinality as issue_row(issue, ordinality)
    where issue_row.ordinality <= 1000;

    v_issues := v_issues || jsonb_build_array(
      app_private.deck_issue(
        'validation_issues_truncated',
        case
          when v_omitted_error_count > 0 then 'error'
          else 'warning'
        end,
        'Validation completed, but issue detail exceeded the deterministic response cap. Summary totals include every issue.',
        null,
        null,
        null,
        jsonb_build_object(
          'detail_limit', 1000,
          'total', v_total_issue_count,
          'omitted', v_total_issue_count - 1000,
          'omitted_errors', v_omitted_error_count,
          'omitted_warnings', v_omitted_warning_count,
          'omitted_infos', v_omitted_info_count
        )
      )
    );
  end if;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'advisory', true,
    'valid', v_error_count = 0,
    'content_hash', p_content_hash,
    'rules_version',
      jsonb_build_object(
        'format_code', v_deck.format_code,
        'rules', app_private.deck_rules_json(v_rules.id)
      ),
    'catalog_version', p_catalog_version,
    'historical_recomputation_supported', false,
    'scope',
      'Deterministic practical baseline only; persisted result is the historical truth because catalog legality rows are mutable. This is not an exhaustive Comprehensive Rules or tournament-policy implementation.',
    'summary',
      jsonb_build_object(
        'errors', v_error_count,
        'warnings', v_warning_count,
        'infos', v_info_count,
        'legality_unknown_count', v_legality_unknown_count,
        'issue_detail_limit', 1000,
        'issue_detail_returned', jsonb_array_length(v_issues),
        'issue_detail_total', v_total_issue_count,
        'issues_truncated', v_total_issue_count > 1000
      ),
    'counts',
      jsonb_build_object(
        'mainboard', v_mainboard,
        'sideboard', v_sideboard,
        'commander', v_commander,
        'companion', v_companion,
        'maybeboard', v_maybeboard,
        'deck_size_mainboard_plus_commander', v_consuming_total,
        'sideboard_capacity_used', v_sideboard_capacity_used
      ),
    'issues', v_issues
  );
end;
$$;

create function public.validate_deck(p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_revision public.deck_revisions;
  v_catalog_version text;
  v_current_hash text;
  v_result jsonb;
  v_run public.deck_validation_runs;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

  -- Keep the revision/hash snapshot and all catalog-backed legality reads in
  -- one coherent lock scope. Deck mutations take a conflicting row lock, and
  -- catalog promotion takes a conflicting lock on the singleton state row
  -- before replacing mutable catalog data.
  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = p_deck_id
  for share;

  if v_deck.id is null
    or v_deck.status = 'deleted'::public.resource_status
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  select coalesce(state.active_catalog_version, 'catalog-unversioned')
  into v_catalog_version
  from public.catalog_state as state
  where state.singleton_id = 1
  for share;
  v_catalog_version := coalesce(
    v_catalog_version,
    'catalog-unversioned'
  );

  select revision_row.*
  into v_revision
  from public.deck_revisions as revision_row
  where revision_row.deck_id = p_deck_id
    and revision_row.revision = v_deck.current_revision;

  v_current_hash := app_private.deck_content_hash(p_deck_id);
  if v_revision.id is null
    or v_revision.content_hash <> v_current_hash
    or v_revision.rules_version_id <> v_deck.format_version_id
  then
    raise exception using
      errcode = '55000',
      message = 'talence_deck_revision_out_of_sync';
  end if;

  select validation.*
  into v_run
  from public.deck_validation_runs as validation
  where validation.deck_id = p_deck_id
    and validation.content_hash = v_current_hash
    and validation.rules_version_id = v_deck.format_version_id
    and validation.catalog_version = v_catalog_version;

  if v_run.id is null then
    v_result := app_private.validate_deck_internal(
      p_deck_id,
      v_current_hash,
      v_catalog_version
    );

    insert into public.deck_validation_runs (
      workspace_id,
      deck_id,
      deck_revision_id,
      revision,
      content_hash,
      format_code,
      rules_version_id,
      catalog_version,
      result,
      evaluated_by_user_id
    )
    values (
      v_deck.workspace_id,
      p_deck_id,
      v_revision.id,
      v_revision.revision,
      v_current_hash,
      v_deck.format_code,
      v_deck.format_version_id,
      v_catalog_version,
      v_result,
      auth.uid()
    )
    on conflict (
      deck_id,
      content_hash,
      rules_version_id,
      catalog_version
    )
    do nothing;

    select validation.*
    into v_run
    from public.deck_validation_runs as validation
    where validation.deck_id = p_deck_id
      and validation.content_hash = v_current_hash
      and validation.rules_version_id = v_deck.format_version_id
      and validation.catalog_version = v_catalog_version;
  end if;

  return v_run.result || jsonb_build_object(
    'validation_run_id', v_run.id,
    'deck_revision_id', v_run.deck_revision_id,
    'revision', v_run.revision,
    'evaluated_at', v_run.evaluated_at
  );
end;
$$;

create function public.deck_validation_history(
  p_deck_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_validation_limit_invalid';
  end if;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'validation_run_id', run.id,
              'deck_revision_id', run.deck_revision_id,
              'revision', run.revision,
              'content_hash', run.content_hash,
              'format_code', run.format_code,
              'rules_version_id', run.rules_version_id,
              'catalog_version', run.catalog_version,
              'valid', run.result -> 'valid',
              'summary', run.result -> 'summary',
              'evaluated_at', run.evaluated_at
            )
            order by run.evaluated_at desc, run.id
          )
          from (
            select validation.*
            from public.deck_validation_runs as validation
            where validation.deck_id = p_deck_id
            order by validation.evaluated_at desc, validation.id
            limit p_limit
          ) as run
        ),
        '[]'::jsonb
      )
  );
end;
$$;

create function public.deck_detail(
  p_deck_id uuid,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_currency text;
  v_sources jsonb;
  v_entries jsonb;
  v_cover_finish public.card_finish;
  v_cover jsonb;
  v_can_edit boolean;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

  -- Hold the same scope as validate_deck before composing any component of
  -- the response so entries, ownership, prices, and validation cannot be
  -- assembled from different deck/catalog generations.
  select deck.*
  into v_deck
  from public.decks as deck
  where deck.id = p_deck_id
  for share;

  if v_deck.id is null
    or v_deck.status = 'deleted'::public.resource_status
  then
    raise exception using
      errcode = 'P0002',
      message = 'talence_deck_not_found';
  end if;

  perform state.singleton_id
  from public.catalog_state as state
  where state.singleton_id = 1
  for share;

  v_currency := app_private.current_catalog_currency(p_currency);
  v_can_edit := app_api.has_workspace_role(
    v_deck.workspace_id,
    'editor'::public.membership_role
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection_id', source.collection_id,
        'name', collection.name,
        'priority', source.priority,
        'status', collection.status
      )
      order by source.priority, source.collection_id
    ),
    '[]'::jsonb
  )
  into v_sources
  from public.deck_inventory_sources as source
  join public.collections as collection
    on collection.id = source.collection_id
  where source.deck_id = p_deck_id
    and collection.status <> 'deleted'::public.resource_status;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'entry_id', entry.id,
        'card_id', entry.card_id,
        'card_name', card.name,
        'mana_cost', card.mana_cost,
        'mana_value', card.mana_value,
        'type_line', card.type_line,
        'oracle_text', card.oracle_text,
        'color_identity', card.color_identity,
        'zone', entry.zone,
        'quantity', entry.quantity,
        'preferred_printing_id', entry.preferred_printing_id,
        'preferred_finish', entry.preferred_finish,
        'preferred_printing',
          case
            when entry.preferred_printing_id is null then null
            else app_private.deck_printing_json(
              entry.preferred_printing_id,
              entry.preferred_finish,
              v_currency
            )
          end,
        'sort_order', entry.sort_order,
        'notes', entry.notes,
        'created_at', entry.created_at,
        'updated_at', entry.updated_at
      )
      order by
        app_private.deck_zone_allocation_rank(entry.zone),
        entry.sort_order,
        card.name,
        entry.id
    ),
    '[]'::jsonb
  )
  into v_entries
  from public.deck_entries as entry
  join public.catalog_cards as card on card.id = entry.card_id
  where entry.deck_id = p_deck_id;

  if v_deck.cover_printing_id is not null then
    select case
      when 'nonfoil'::public.card_finish = any(printing.finishes)
        then 'nonfoil'::public.card_finish
      when 'foil'::public.card_finish = any(printing.finishes)
        then 'foil'::public.card_finish
      when 'etched'::public.card_finish = any(printing.finishes)
        then 'etched'::public.card_finish
      else null
    end
    into v_cover_finish
    from public.catalog_printings as printing
    where printing.id = v_deck.cover_printing_id;

    v_cover := app_private.deck_printing_json(
      v_deck.cover_printing_id,
      v_cover_finish,
      v_currency
    );
  end if;

  return jsonb_build_object(
    'deck',
      app_private.deck_mutation_json(p_deck_id)
      || jsonb_build_object(
        'format',
          jsonb_build_object(
            'code', v_deck.format_code,
            'name',
              (
                select format.name
                from public.deck_formats as format
                where format.code = v_deck.format_code
              ),
            'active',
              (
                select format.active
                from public.deck_formats as format
                where format.code = v_deck.format_code
              ),
            'rules', app_private.deck_rules_json(
              v_deck.format_version_id
            )
          ),
        'cover_printing', v_cover,
        'sources', v_sources,
        'entries', v_entries,
        'permissions',
          jsonb_build_object(
            'can_edit',
              v_can_edit
              and v_deck.status = 'active'::public.resource_status,
            'can_archive',
              v_can_edit
              and v_deck.status = 'active'::public.resource_status,
            'can_restore',
              v_can_edit
              and v_deck.status = 'archived'::public.resource_status,
            'can_duplicate', v_can_edit,
            'can_delete',
              app_api.has_workspace_role(
                v_deck.workspace_id,
                'owner'::public.membership_role
              )
          )
      ),
    'ownership',
      app_private.calculate_deck_ownership_internal(
        p_deck_id,
        v_currency
      ),
    'validation', public.validate_deck(p_deck_id)
  );
end;
$$;

revoke all on function app_private.deck_issue(
  text,
  text,
  text,
  uuid,
  uuid,
  public.deck_zone,
  jsonb
)
  from public, anon, authenticated;
revoke all on function app_private.validate_deck_internal(
  uuid,
  text,
  text
)
  from public, anon, authenticated;

revoke all on function public.validate_deck(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_validation_history(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_detail(uuid, text)
  from public, anon, authenticated, service_role;
