-- Phase 4: finite ownership allocation, format/deck reads, catalog search,
-- revision history, and deterministic exports.

create function app_private.deck_rules_json(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'format_version_id', version_row.id,
    'version', version_row.version,
    'version_key', version_row.version_key,
    'effective_at', version_row.effective_at,
    'minimum_mainboard', version_row.minimum_mainboard,
    'maximum_mainboard', version_row.maximum_mainboard,
    'minimum_deck_size', version_row.minimum_deck_size,
    'maximum_deck_size', version_row.maximum_deck_size,
    'sideboard_max', version_row.sideboard_max,
    'default_copy_limit', version_row.default_copy_limit,
    'minimum_commander', version_row.minimum_commander,
    'maximum_commander', version_row.maximum_commander,
    'companion_max', version_row.companion_max,
    'companion_consumes_sideboard',
      version_row.companion_consumes_sideboard,
    'enforce_color_identity', version_row.enforce_color_identity,
    'legality_format_code', version_row.legality_format_code,
    'restricted_copy_limit', version_row.restricted_copy_limit,
    'scope_note', version_row.scope_note,
    'rules_metadata', version_row.rules_metadata
  )
  from public.deck_format_versions as version_row
  where version_row.id = p_version_id
$$;

create function app_private.deck_printing_json(
  p_printing_id uuid,
  p_finish public.card_finish,
  p_currency text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'printing_id', printing.id,
    'card_id', printing.card_id,
    'display_name', coalesce(
      printing.printed_name,
      card.name,
      first_face.name,
      printing.collector_number
    ),
    'set_id', catalog_set.id,
    'set_code', catalog_set.code,
    'set_name', catalog_set.name,
    'collector_number', printing.collector_number,
    'language', printing.language,
    'active', printing.active,
    'finish', p_finish,
    'image_small_uri', first_face.image_small_uri,
    'image_normal_uri', first_face.image_normal_uri,
    'price',
      case
        when price.amount is null then null
        else jsonb_build_object(
          'amount', to_char(price.amount, 'FM999999999999990.0000'),
          'currency', price.currency,
          'provider', price.provider,
          'finish', price.finish,
          'observed_at', price.observed_at,
          'ingested_at', price.ingested_at,
          'stale_after', price.stale_after,
          'is_stale',
            price.stale_after is not null
            and price.stale_after <= statement_timestamp()
        )
      end
  )
  from public.catalog_printings as printing
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  left join lateral (
    select
      face.name,
      face.image_small_uri,
      face.image_normal_uri
    from public.catalog_faces as face
    where face.printing_id = printing.id
    order by face.face_index
    limit 1
  ) as first_face on true
  left join lateral (
    select current_price.*
    from public.current_prices as current_price
    where current_price.printing_id = printing.id
      and current_price.finish = p_finish
      and current_price.currency = p_currency
    order by
      case current_price.provider when 'scryfall' then 1 else 2 end,
      current_price.provider
    limit 1
  ) as price on true
  where printing.id = p_printing_id
$$;

create function app_private.deck_zone_allocation_rank(
  p_zone public.deck_zone
)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case p_zone
    when 'commander'::public.deck_zone then 1
    when 'companion'::public.deck_zone then 2
    when 'mainboard'::public.deck_zone then 3
    when 'sideboard'::public.deck_zone then 4
    when 'maybeboard'::public.deck_zone then 5
  end
$$;

create function app_private.deck_ownership_rows(
  p_deck_id uuid,
  p_currency text
)
returns table (
  entry_id uuid,
  card_id uuid,
  card_name text,
  zone public.deck_zone,
  required_quantity integer,
  sort_order integer,
  available_oracle_quantity bigint,
  allocated_owned_quantity bigint,
  missing_quantity bigint,
  maybeboard_excluded boolean,
  preferred_printing_id uuid,
  preferred_finish public.card_finish,
  preferred_printing_available_quantity bigint,
  preferred_printing_allocated_quantity bigint,
  preferred_printing_missing_quantity bigint,
  price_provider text,
  price_currency text,
  price_amount numeric,
  price_observed_at timestamptz,
  price_ingested_at timestamptz,
  price_stale_after timestamptz,
  price_is_stale boolean,
  preferred_value numeric,
  missing_acquisition_value numeric
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with selected_collections as (
    select distinct source.collection_id
    from public.deck_inventory_sources as source
    join public.collections as collection
      on collection.id = source.collection_id
    where source.deck_id = p_deck_id
      and collection.status <> 'deleted'::public.resource_status
  ),
  oracle_owned as (
    select
      printing.card_id,
      sum(balance.quantity)::bigint as quantity
    from selected_collections as selected
    join public.inventory_balances as balance
      on balance.collection_id = selected.collection_id
      and balance.quantity > 0
    join public.catalog_printings as printing
      on printing.id = balance.printing_id
      and printing.card_id is not null
    group by printing.card_id
  ),
  base as (
    select
      entry.id as entry_id,
      entry.card_id,
      card.name as card_name,
      entry.zone,
      entry.quantity as required_quantity,
      entry.sort_order,
      coalesce(oracle_owned.quantity, 0::bigint)
        as available_oracle_quantity,
      entry.preferred_printing_id,
      entry.preferred_finish,
      coalesce(preferred_owned.quantity, 0::bigint)
        as preferred_printing_available_quantity,
      price.provider as price_provider,
      price.currency as price_currency,
      price.amount as price_amount,
      price.observed_at as price_observed_at,
      price.ingested_at as price_ingested_at,
      price.stale_after as price_stale_after,
      price.stale_after is not null
        and price.stale_after <= statement_timestamp()
        as price_is_stale,
      coalesce(
        sum(entry.quantity) over (
          partition by entry.card_id
          order by
            app_private.deck_zone_allocation_rank(entry.zone),
            entry.sort_order,
            entry.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::bigint as consuming_before
      ,
      coalesce(
        sum(entry.quantity) over (
          partition by
            entry.card_id,
            entry.preferred_printing_id,
            entry.preferred_finish
          order by
            app_private.deck_zone_allocation_rank(entry.zone),
            entry.sort_order,
            entry.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::bigint as preferred_consuming_before
    from public.deck_entries as entry
    join public.catalog_cards as card on card.id = entry.card_id
    left join oracle_owned on oracle_owned.card_id = entry.card_id
    left join lateral (
      select sum(balance.quantity)::bigint as quantity
      from selected_collections as selected
      join public.inventory_balances as balance
        on balance.collection_id = selected.collection_id
        and balance.printing_id = entry.preferred_printing_id
        and balance.finish = entry.preferred_finish
        and balance.quantity > 0
    ) as preferred_owned on true
    left join lateral (
      select current_price.*
      from public.current_prices as current_price
      where current_price.printing_id = entry.preferred_printing_id
        and current_price.finish = entry.preferred_finish
        and current_price.currency = p_currency
      order by
        case current_price.provider when 'scryfall' then 1 else 2 end,
        current_price.provider
      limit 1
    ) as price on true
    where entry.deck_id = p_deck_id
  ),
  oracle_allocated as (
    select
      base.*,
      case
        when base.zone = 'maybeboard'::public.deck_zone then 0::bigint
        else greatest(
          least(
            base.required_quantity::bigint,
            base.available_oracle_quantity - base.consuming_before
          ),
          0::bigint
        )
      end as allocated_owned_quantity
    from base
  ),
  allocated as (
    select
      oracle_allocated.*,
      case
        when oracle_allocated.zone = 'maybeboard'::public.deck_zone
          or oracle_allocated.preferred_printing_id is null
        then 0::bigint
        else greatest(
          least(
            oracle_allocated.required_quantity::bigint,
            oracle_allocated.allocated_owned_quantity,
            oracle_allocated.preferred_printing_available_quantity
              - oracle_allocated.preferred_consuming_before
          ),
          0::bigint
        )
      end as preferred_printing_allocated_quantity
    from oracle_allocated
  )
  select
    allocated.entry_id,
    allocated.card_id,
    allocated.card_name,
    allocated.zone,
    allocated.required_quantity,
    allocated.sort_order,
    allocated.available_oracle_quantity,
    allocated.allocated_owned_quantity,
    case
      when allocated.zone = 'maybeboard'::public.deck_zone then 0::bigint
      else allocated.required_quantity::bigint
        - allocated.allocated_owned_quantity
    end,
    allocated.zone = 'maybeboard'::public.deck_zone,
    allocated.preferred_printing_id,
    allocated.preferred_finish,
    allocated.preferred_printing_available_quantity,
    allocated.preferred_printing_allocated_quantity,
    case
      when allocated.zone = 'maybeboard'::public.deck_zone then 0::bigint
      else greatest(
        allocated.required_quantity::bigint
          - allocated.preferred_printing_allocated_quantity,
        0::bigint
      )
    end,
    allocated.price_provider,
    allocated.price_currency,
    allocated.price_amount,
    allocated.price_observed_at,
    allocated.price_ingested_at,
    allocated.price_stale_after,
    allocated.price_is_stale,
    case
      when allocated.preferred_printing_id is null
        or allocated.price_amount is null
      then null
      else allocated.required_quantity * allocated.price_amount
    end,
    case
      when allocated.zone = 'maybeboard'::public.deck_zone
        or allocated.preferred_printing_id is null
        or allocated.price_amount is null
      then null
      else greatest(
        allocated.required_quantity::bigint
          - allocated.preferred_printing_allocated_quantity,
        0::bigint
      ) * allocated.price_amount
    end
  from allocated
  order by
    app_private.deck_zone_allocation_rank(allocated.zone),
    allocated.sort_order,
    allocated.card_name,
    allocated.entry_id
$$;

create function app_private.calculate_deck_ownership_internal(
  p_deck_id uuid,
  p_currency text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_entries jsonb := '[]'::jsonb;
  v_sources jsonb;
  v_selected_ids jsonb;
  v_source_warnings jsonb;
  v_required bigint := 0;
  v_owned bigint := 0;
  v_missing bigint := 0;
  v_maybeboard bigint := 0;
  v_preferred_value numeric := 0;
  v_preferred_value_priced integer := 0;
  v_acquisition_value numeric := 0;
  v_acquisition_priced integer := 0;
  v_unpriced integer := 0;
  v_unpriced_missing bigint := 0;
  v_stale integer := 0;
  v_providers text[] := '{}'::text[];
  v_oldest_observed timestamptz;
  v_latest_observed timestamptz;
  v_oldest_ingested timestamptz;
  v_latest_ingested timestamptz;
  v_row record;
begin
  select
    coalesce(
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
    ),
    coalesce(
      jsonb_agg(to_jsonb(source.collection_id)
        order by source.priority, source.collection_id),
      '[]'::jsonb
    )
  into v_sources, v_selected_ids
  from public.deck_inventory_sources as source
  join public.collections as collection
    on collection.id = source.collection_id
  where source.deck_id = p_deck_id
    and collection.status <> 'deleted'::public.resource_status;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', 'inventory_source_archived',
        'collection_id', source.collection_id,
        'collection_name', collection.name,
        'message',
          'Archived source balances remain explicitly selected and counted.'
      )
      order by source.priority, source.collection_id
    ),
    '[]'::jsonb
  )
  into v_source_warnings
  from public.deck_inventory_sources as source
  join public.collections as collection
    on collection.id = source.collection_id
  where source.deck_id = p_deck_id
    and collection.status = 'archived'::public.resource_status;

  for v_row in
    select *
    from app_private.deck_ownership_rows(p_deck_id, p_currency)
  loop
    if v_row.maybeboard_excluded then
      v_maybeboard := v_maybeboard + v_row.required_quantity;
    else
      v_required := v_required + v_row.required_quantity;
      v_owned := v_owned + v_row.allocated_owned_quantity;
      v_missing := v_missing + v_row.missing_quantity;

      if v_row.price_amount is null then
        v_unpriced := v_unpriced + 1;
        v_unpriced_missing := v_unpriced_missing
          + v_row.preferred_printing_missing_quantity;
      else
        v_preferred_value :=
          v_preferred_value + v_row.preferred_value;
        v_preferred_value_priced := v_preferred_value_priced + 1;
        v_acquisition_value :=
          v_acquisition_value + v_row.missing_acquisition_value;
        v_acquisition_priced := v_acquisition_priced + 1;
        if v_row.price_is_stale then
          v_stale := v_stale + 1;
        end if;
        v_providers := array(
          select distinct provider
          from unnest(v_providers || v_row.price_provider) as provider
          where provider is not null
          order by provider
        );
        v_oldest_observed := least(
          coalesce(v_oldest_observed, v_row.price_observed_at),
          v_row.price_observed_at
        );
        v_latest_observed := greatest(
          coalesce(v_latest_observed, v_row.price_observed_at),
          v_row.price_observed_at
        );
        v_oldest_ingested := least(
          coalesce(v_oldest_ingested, v_row.price_ingested_at),
          v_row.price_ingested_at
        );
        v_latest_ingested := greatest(
          coalesce(v_latest_ingested, v_row.price_ingested_at),
          v_row.price_ingested_at
        );
      end if;
    end if;

    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'entry_id', v_row.entry_id,
        'card_id', v_row.card_id,
        'card_name', v_row.card_name,
        'zone', v_row.zone,
        'required_quantity', v_row.required_quantity,
        'available_oracle_quantity', v_row.available_oracle_quantity,
        'allocated_owned_quantity', v_row.allocated_owned_quantity,
        'missing_quantity', v_row.missing_quantity,
        'maybeboard_excluded', v_row.maybeboard_excluded,
        'preferred_printing',
          case
            when v_row.preferred_printing_id is null then null
            else
              app_private.deck_printing_json(
                v_row.preferred_printing_id,
                v_row.preferred_finish,
                p_currency
              )
              || jsonb_build_object(
                'available_quantity',
                  v_row.preferred_printing_available_quantity,
                'owned_quantity',
                  v_row.preferred_printing_available_quantity,
                'allocated_quantity',
                  v_row.preferred_printing_allocated_quantity,
                'missing_quantity',
                  v_row.preferred_printing_missing_quantity
              )
          end,
        'selected_value',
          case
            when v_row.preferred_value is null then null
            else to_char(
              v_row.preferred_value,
              'FM999999999999990.0000'
            )
          end,
        'missing_acquisition_value',
          case
            when v_row.missing_acquisition_value is null then null
            else to_char(
              v_row.missing_acquisition_value,
              'FM999999999999990.0000'
            )
          end
      )
    );
  end loop;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'currency', p_currency,
    'sources', v_sources,
    'source_warnings', v_source_warnings,
    'selected_collection_ids', v_selected_ids,
    'allocation_policy',
      'commander, companion, mainboard, sideboard; then sort_order and entry_id; maybeboard does not consume inventory',
    'summary',
      jsonb_build_object(
        'required_quantity', v_required,
        'allocated_owned_quantity', v_owned,
        'missing_quantity', v_missing,
        'maybeboard_quantity', v_maybeboard,
        'preferred_value',
          case
            when v_preferred_value_priced = 0 then null
            else to_char(
              v_preferred_value,
              'FM999999999999990.0000'
            )
          end,
        'missing_acquisition_value',
          case
            when v_acquisition_priced = 0 then null
            else to_char(
              v_acquisition_value,
              'FM999999999999990.0000'
            )
          end,
        'unpriced_entry_count', v_unpriced,
        'unpriced_missing_quantity', v_unpriced_missing,
        'stale_price_entry_count', v_stale,
        'price_providers', to_jsonb(v_providers),
        'oldest_price_observed_at', v_oldest_observed,
        'latest_price_observed_at', v_latest_observed,
        'oldest_price_ingested_at', v_oldest_ingested,
        'latest_price_ingested_at', v_latest_ingested
      ),
    'entries', v_entries
  );
end;
$$;

create function app_private.deck_list_ownership_summaries(
  p_deck_ids uuid[]
)
returns table (
  deck_id uuid,
  required_quantity bigint,
  maybeboard_quantity bigint,
  missing_quantity bigint
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with target_decks as materialized (
    select distinct requested.deck_id
    from unnest(coalesce(p_deck_ids, '{}'::uuid[]))
      as requested(deck_id)
  ),
  requirements as materialized (
    select
      entry.deck_id,
      entry.card_id,
      sum(entry.quantity) filter (
        where entry.zone <> 'maybeboard'::public.deck_zone
      )::bigint as required_quantity,
      sum(entry.quantity) filter (
        where entry.zone = 'maybeboard'::public.deck_zone
      )::bigint as maybeboard_quantity
    from public.deck_entries as entry
    join target_decks as target on target.deck_id = entry.deck_id
    group by entry.deck_id, entry.card_id
  ),
  selected_collections as materialized (
    select source.deck_id, source.collection_id
    from public.deck_inventory_sources as source
    join target_decks as target on target.deck_id = source.deck_id
    join public.collections as collection
      on collection.id = source.collection_id
      and collection.status <> 'deleted'::public.resource_status
  ),
  owned_by_card as materialized (
    select
      selected.deck_id,
      printing.card_id,
      sum(balance.quantity)::bigint as owned_quantity
    from selected_collections as selected
    join public.inventory_balances as balance
      on balance.collection_id = selected.collection_id
      and balance.quantity > 0
    join public.catalog_printings as printing
      on printing.id = balance.printing_id
      and printing.card_id is not null
    group by selected.deck_id, printing.card_id
  ),
  deck_totals as (
    select
      requirement.deck_id,
      coalesce(sum(requirement.required_quantity), 0)::bigint
        as required_quantity,
      coalesce(sum(requirement.maybeboard_quantity), 0)::bigint
        as maybeboard_quantity,
      coalesce(
        sum(
          greatest(
            requirement.required_quantity
              - least(
                requirement.required_quantity,
                coalesce(owned.owned_quantity, 0::bigint)
              ),
            0::bigint
          )
        ),
        0
      )::bigint as missing_quantity
    from requirements as requirement
    left join owned_by_card as owned
      on owned.deck_id = requirement.deck_id
      and owned.card_id = requirement.card_id
    group by requirement.deck_id
  )
  select
    target.deck_id,
    coalesce(total.required_quantity, 0::bigint),
    coalesce(total.maybeboard_quantity, 0::bigint),
    coalesce(total.missing_quantity, 0::bigint)
  from target_decks as target
  left join deck_totals as total on total.deck_id = target.deck_id
$$;

create function public.calculate_deck_ownership(
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
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

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
  return app_private.calculate_deck_ownership_internal(
    p_deck_id,
    v_currency
  );
end;
$$;

create function public.deck_formats_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not app_api.is_admitted_user(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_formats_denied';
  end if;

  return jsonb_build_object(
    'formats',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', format.code,
            'name', format.name,
            'active', format.active,
            'latest_version',
              app_private.deck_rules_json(version_row.id)
          )
          order by format.name, format.code
        )
        from public.deck_formats as format
        join lateral (
          select candidate.id
          from public.deck_format_versions as candidate
          where candidate.format_code = format.code
            and candidate.effective_at <= statement_timestamp()
          order by candidate.version desc, candidate.id
          limit 1
        ) as version_row on true
        where format.active
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create function public.deck_list(
  p_workspace_id uuid,
  p_include_archived boolean default false,
  p_after text default null,
  p_limit integer default 40,
  p_status public.resource_status default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_can_edit boolean;
  v_cursor jsonb;
  v_after_name text;
  v_after_id uuid;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
  v_row record;
begin
  if not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      p_workspace_id,
      'viewer'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_deck_list_denied';
  end if;

  if p_include_archived is null
    or p_limit is null
    or p_limit not between 1 and 50
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_list_limit_invalid';
  end if;

  if p_status = 'deleted'::public.resource_status then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_list_status_invalid';
  end if;

  if p_after is not null then
    begin
      v_cursor := app_private.inventory_decode_cursor(p_after);
      if (v_cursor ->> 'workspace_id')::uuid
          is distinct from p_workspace_id
        or (v_cursor ->> 'include_archived')::boolean
          is distinct from p_include_archived
        or (v_cursor ->> 'status')::public.resource_status
          is distinct from p_status
        or v_cursor ->> 'name' is null
        or v_cursor ->> 'deck_id' is null
      then
        raise exception 'cursor mismatch';
      end if;
      v_after_name := v_cursor ->> 'name';
      v_after_id := (v_cursor ->> 'deck_id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_deck_list_cursor_invalid';
    end;
  end if;

  v_can_edit := app_api.has_workspace_role(
    p_workspace_id,
    'editor'::public.membership_role
  );

  for v_row in
    with page as materialized (
      select
        deck.*,
        format.name as format_name,
        version_row.version as rules_version
      from public.decks as deck
      join public.deck_formats as format on format.code = deck.format_code
      join public.deck_format_versions as version_row
        on version_row.id = deck.format_version_id
      where deck.workspace_id = p_workspace_id
        and (
          (
            p_status is not null
            and deck.status = p_status
          )
          or (
            p_status is null
            and (
              deck.status = 'active'::public.resource_status
              or (
                p_include_archived
                and deck.status = 'archived'::public.resource_status
              )
            )
          )
        )
        and (
          v_after_id is null
          or (lower(deck.name), deck.id) > (v_after_name, v_after_id)
        )
      order by lower(deck.name), deck.id
      limit p_limit + 1
    ),
    entry_counts as materialized (
      select entry.deck_id, count(*)::integer as entry_count
      from public.deck_entries as entry
      join page on page.id = entry.deck_id
      group by entry.deck_id
    ),
    source_counts as materialized (
      select source.deck_id, count(*)::integer as source_count
      from public.deck_inventory_sources as source
      join page on page.id = source.deck_id
      group by source.deck_id
    ),
    ownership as materialized (
      select summary.*
      from app_private.deck_list_ownership_summaries(
        array(select page.id from page)
      ) as summary
    )
    select
      page.*,
      coalesce(entry_counts.entry_count, 0) as entry_count,
      coalesce(source_counts.source_count, 0) as source_count,
      coalesce(ownership.required_quantity, 0::bigint)
        as required_quantity,
      coalesce(ownership.maybeboard_quantity, 0::bigint)
        as maybeboard_quantity,
      coalesce(ownership.missing_quantity, 0::bigint)
        as missing_quantity
    from page
    left join entry_counts on entry_counts.deck_id = page.id
    left join source_counts on source_counts.deck_id = page.id
    left join ownership on ownership.deck_id = page.id
    order by lower(page.name), page.id
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      app_private.deck_mutation_json(v_row.id)
      || jsonb_build_object(
        'format_name', v_row.format_name,
        'entry_count', v_row.entry_count,
        'source_count', v_row.source_count,
        'required_quantity', v_row.required_quantity,
        'maybeboard_quantity', v_row.maybeboard_quantity,
        'missing_quantity', v_row.missing_quantity,
        'permissions',
          jsonb_build_object(
            'can_edit',
              v_can_edit
              and v_row.status = 'active'::public.resource_status,
            'can_archive',
              v_can_edit
              and v_row.status = 'active'::public.resource_status,
            'can_restore',
              v_can_edit
              and v_row.status = 'archived'::public.resource_status,
            'can_duplicate', v_can_edit,
            'can_delete',
              app_api.has_workspace_role(
                p_workspace_id,
                'owner'::public.membership_role
              )
          )
      )
    );
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'workspace_id', p_workspace_id,
        'include_archived', p_include_archived,
        'status', p_status,
        'name', lower(v_row.name),
        'deck_id', v_row.id
      )
    );
  end loop;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'permissions', jsonb_build_object('can_create', v_can_edit),
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.deck_catalog_search(
  p_deck_id uuid,
  p_query text,
  p_after text default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_query text := app_private.normalize_catalog_search_text(
    coalesce(p_query, '')
  );
  v_cursor jsonb;
  v_after_name text;
  v_after_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
  v_currency text;
  v_catalog_version text;
  v_legality_format_code text;
  v_row record;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

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

  select version_row.legality_format_code
  into v_legality_format_code
  from public.deck_format_versions as version_row
  where version_row.id = v_deck.format_version_id;

  if char_length(btrim(coalesce(p_query, ''))) > 200
    or char_length(v_query) = 1
    or p_limit is null
    or p_limit not between 1 and 50
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_catalog_search_invalid';
  end if;

  if p_after is not null then
    begin
      v_cursor := app_private.inventory_decode_cursor(p_after);
      if (v_cursor ->> 'deck_id')::uuid is distinct from p_deck_id
        or v_cursor ->> 'query' is distinct from v_query
        or v_cursor ->> 'catalog_version'
          is distinct from v_catalog_version
        or (v_cursor ->> 'format_version_id')::uuid
          is distinct from v_deck.format_version_id
        or (v_cursor ->> 'revision')::integer
          is distinct from v_deck.current_revision
        or v_cursor ->> 'name' is null
        or v_cursor ->> 'card_id' is null
      then
        raise exception 'cursor mismatch';
      end if;
      v_after_name := v_cursor ->> 'name';
      v_after_id := (v_cursor ->> 'card_id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_deck_catalog_cursor_invalid';
    end;
  end if;

  v_currency := app_private.current_catalog_currency(null);

  for v_row in
    with selected as (
      select distinct source.collection_id
      from public.deck_inventory_sources as source
      join public.collections as collection
        on collection.id = source.collection_id
      where source.deck_id = p_deck_id
        and collection.status <> 'deleted'::public.resource_status
    )
    select
      card.*,
      legality.legality,
      coalesce(owned.quantity, 0::bigint) as owned_quantity,
      default_printing.id as default_printing_id,
      default_printing.default_finish
    from public.catalog_cards as card
    left join public.catalog_legalities as legality
      on legality.card_id = card.id
      and legality.format_code = v_legality_format_code
    left join lateral (
      select sum(balance.quantity)::bigint as quantity
      from selected
      join public.inventory_balances as balance
        on balance.collection_id = selected.collection_id
        and balance.quantity > 0
      join public.catalog_printings as printing
        on printing.id = balance.printing_id
        and printing.card_id = card.id
    ) as owned on true
    left join lateral (
      select
        printing.id,
        case
          when 'nonfoil'::public.card_finish = any(printing.finishes)
            then 'nonfoil'::public.card_finish
          when 'foil'::public.card_finish = any(printing.finishes)
            then 'foil'::public.card_finish
          when 'etched'::public.card_finish = any(printing.finishes)
            then 'etched'::public.card_finish
          else null
        end as default_finish
      from public.catalog_printings as printing
      where printing.card_id = card.id
        and printing.active
        and not printing.digital
      order by
        printing.is_default_browse desc,
        printing.released_at desc nulls last,
        printing.id
      limit 1
    ) as default_printing on true
    where card.game_id = v_deck.game_id
      and card.active
      and (
        v_query = ''
        or (
          card.normalized_name like
            '%' || app_private.catalog_escape_like(v_query) || '%'
          or card.search_document @@ websearch_to_tsquery(
            'simple'::regconfig,
            v_query
          )
        )
      )
      and (
        v_after_id is null
        or (card.normalized_name, card.id)
          > (v_after_name, v_after_id)
      )
    order by card.normalized_name, card.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'card_id', v_row.id,
        'name', v_row.name,
        'mana_cost', v_row.mana_cost,
        'mana_value', v_row.mana_value,
        'type_line', v_row.type_line,
        'oracle_text', v_row.oracle_text,
        'color_identity', v_row.color_identity,
        'legality', v_row.legality,
        'owned_quantity', v_row.owned_quantity,
        'default_printing',
          case
            when v_row.default_printing_id is null then null
            else app_private.deck_printing_json(
              v_row.default_printing_id,
              v_row.default_finish,
              v_currency
            )
          end
      )
    );
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'deck_id', p_deck_id,
        'query', v_query,
        'catalog_version', v_catalog_version,
        'format_version_id', v_deck.format_version_id,
        'revision', v_deck.current_revision,
        'name', v_row.normalized_name,
        'card_id', v_row.id
      )
    );
  end loop;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'query', v_query,
    'catalog_version', v_catalog_version,
    'format_version_id', v_deck.format_version_id,
    'revision', v_deck.current_revision,
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.deck_revision_history(
  p_deck_id uuid,
  p_limit integer default 50
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

  if p_limit is null or p_limit not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_revision_limit_invalid';
  end if;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'revision_id', revision_row.id,
              'revision', revision_row.revision,
              'reason', revision_row.reason,
              'content_hash', revision_row.content_hash,
              'format_code', revision_row.format_code,
              'rules_version_id', revision_row.rules_version_id,
              'catalog_version', revision_row.catalog_version,
              'actor_user_id', revision_row.actor_user_id,
              'created_at', revision_row.created_at
            )
            order by revision_row.revision desc
          )
          from (
            select revision_record.*
            from public.deck_revisions as revision_record
            where revision_record.deck_id = p_deck_id
            order by revision_record.revision desc
            limit p_limit
          ) as revision_row
        ),
        '[]'::jsonb
      )
  );
end;
$$;

create function public.deck_import_resolve(
  p_deck_id uuid,
  p_names jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_items jsonb := '[]'::jsonb;
  v_catalog_version text;
  v_exact integer := 0;
  v_ambiguous integer := 0;
  v_unresolved integer := 0;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

  if p_names is null
    or jsonb_typeof(p_names) <> 'array'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_import_names_invalid';
  end if;

  if jsonb_array_length(p_names) > 2000
    or pg_column_size(p_names) > 524288
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_import_names_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_names)
      with ordinality as item(value, ordinality)
    where jsonb_typeof(item.value) <> 'object'
      or item.value ->> 'line_id' is null
      or char_length(item.value ->> 'line_id') not between 1 and 128
      or item.value ->> 'name' is null
      or char_length(btrim(item.value ->> 'name')) not between 1 and 512
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_import_names_invalid';
  end if;

  if (
    select count(*) <> count(distinct (item ->> 'line_id'))
    from jsonb_array_elements(p_names) as items(item)
  )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_import_line_ids_duplicate';
  end if;

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

  -- Exact matching is set-based over distinct normalized names. Fuzzy
  -- suggestions use the trigram-index-backed % operator and are intentionally
  -- limited to the first 50 unresolved lines. Ambiguous candidate detail is
  -- limited to 250 lines and five choices per line. All 2,000 input lines are
  -- still classified, while candidate output and fuzzy work remain bounded.
  with input_lines as materialized (
    select
      item.ordinality::integer as line_number,
      item.value ->> 'line_id' as line_id,
      item.value ->> 'name' as input_name,
      app_private.normalize_catalog_search_text(
        item.value ->> 'name'
      ) as normalized_name
    from jsonb_array_elements(p_names)
      with ordinality as item(value, ordinality)
  ),
  distinct_names as materialized (
    select distinct line.normalized_name
    from input_lines as line
  ),
  name_exact_matches as materialized (
    select
      name.normalized_name,
      card.id as card_id,
      card.name,
      card.mana_cost,
      card.type_line,
      card.color_identity,
      row_number() over (
        partition by name.normalized_name
        order by card.name, card.id
      ) as match_rank,
      count(*) over (
        partition by name.normalized_name
      ) as match_count
    from distinct_names as name
    join public.catalog_cards as card
      on card.game_id = v_deck.game_id
      and card.active
      and card.normalized_name = name.normalized_name
  ),
  match_summary as materialized (
    select
      match.normalized_name,
      max(match.match_count)::integer as match_count
    from name_exact_matches as match
    group by match.normalized_name
  ),
  classified as materialized (
    select
      line.*,
      coalesce(summary.match_count, 0) as match_count,
      case
        when summary.match_count = 1 then 'exact'
        when summary.match_count > 1 then 'ambiguous'
        else 'unresolved'
      end as status
    from input_lines as line
    left join match_summary as summary
      on summary.normalized_name = line.normalized_name
  ),
  budgeted as materialized (
    select
      classified.*,
      count(*) filter (where status = 'ambiguous') over (
        order by line_number
        rows between unbounded preceding and current row
      ) as ambiguous_line_rank,
      count(*) filter (where status = 'unresolved') over (
        order by line_number
        rows between unbounded preceding and current row
      ) as suggestion_line_rank
    from classified
  ),
  exact_candidate_rows as materialized (
    select
      line.line_number,
      match.card_id,
      match.name,
      match.mana_cost,
      match.type_line,
      match.color_identity,
      match.match_rank as candidate_rank
    from budgeted as line
    join name_exact_matches as match
      on match.normalized_name = line.normalized_name
    where line.status = 'exact'
      or (
        line.status = 'ambiguous'
        and line.ambiguous_line_rank <= 250
        and match.match_rank <= 5
      )
  ),
  suggestion_candidate_rows as materialized (
    select
      line.line_number,
      suggestion.id as card_id,
      suggestion.name,
      suggestion.mana_cost,
      suggestion.type_line,
      suggestion.color_identity,
      suggestion.candidate_rank
    from budgeted as line
    join lateral (
      select
        card.id,
        card.name,
        card.mana_cost,
        card.type_line,
        card.color_identity,
        row_number() over (
          order by
            extensions.similarity(
              card.normalized_name,
              line.normalized_name
            ) desc,
            card.normalized_name,
            card.id
        ) as candidate_rank
      from public.catalog_cards as card
      where card.game_id = v_deck.game_id
        and card.active
        and card.normalized_name operator(extensions.%)
          line.normalized_name
      order by
        extensions.similarity(
          card.normalized_name,
          line.normalized_name
        ) desc,
        card.normalized_name,
        card.id
      limit 3
    ) as suggestion on true
    where line.status = 'unresolved'
      and char_length(line.normalized_name) >= 3
      and line.suggestion_line_rank <= 50
  ),
  candidate_rows as materialized (
    select * from exact_candidate_rows
    union all
    select * from suggestion_candidate_rows
  ),
  candidate_groups as materialized (
    select
      candidate.line_number,
      count(*)::integer as output_candidate_count,
      jsonb_agg(
        jsonb_build_object(
          'card_id', candidate.card_id,
          'name', candidate.name,
          'mana_cost', candidate.mana_cost,
          'type_line', candidate.type_line,
          'color_identity', candidate.color_identity
        )
        order by candidate.candidate_rank, candidate.name, candidate.card_id
      ) as candidates
    from candidate_rows as candidate
    group by candidate.line_number
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'line_id', line.line_id,
          'input_name', line.input_name,
          'normalized_name', line.normalized_name,
          'status', line.status,
          'candidate_count',
            case
              when line.status = 'unresolved'
                then coalesce(candidates.output_candidate_count, 0)
              else line.match_count
            end,
          'candidates',
            coalesce(candidates.candidates, '[]'::jsonb),
          'candidates_truncated',
            line.status = 'ambiguous'
            and (
              line.ambiguous_line_rank > 250
              or line.match_count > 5
            ),
          'suggestions_omitted',
            line.status = 'unresolved'
            and (
              char_length(line.normalized_name) < 3
              or line.suggestion_line_rank > 50
            )
        )
        order by line.line_number
      ),
      '[]'::jsonb
    ),
    count(*) filter (where line.status = 'exact')::integer,
    count(*) filter (where line.status = 'ambiguous')::integer,
    count(*) filter (where line.status = 'unresolved')::integer
  into v_items, v_exact, v_ambiguous, v_unresolved
  from budgeted as line
  left join candidate_groups as candidates
    on candidates.line_number = line.line_number;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'catalog_version', v_catalog_version,
    'items', v_items,
    'limits',
      jsonb_build_object(
        'max_lines', 2000,
        'max_input_bytes', 524288,
        'max_ambiguous_lines_with_candidates', 250,
        'max_candidates_per_ambiguous_line', 5,
        'max_suggestion_lines', 50,
        'max_suggestions_per_line', 3
      ),
    'counts',
      jsonb_build_object(
        'exact', v_exact,
        'ambiguous', v_ambiguous,
        'unresolved', v_unresolved
      )
  );
end;
$$;

create function public.deck_card_printings(
  p_deck_id uuid,
  p_card_id uuid,
  p_after text default null,
  p_limit integer default 30,
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
  v_cursor jsonb;
  v_after_set text;
  v_after_collector text;
  v_after_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_finishes jsonb;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
  v_catalog_version text;
  v_row record;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

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

  v_currency := app_private.current_catalog_currency(p_currency);

  if p_limit is null
    or p_limit not between 1 and 50
    or not exists (
      select 1
      from public.catalog_cards as card
      where card.id = p_card_id
        and card.game_id = v_deck.game_id
    )
  then
    raise exception using
      errcode = '22023',
      message = 'talence_deck_card_printings_invalid';
  end if;

  if p_after is not null then
    begin
      v_cursor := app_private.inventory_decode_cursor(p_after);
      if (v_cursor ->> 'deck_id')::uuid is distinct from p_deck_id
        or (v_cursor ->> 'card_id')::uuid is distinct from p_card_id
        or v_cursor ->> 'catalog_version'
          is distinct from v_catalog_version
        or v_cursor ->> 'currency' is distinct from v_currency
        or (v_cursor ->> 'revision')::integer
          is distinct from v_deck.current_revision
        or v_cursor ->> 'set_code' is null
        or v_cursor ->> 'collector_number' is null
        or v_cursor ->> 'printing_id' is null
      then
        raise exception 'cursor mismatch';
      end if;
      v_after_set := v_cursor ->> 'set_code';
      v_after_collector := v_cursor ->> 'collector_number';
      v_after_id := (v_cursor ->> 'printing_id')::uuid;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_deck_card_printings_cursor_invalid';
    end;
  end if;

  for v_row in
    select
      printing.*,
      catalog_set.code as set_code,
      catalog_set.name as set_name,
      card.name as card_name,
      first_face.name as face_name,
      first_face.image_small_uri,
      first_face.image_normal_uri
    from public.catalog_printings as printing
    join public.catalog_sets as catalog_set
      on catalog_set.id = printing.set_id
    left join public.catalog_cards as card
      on card.id = printing.card_id
    left join lateral (
      select face.name, face.image_small_uri, face.image_normal_uri
      from public.catalog_faces as face
      where face.printing_id = printing.id
      order by face.face_index
      limit 1
    ) as first_face on true
    where printing.card_id = p_card_id
      and printing.game_id = v_deck.game_id
      and printing.active
      and not printing.digital
      and (
        v_after_id is null
        or (
          catalog_set.code,
          printing.collector_number,
          printing.id
        ) > (
          v_after_set,
          v_after_collector,
          v_after_id
        )
      )
    order by
      catalog_set.code,
      printing.collector_number,
      printing.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'finish', finish.value,
          'owned_quantity', coalesce(owned.quantity, 0::bigint),
          'price',
            case
              when price.amount is null then null
              else jsonb_build_object(
                'amount',
                  to_char(price.amount, 'FM999999999999990.0000'),
                'currency', price.currency,
                'provider', price.provider,
                'finish', price.finish,
                'observed_at', price.observed_at,
                'ingested_at', price.ingested_at,
                'stale_after', price.stale_after,
                'is_stale',
                  price.stale_after is not null
                  and price.stale_after <= statement_timestamp()
              )
            end
        )
        order by case finish.value
          when 'nonfoil'::public.card_finish then 1
          when 'foil'::public.card_finish then 2
          when 'etched'::public.card_finish then 3
          else 4
        end
      ),
      '[]'::jsonb
    )
    into v_finishes
    from unnest(v_row.finishes) as finish(value)
    left join lateral (
      select sum(balance.quantity)::bigint as quantity
      from public.deck_inventory_sources as source
      join public.collections as collection
        on collection.id = source.collection_id
        and collection.status <> 'deleted'::public.resource_status
      join public.inventory_balances as balance
        on balance.collection_id = source.collection_id
        and balance.printing_id = v_row.id
        and balance.finish = finish.value
        and balance.quantity > 0
      where source.deck_id = p_deck_id
    ) as owned on true
    left join lateral (
      select current_price.*
      from public.current_prices as current_price
      where current_price.printing_id = v_row.id
        and current_price.finish = finish.value
        and current_price.currency = v_currency
      order by
        case current_price.provider when 'scryfall' then 1 else 2 end,
        current_price.provider
      limit 1
    ) as price on true
    where finish.value <> 'unknown'::public.card_finish;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'printing_id', v_row.id,
        'card_id', v_row.card_id,
        'display_name', coalesce(
          v_row.printed_name,
          v_row.card_name,
          v_row.face_name,
          v_row.collector_number
        ),
        'set_id', v_row.set_id,
        'set_code', v_row.set_code,
        'set_name', v_row.set_name,
        'collector_number', v_row.collector_number,
        'language', v_row.language,
        'released_at', v_row.released_at,
        'active', v_row.active,
        'image_small_uri', v_row.image_small_uri,
        'image_normal_uri', v_row.image_normal_uri,
        'finishes', v_finishes
      )
    );

    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'deck_id', p_deck_id,
        'card_id', p_card_id,
        'catalog_version', v_catalog_version,
        'currency', v_currency,
        'revision', v_deck.current_revision,
        'set_code', v_row.set_code,
        'collector_number', v_row.collector_number,
        'printing_id', v_row.id
      )
    );
  end loop;

  return jsonb_build_object(
    'deck_id', p_deck_id,
    'card_id', p_card_id,
    'catalog_version', v_catalog_version,
    'revision', v_deck.current_revision,
    'currency', v_currency,
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.deck_export(p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deck public.decks;
  v_plain_text text;
  v_entries jsonb;
  v_catalog_version text;
begin
  v_deck := app_private.assert_human_deck_role(
    p_deck_id,
    'viewer'::public.membership_role,
    true
  );

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

  select string_agg(
    entry.quantity::text || ' ' || card.name
      || case
        when entry.zone = 'mainboard'::public.deck_zone then ''
        else ' [' || entry.zone::text || ']'
      end,
    E'\n'
    order by
      app_private.deck_zone_allocation_rank(entry.zone),
      entry.sort_order,
      card.name,
      entry.id
  )
  into v_plain_text
  from public.deck_entries as entry
  join public.catalog_cards as card on card.id = entry.card_id
  where entry.deck_id = p_deck_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'card_id', entry.card_id,
        'name', card.name,
        'zone', entry.zone,
        'quantity', entry.quantity,
        'preferred_printing_id', entry.preferred_printing_id,
        'preferred_finish', entry.preferred_finish,
        'notes', entry.notes
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

  return jsonb_build_object(
    'catalog_version', v_catalog_version,
    'revision', v_deck.current_revision,
    'plain_text', coalesce(v_plain_text, ''),
    'stable_json',
      jsonb_build_object(
        'schema_version', 1,
        'deck',
          jsonb_build_object(
            'deck_id', v_deck.id,
            'name', v_deck.name,
            'format_code', v_deck.format_code,
            'format_version_id', v_deck.format_version_id,
            'revision', v_deck.current_revision,
            'catalog_version', v_catalog_version
          ),
        'entries', v_entries
      )
  );
end;
$$;

revoke all on function app_private.deck_rules_json(uuid)
  from public, anon, authenticated;
revoke all on function app_private.deck_printing_json(
  uuid,
  public.card_finish,
  text
)
  from public, anon, authenticated;
revoke all on function app_private.deck_zone_allocation_rank(
  public.deck_zone
)
  from public, anon, authenticated;
revoke all on function app_private.deck_ownership_rows(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.calculate_deck_ownership_internal(
  uuid,
  text
)
  from public, anon, authenticated;
revoke all on function app_private.deck_list_ownership_summaries(uuid[])
  from public, anon, authenticated, service_role;

revoke all on function public.calculate_deck_ownership(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_formats_list()
  from public, anon, authenticated, service_role;
revoke all on function public.deck_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_search(
  uuid,
  text,
  text,
  integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_revision_history(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_import_resolve(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_card_printings(
  uuid,
  uuid,
  text,
  integer,
  text
)
  from public, anon, authenticated, service_role;
revoke all on function public.deck_export(uuid)
  from public, anon, authenticated, service_role;
