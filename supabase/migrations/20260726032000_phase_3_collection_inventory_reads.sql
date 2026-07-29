-- Phase 3: collection list/detail, exact-finish inventory pages, and canonical
-- collection summaries. All money values are serialized as decimal strings.

create function app_private.inventory_encode_cursor(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select rtrim(
    translate(
      replace(
        replace(
          encode(convert_to(p_value::text, 'UTF8'), 'base64'),
          E'\n',
          ''
        ),
        E'\r',
        ''
      ),
      '+/',
      '-_'
    ),
    '='
  )
$$;

create function app_private.inventory_decode_cursor(p_value text)
returns jsonb
language plpgsql
stable
strict
set search_path = pg_catalog
as $$
declare
  v_base64 text;
  v_result jsonb;
begin
  if char_length(p_value) not between 8 and 2048
    or p_value !~ '^[A-Za-z0-9_-]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_cursor_invalid';
  end if;

  v_base64 := translate(p_value, '-_', '+/');
  v_base64 := rpad(
    v_base64,
    ((char_length(v_base64) + 3) / 4) * 4,
    '='
  );

  begin
    v_result := convert_from(decode(v_base64, 'base64'), 'UTF8')::jsonb;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_cursor_invalid';
  end;

  if jsonb_typeof(v_result) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'talence_inventory_cursor_invalid';
  end if;

  return v_result;
end;
$$;

create function app_private.collection_inventory_valued_rows(
  p_collection_id uuid,
  p_currency text
)
returns table (
  printing_id uuid,
  card_id uuid,
  set_id uuid,
  set_code text,
  set_name text,
  display_name text,
  normalized_name text,
  colors text[],
  color_identity text[],
  rarity text,
  finish public.card_finish,
  condition public.card_condition,
  quantity integer,
  last_transaction_id uuid,
  updated_at timestamptz,
  price_provider text,
  price_currency text,
  price_amount numeric,
  price_observed_at timestamptz,
  price_ingested_at timestamptz,
  price_stale_after timestamptz,
  price_is_stale boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    printing.id,
    printing.card_id,
    catalog_set.id,
    catalog_set.code,
    catalog_set.name,
    coalesce(
      printing.printed_name,
      card.name,
      first_face.name,
      printing.collector_number
    ),
    app_private.normalize_catalog_search_text(
      coalesce(
        printing.printed_name,
        card.name,
        first_face.name,
        printing.collector_number
      )
    ),
    case
      when card.id is not null then card.colors
      else coalesce(first_face.colors, '{}'::text[])
    end,
    case
      when card.id is not null then card.color_identity
      else printing.color_identity
    end,
    printing.rarity,
    balance.finish,
    balance.condition,
    balance.quantity,
    balance.last_transaction_id,
    balance.updated_at,
    price.provider,
    price.currency,
    price.amount,
    price.observed_at,
    price.ingested_at,
    price.stale_after,
    price.stale_after is not null
      and price.stale_after <= statement_timestamp()
  from public.inventory_balances as balance
  join public.catalog_printings as printing
    on printing.id = balance.printing_id
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  left join lateral (
    select face.name, face.colors
    from public.catalog_faces as face
    where face.printing_id = printing.id
    order by face.face_index
    limit 1
  ) as first_face on true
  left join lateral (
    select current_price.*
    from public.current_prices as current_price
    where current_price.printing_id = printing.id
      and current_price.finish = balance.finish
      and current_price.currency = p_currency
    order by
      case current_price.provider
        when 'scryfall' then 1
        else 2
      end,
      current_price.provider
    limit 1
  ) as price on true
  where balance.collection_id = p_collection_id
    and balance.quantity > 0
$$;

create function app_private.inventory_printing_to_json(
  p_printing_id uuid,
  p_currency text,
  p_finish public.card_finish
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    app_private.catalog_printing_to_json(
      p_printing_id,
      p_currency,
      p_finish
    ),
    jsonb_build_object(
      'printing_id', printing.id,
      'card_id', printing.card_id,
      'display_name', coalesce(
        printing.printed_name,
        card.name,
        first_face.name,
        printing.collector_number
      ),
      'card_name', card.name,
      'printed_name', printing.printed_name,
      'set', jsonb_build_object(
        'id', catalog_set.id,
        'code', catalog_set.code,
        'name', catalog_set.name
      ),
      'collector_number', printing.collector_number,
      'language', printing.language,
      'rarity', printing.rarity,
      'layout', printing.layout,
      'released_at', printing.released_at,
      'digital', printing.digital,
      'promo', printing.promo,
      'oversized', printing.oversized,
      'variation', printing.variation,
      'finishes', printing.finishes,
      'color_identity', case
        when card.id is not null then card.color_identity
        else printing.color_identity
      end,
      'active', printing.active,
      'faces', '[]'::jsonb,
      'prices', '[]'::jsonb,
      'best_price', null
    )
  )
  from public.catalog_printings as printing
  join public.catalog_sets as catalog_set
    on catalog_set.id = printing.set_id
  left join public.catalog_cards as card
    on card.id = printing.card_id
  left join lateral (
    select face.name
    from public.catalog_faces as face
    where face.printing_id = printing.id
    order by face.face_index
    limit 1
  ) as first_face on true
  where printing.id = p_printing_id
$$;

create function app_private.calculate_collection_summary_internal(
  p_collection_id uuid,
  p_currency text,
  p_normalized_query text default null,
  p_set_code text default null,
  p_finish public.card_finish default null,
  p_condition public.card_condition default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_overall jsonb;
  v_by_finish jsonb;
  v_by_condition jsonb;
  v_value_tiers jsonb;
  v_latest_transaction jsonb;
begin
  select jsonb_build_object(
    'collection_id', p_collection_id,
    'currency', p_currency,
    'quantity_total', coalesce(sum(row.quantity), 0),
    'unique_printings', count(distinct row.printing_id),
    'unique_oracle_cards',
      count(distinct row.card_id) filter (where row.card_id is not null),
    'priced_quantity',
      coalesce(
        sum(row.quantity) filter (where row.price_amount is not null),
        0
      ),
    'unpriced_quantity',
      coalesce(
        sum(row.quantity) filter (where row.price_amount is null),
        0
      ),
    'estimated_value',
      case
        when coalesce(
          sum(row.quantity) filter (where row.price_amount is not null),
          0
        ) = 0
        then null
        else round(
          sum(row.price_amount * row.quantity)
            filter (where row.price_amount is not null),
          4
        )::text
      end,
    'oldest_price_observed_at', min(row.price_observed_at),
    'latest_price_observed_at', max(row.price_observed_at),
    'oldest_price_ingested_at', min(row.price_ingested_at),
    'latest_price_ingested_at', max(row.price_ingested_at),
    'price_providers', coalesce(
      to_jsonb(
        array_agg(distinct row.price_provider order by row.price_provider)
          filter (where row.price_provider is not null)
      ),
      '[]'::jsonb
    ),
    'stale_quantity',
      coalesce(
        sum(row.quantity) filter (
          where row.price_amount is not null and row.price_is_stale
        ),
        0
      )
  )
  into v_overall
  from app_private.collection_inventory_valued_rows(
    p_collection_id,
    p_currency
  ) as row
  where (
    p_normalized_query is null
    or row.normalized_name like
      '%' || app_private.catalog_escape_like(p_normalized_query) || '%'
      escape E'\\'
  )
    and (p_set_code is null or row.set_code = p_set_code)
    and (p_finish is null or row.finish = p_finish)
    and (p_condition is null or row.condition = p_condition);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'finish', grouped.finish,
        'quantity_total', grouped.quantity_total,
        'priced_quantity', grouped.priced_quantity,
        'unpriced_quantity', grouped.unpriced_quantity,
        'stale_quantity', grouped.stale_quantity,
        'estimated_value', grouped.estimated_value,
        'price_providers', grouped.price_providers,
        'oldest_price_observed_at', grouped.oldest_price_observed_at,
        'latest_price_observed_at', grouped.latest_price_observed_at,
        'oldest_price_ingested_at', grouped.oldest_price_ingested_at,
        'latest_price_ingested_at', grouped.latest_price_ingested_at
      )
      order by grouped.finish::text
    ),
    '[]'::jsonb
  )
  into v_by_finish
  from (
    select
      row.finish,
      sum(row.quantity) as quantity_total,
      coalesce(
        sum(row.quantity) filter (where row.price_amount is not null),
        0
      ) as priced_quantity,
      coalesce(
        sum(row.quantity) filter (where row.price_amount is null),
        0
      ) as unpriced_quantity,
      coalesce(
        sum(row.quantity) filter (
          where row.price_amount is not null and row.price_is_stale
        ),
        0
      ) as stale_quantity,
      case
        when count(*) filter (where row.price_amount is not null) = 0
        then null
        else round(
          sum(row.price_amount * row.quantity)
            filter (where row.price_amount is not null),
          4
        )::text
      end as estimated_value,
      coalesce(
        array_agg(distinct row.price_provider order by row.price_provider)
          filter (where row.price_provider is not null),
        '{}'::text[]
      ) as price_providers,
      min(row.price_observed_at) as oldest_price_observed_at,
      max(row.price_observed_at) as latest_price_observed_at,
      min(row.price_ingested_at) as oldest_price_ingested_at,
      max(row.price_ingested_at) as latest_price_ingested_at
    from app_private.collection_inventory_valued_rows(
      p_collection_id,
      p_currency
    ) as row
    where (
      p_normalized_query is null
      or row.normalized_name like
        '%' || app_private.catalog_escape_like(p_normalized_query) || '%'
        escape E'\\'
    )
      and (p_set_code is null or row.set_code = p_set_code)
      and (p_finish is null or row.finish = p_finish)
      and (p_condition is null or row.condition = p_condition)
    group by row.finish
  ) as grouped;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'condition', grouped.condition,
        'quantity_total', grouped.quantity_total,
        'priced_quantity', grouped.priced_quantity,
        'unpriced_quantity', grouped.unpriced_quantity,
        'stale_quantity', grouped.stale_quantity,
        'estimated_value', grouped.estimated_value,
        'price_providers', grouped.price_providers,
        'oldest_price_observed_at', grouped.oldest_price_observed_at,
        'latest_price_observed_at', grouped.latest_price_observed_at,
        'oldest_price_ingested_at', grouped.oldest_price_ingested_at,
        'latest_price_ingested_at', grouped.latest_price_ingested_at
      )
      order by grouped.condition::text
    ),
    '[]'::jsonb
  )
  into v_by_condition
  from (
    select
      row.condition,
      sum(row.quantity) as quantity_total,
      coalesce(
        sum(row.quantity) filter (where row.price_amount is not null),
        0
      ) as priced_quantity,
      coalesce(
        sum(row.quantity) filter (where row.price_amount is null),
        0
      ) as unpriced_quantity,
      coalesce(
        sum(row.quantity) filter (
          where row.price_amount is not null and row.price_is_stale
        ),
        0
      ) as stale_quantity,
      case
        when count(*) filter (where row.price_amount is not null) = 0
        then null
        else round(
          sum(row.price_amount * row.quantity)
            filter (where row.price_amount is not null),
          4
        )::text
      end as estimated_value,
      coalesce(
        array_agg(distinct row.price_provider order by row.price_provider)
          filter (where row.price_provider is not null),
        '{}'::text[]
      ) as price_providers,
      min(row.price_observed_at) as oldest_price_observed_at,
      max(row.price_observed_at) as latest_price_observed_at,
      min(row.price_ingested_at) as oldest_price_ingested_at,
      max(row.price_ingested_at) as latest_price_ingested_at
    from app_private.collection_inventory_valued_rows(
      p_collection_id,
      p_currency
    ) as row
    where (
      p_normalized_query is null
      or row.normalized_name like
        '%' || app_private.catalog_escape_like(p_normalized_query) || '%'
        escape E'\\'
    )
      and (p_set_code is null or row.set_code = p_set_code)
      and (p_finish is null or row.finish = p_finish)
      and (p_condition is null or row.condition = p_condition)
    group by row.condition
  ) as grouped;

  select jsonb_build_object(
    'policy',
    jsonb_build_object(
      'currency', p_currency,
      'basis', 'exact_finish_unit_price',
      'upper_bound', 'exclusive'
    ),
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tier_code', grouped.tier_code,
          'label', grouped.label,
          'minimum_unit_value', grouped.minimum_unit_value,
          'maximum_unit_value', grouped.maximum_unit_value,
          'is_unpriced', grouped.is_unpriced,
          'quantity_total', grouped.quantity_total,
          'priced_quantity', grouped.priced_quantity,
          'unpriced_quantity', grouped.unpriced_quantity,
          'stale_quantity', grouped.stale_quantity,
          'estimated_value', grouped.estimated_value,
          'price_providers', grouped.price_providers,
          'oldest_price_observed_at', grouped.oldest_price_observed_at,
          'latest_price_observed_at', grouped.latest_price_observed_at,
          'oldest_price_ingested_at', grouped.oldest_price_ingested_at,
          'latest_price_ingested_at', grouped.latest_price_ingested_at
        )
        order by grouped.sort_order
      ),
      '[]'::jsonb
    )
  )
  into v_value_tiers
  from (
    select
      tier.tier_code,
      tier.sort_order,
      tier.label,
      tier.minimum_unit_value::text as minimum_unit_value,
      tier.maximum_unit_value::text as maximum_unit_value,
      tier.is_unpriced,
      coalesce(sum(row.quantity), 0) as quantity_total,
      coalesce(
        sum(row.quantity) filter (where row.price_amount is not null),
        0
      ) as priced_quantity,
      coalesce(
        sum(row.quantity) filter (where row.price_amount is null),
        0
      ) as unpriced_quantity,
      coalesce(
        sum(row.quantity) filter (
          where row.price_amount is not null and row.price_is_stale
        ),
        0
      ) as stale_quantity,
      case
        when count(row.printing_id) filter (
          where row.price_amount is not null
        ) = 0
        then null
        else round(
          sum(row.price_amount * row.quantity)
            filter (where row.price_amount is not null),
          4
        )::text
      end as estimated_value,
      coalesce(
        array_agg(distinct row.price_provider order by row.price_provider)
          filter (where row.price_provider is not null),
        '{}'::text[]
      ) as price_providers,
      min(row.price_observed_at) as oldest_price_observed_at,
      max(row.price_observed_at) as latest_price_observed_at,
      min(row.price_ingested_at) as oldest_price_ingested_at,
      max(row.price_ingested_at) as latest_price_ingested_at
    from app_private.inventory_value_tiers as tier
    left join app_private.collection_inventory_valued_rows(
      p_collection_id,
      p_currency
    ) as row
      on (
        (
          tier.is_unpriced and row.price_amount is null
        )
        or (
          not tier.is_unpriced
          and row.price_amount is not null
          and row.price_amount >= tier.minimum_unit_value
          and (
            tier.maximum_unit_value is null
            or row.price_amount < tier.maximum_unit_value
          )
        )
      )
      and (
        p_normalized_query is null
        or row.normalized_name like
          '%' || app_private.catalog_escape_like(p_normalized_query) || '%'
          escape E'\\'
      )
      and (p_set_code is null or row.set_code = p_set_code)
      and (p_finish is null or row.finish = p_finish)
      and (p_condition is null or row.condition = p_condition)
    group by
      tier.tier_code,
      tier.sort_order,
      tier.label,
      tier.minimum_unit_value,
      tier.maximum_unit_value,
      tier.is_unpriced
  ) as grouped;

  select jsonb_build_object(
    'transaction_id', transaction.id,
    'source', transaction.source,
    'occurred_at', transaction.occurred_at,
    'committed_at', transaction.committed_at,
    'note', transaction.note
  )
  into v_latest_transaction
  from public.inventory_transactions as transaction
  where transaction.collection_id = p_collection_id
  order by
    transaction.committed_at desc,
    transaction.id desc
  limit 1;

  return v_overall || jsonb_build_object(
    'by_finish', v_by_finish,
    'by_condition', v_by_condition,
    'value_tiers', v_value_tiers,
    'latest_transaction', v_latest_transaction
  );
end;
$$;

create function public.collection_list(
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
  v_currency text;
  v_cursor jsonb;
  v_after_name text;
  v_after_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
  v_can_create boolean;
  v_can_edit boolean;
  v_is_default boolean;
  v_has_positive_balance boolean;
  v_has_nonterminal_import boolean;
begin
  if not app_api.is_admitted_user(auth.uid())
    or not app_api.has_workspace_role(
      p_workspace_id,
      'viewer'::public.membership_role
    )
  then
    raise exception using
      errcode = '42501',
      message = 'talence_collection_list_denied';
  end if;

  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_limit_invalid';
  end if;

  if p_status = 'deleted'::public.resource_status
    or p_status = 'archived'::public.resource_status
      and not p_include_archived
  then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_status_filter_invalid';
  end if;

  v_currency := app_private.current_catalog_currency(null);
  v_can_create := app_api.has_workspace_role(
    p_workspace_id,
    'editor'::public.membership_role
  );

  if p_after is not null then
    v_cursor := app_private.inventory_decode_cursor(p_after);
    begin
      v_after_name := v_cursor ->> 'name';
      v_after_id := (v_cursor ->> 'collection_id')::uuid;
      if (v_cursor ->> 'workspace_id')::uuid <> p_workspace_id
        or coalesce(v_cursor ->> 'status', '') <>
          coalesce(p_status::text, '')
        or (v_cursor ->> 'include_archived')::boolean
          is distinct from p_include_archived
      then
        raise exception 'filter mismatch';
      end if;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_cursor_invalid';
    end;

    if v_after_name is null or v_after_id is null then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_cursor_invalid';
    end if;
  end if;

  for v_row in
    select collection.*
    from public.collections as collection
    where collection.workspace_id = p_workspace_id
      and (
        (
          p_status is not null
          and collection.status = p_status
        )
        or (
          p_status is null
          and (
            collection.status = 'active'::public.resource_status
            or (
              p_include_archived
              and collection.status = 'archived'::public.resource_status
            )
          )
        )
      )
      and (
        v_after_id is null
        or (lower(collection.name), collection.id)
          > (v_after_name, v_after_id)
      )
    order by lower(collection.name), collection.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_summary := app_private.calculate_collection_summary_internal(
      v_row.id,
      v_currency
    );
    v_can_edit := v_can_create;
    select exists (
      select 1
      from public.profiles as profile
      where profile.default_collection_id = v_row.id
    )
    into v_is_default;
    select exists (
      select 1
      from public.inventory_balances as balance
      where balance.collection_id = v_row.id
        and balance.quantity > 0
    )
    into v_has_positive_balance;
    select exists (
      select 1
      from public.inventory_import_jobs as import_job
      where import_job.collection_id = v_row.id
        and import_job.status in (
          'queued'::public.job_status,
          'running'::public.job_status
        )
    )
    into v_has_nonterminal_import;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'collection_id', v_row.id,
        'workspace_id', v_row.workspace_id,
        'game_id', v_row.game_id,
        'name', v_row.name,
        'slug', v_row.slug,
        'description', v_row.description,
        'cover_printing_id', v_row.cover_printing_id,
        'status', v_row.status,
        'created_at', v_row.created_at,
        'updated_at', v_row.updated_at,
        'quantity_total', v_summary -> 'quantity_total',
        'unique_printings', v_summary -> 'unique_printings',
        'estimated_value', v_summary -> 'estimated_value',
        'priced_quantity', v_summary -> 'priced_quantity',
        'unpriced_quantity', v_summary -> 'unpriced_quantity',
        'currency', v_currency,
        'price_providers', v_summary -> 'price_providers',
        'oldest_price_observed_at',
          v_summary -> 'oldest_price_observed_at',
        'latest_price_observed_at',
          v_summary -> 'latest_price_observed_at',
        'oldest_price_ingested_at',
          v_summary -> 'oldest_price_ingested_at',
        'latest_price_ingested_at',
          v_summary -> 'latest_price_ingested_at',
        'latest_transaction_at',
          v_summary #> '{latest_transaction,committed_at}',
        'permissions',
          jsonb_build_object(
            'can_edit', v_can_edit,
            'can_archive',
              v_can_edit
              and v_row.status = 'active'::public.resource_status
              and not v_is_default,
            'can_delete',
              app_api.has_workspace_role(
                p_workspace_id,
                'owner'::public.membership_role
              )
              and not v_is_default
              and not v_has_positive_balance
              and not v_has_nonterminal_import
          )
      )
    );
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'workspace_id', p_workspace_id,
        'name', lower(v_row.name),
        'collection_id', v_row.id,
        'status', p_status,
        'include_archived', p_include_archived
      )
    );
  end loop;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'permissions', jsonb_build_object('can_create', v_can_create),
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

create function public.collection_detail(
  p_collection_id uuid,
  p_currency text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_collection public.collections;
  v_currency text;
  v_can_edit boolean;
  v_can_archive boolean;
  v_can_delete boolean;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'viewer'::public.membership_role,
    false
  );

  select collection.*
  into v_collection
  from public.collections as collection
  where collection.id = p_collection_id
    and collection.status <> 'deleted'::public.resource_status;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talence_collection_not_found';
  end if;

  v_currency := app_private.current_catalog_currency(p_currency);
  v_can_edit := app_api.has_workspace_role(
    v_collection.workspace_id,
    'editor'::public.membership_role
  );
  v_can_archive := v_can_edit
    and v_collection.status = 'active'::public.resource_status
    and not exists (
      select 1
      from public.profiles as profile
      where profile.default_collection_id = v_collection.id
    );
  v_can_delete := app_api.has_workspace_role(
    v_collection.workspace_id,
    'owner'::public.membership_role
  )
    and not exists (
      select 1
      from public.profiles as profile
      where profile.default_collection_id = v_collection.id
    )
    and not exists (
      select 1
      from public.inventory_balances as balance
      where balance.collection_id = v_collection.id
        and balance.quantity > 0
    )
    and not exists (
      select 1
      from public.inventory_import_jobs as import_job
      where import_job.collection_id = v_collection.id
        and import_job.status in (
          'queued'::public.job_status,
          'running'::public.job_status
        )
    );

  return jsonb_build_object(
    'collection',
    app_private.collection_mutation_json(v_collection.id)
      || jsonb_build_object(
        'cover_printing',
        case
          when v_collection.cover_printing_id is null then null
          else app_private.inventory_printing_to_json(
            v_collection.cover_printing_id,
            v_currency,
            null
          )
        end
      ),
    'permissions',
    jsonb_build_object(
      'can_edit', v_can_edit,
      'can_archive', v_can_archive,
      'can_delete', v_can_delete
    ),
    'summary',
    app_private.calculate_collection_summary_internal(
      v_collection.id,
      v_currency
    )
  );
end;
$$;

create function public.calculate_collection_summary(
  p_collection_id uuid,
  p_currency text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_currency text;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'viewer'::public.membership_role,
    false
  );
  v_currency := app_private.current_catalog_currency(p_currency);

  return app_private.calculate_collection_summary_internal(
    p_collection_id,
    v_currency
  );
end;
$$;

create function public.collection_inventory_page(
  p_collection_id uuid,
  p_query text default null,
  p_set_code text default null,
  p_finish public.card_finish default null,
  p_condition public.card_condition default null,
  p_sort text default 'name',
  p_after text default null,
  p_limit integer default 50,
  p_currency text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_normalized_query text;
  v_set_code text := lower(nullif(btrim(p_set_code), ''));
  v_sort text := lower(nullif(btrim(p_sort), ''));
  v_currency text;
  v_cursor jsonb;
  v_cursor_printing_id uuid;
  v_cursor_finish public.card_finish;
  v_cursor_condition public.card_condition;
  v_after_rank bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_next_cursor text;
begin
  perform app_private.assert_human_collection_role(
    p_collection_id,
    'viewer'::public.membership_role,
    false
  );

  if p_limit is null
    or p_limit not between 1 and 100
    or v_sort not in (
      'name',
      'updated_desc',
      'quantity_desc',
      'value_desc'
    )
    or v_query is not null and char_length(v_query) not between 2 and 200
    or v_set_code is not null
      and v_set_code !~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  then
    raise exception using
      errcode = '22023',
      message = 'talence_collection_inventory_filter_invalid';
  end if;

  v_currency := app_private.current_catalog_currency(p_currency);
  v_normalized_query := case
    when v_query is null then null
    else app_private.normalize_catalog_search_text(v_query)
  end;

  if p_after is not null then
    v_cursor := app_private.inventory_decode_cursor(p_after);
    begin
      if (v_cursor ->> 'collection_id')::uuid <> p_collection_id
        or v_cursor ->> 'sort' <> v_sort
        or coalesce(v_cursor ->> 'query', '')
          <> coalesce(v_normalized_query, '')
        or coalesce(v_cursor ->> 'set_code', '')
          <> coalesce(v_set_code, '')
        or coalesce(v_cursor ->> 'filter_finish', '')
          <> coalesce(p_finish::text, '')
        or coalesce(v_cursor ->> 'filter_condition', '')
          <> coalesce(p_condition::text, '')
        or v_cursor ->> 'currency' <> v_currency
      then
        raise exception 'filter mismatch';
      end if;
      v_cursor_printing_id := (v_cursor ->> 'printing_id')::uuid;
      v_cursor_finish :=
        (v_cursor ->> 'row_finish')::public.card_finish;
      v_cursor_condition :=
        (v_cursor ->> 'row_condition')::public.card_condition;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'talence_inventory_cursor_invalid';
    end;

    with candidates as (
      select row.*
      from app_private.collection_inventory_valued_rows(
        p_collection_id,
        v_currency
      ) as row
      where (
        v_normalized_query is null
        or row.normalized_name like
          '%' || app_private.catalog_escape_like(v_normalized_query) || '%'
          escape E'\\'
      )
        and (v_set_code is null or row.set_code = v_set_code)
        and (p_finish is null or row.finish = p_finish)
        and (p_condition is null or row.condition = p_condition)
    ),
    ranked as (
      select
        candidates.*,
        row_number() over (
          order by
            case when v_sort = 'name' then candidates.normalized_name end,
            case when v_sort = 'updated_desc'
              then candidates.updated_at end desc,
            case when v_sort = 'quantity_desc'
              then candidates.quantity end desc,
            case when v_sort = 'value_desc'
              then (candidates.price_amount is null)::integer end,
            case when v_sort = 'value_desc'
              then candidates.price_amount * candidates.quantity end desc,
            candidates.printing_id,
            candidates.finish::text,
            candidates.condition::text
        ) as row_rank
      from candidates
    )
    select ranked.row_rank
    into v_after_rank
    from ranked
    where ranked.printing_id = v_cursor_printing_id
      and ranked.finish = v_cursor_finish
      and ranked.condition = v_cursor_condition;

    if v_after_rank is null then
      raise exception using
        errcode = '22023',
        message = 'talence_inventory_cursor_invalid';
    end if;
  end if;

  for v_row in
    with candidates as (
      select row.*
      from app_private.collection_inventory_valued_rows(
        p_collection_id,
        v_currency
      ) as row
      where (
        v_normalized_query is null
        or row.normalized_name like
          '%' || app_private.catalog_escape_like(v_normalized_query) || '%'
          escape E'\\'
      )
        and (v_set_code is null or row.set_code = v_set_code)
        and (p_finish is null or row.finish = p_finish)
        and (p_condition is null or row.condition = p_condition)
    ),
    ranked as (
      select
        candidates.*,
        row_number() over (
          order by
            case when v_sort = 'name' then candidates.normalized_name end,
            case when v_sort = 'updated_desc'
              then candidates.updated_at end desc,
            case when v_sort = 'quantity_desc'
              then candidates.quantity end desc,
            case when v_sort = 'value_desc'
              then (candidates.price_amount is null)::integer end,
            case when v_sort = 'value_desc'
              then candidates.price_amount * candidates.quantity end desc,
            candidates.printing_id,
            candidates.finish::text,
            candidates.condition::text
        ) as row_rank
      from candidates
    )
    select ranked.*
    from ranked
    where ranked.row_rank > v_after_rank
    order by ranked.row_rank
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'printing_id', v_row.printing_id,
        'finish', v_row.finish,
        'condition', v_row.condition,
        'quantity', v_row.quantity,
        'last_transaction_id', v_row.last_transaction_id,
        'updated_at', v_row.updated_at,
        'printing', app_private.inventory_printing_to_json(
          v_row.printing_id,
          v_currency,
          v_row.finish
        ),
        'current_price',
          case
            when v_row.price_amount is null then null
            else jsonb_build_object(
              'provider', v_row.price_provider,
              'currency', v_row.price_currency,
              'finish', v_row.finish,
              'amount', v_row.price_amount::text,
              'observed_at', v_row.price_observed_at,
              'ingested_at', v_row.price_ingested_at,
              'stale_after', v_row.price_stale_after,
              'is_stale', v_row.price_is_stale
            )
          end,
        'total_estimate',
          case
            when v_row.price_amount is null then null
            else round(v_row.price_amount * v_row.quantity, 4)::text
          end
      )
    );
    v_next_cursor := app_private.inventory_encode_cursor(
      jsonb_build_object(
        'collection_id', p_collection_id,
        'sort', v_sort,
        'query', v_normalized_query,
        'set_code', v_set_code,
        'filter_finish', p_finish,
        'filter_condition', p_condition,
        'currency', v_currency,
        'printing_id', v_row.printing_id,
        'row_finish', v_row.finish,
        'row_condition', v_row.condition
      )
    );
  end loop;

  return jsonb_build_object(
    'collection_id', p_collection_id,
    'currency', v_currency,
    'items', v_items,
    'next_cursor', case when v_has_more then v_next_cursor else null end,
    'has_more', v_has_more
  );
end;
$$;

revoke all on function app_private.inventory_encode_cursor(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.inventory_decode_cursor(text)
  from public, anon, authenticated;
revoke all on function app_private.collection_inventory_valued_rows(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.inventory_printing_to_json(
  uuid,
  text,
  public.card_finish
)
  from public, anon, authenticated;
revoke all on function app_private.calculate_collection_summary_internal(
  uuid,
  text,
  text,
  text,
  public.card_finish,
  public.card_condition
)
  from public, anon, authenticated;

revoke all on function public.collection_list(
  uuid,
  boolean,
  text,
  integer,
  public.resource_status
)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_detail(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.calculate_collection_summary(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.collection_inventory_page(
  uuid,
  text,
  text,
  public.card_finish,
  public.card_condition,
  text,
  text,
  integer,
  text
)
  from public, anon, authenticated, service_role;
