-- Strengthen server-side value validation and enrich human-readable facets.
-- Function-only migration; no catalog, inventory, or Auth rows are changed.

alter function app_private.catalog_filter_valid(jsonb, integer)
  rename to catalog_filter_valid_pre_details;

create function app_private.catalog_filter_valid(p_node jsonb, p_depth integer default 0)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_field text;
  v_value jsonb;
  v_min numeric;
  v_max numeric;
begin
  if not app_private.catalog_filter_valid_pre_details(p_node, p_depth) then return false; end if;
  if p_node ? 'children' then return true; end if;
  v_field := p_node ->> 'field';
  v_value := p_node -> 'value';

  if v_field in ('cardColor', 'colorIdentity') then
    if exists (
      select 1 from jsonb_array_elements_text(v_value) as selected(value)
      where upper(selected.value) not in ('W', 'U', 'B', 'R', 'G', 'C')
    ) then return false; end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_value) as selected(value)
      where upper(selected.value) = 'C'
    ) and jsonb_array_length(v_value) <> 1 then return false; end if;
  elsif v_field in ('manaValue', 'power', 'toughness', 'loyalty', 'releasedAt', 'ownedQuantity') then
    v_min := nullif(v_value ->> 'min', '')::numeric;
    v_max := nullif(v_value ->> 'max', '')::numeric;
    if v_min is null and v_max is null or v_min is not null and v_max is not null and v_min > v_max
    then return false; end if;
    if v_field in ('manaValue', 'ownedQuantity') and v_min is not null and v_min < 0
    then return false; end if;
    if v_value ? 'includeVariable' and (
      v_field not in ('power', 'toughness', 'loyalty')
      or jsonb_typeof(v_value -> 'includeVariable') <> 'boolean'
    ) then return false; end if;
  elsif v_field = 'legality' and exists (
    select 1 from jsonb_array_elements(v_value -> 'formats') as format(value)
    where jsonb_typeof(format.value) <> 'string'
      or format.value #>> '{}' !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ) then return false;
  end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$$;

revoke all on function app_private.catalog_filter_valid_pre_details(jsonb, integer)
  from public, anon, authenticated;
revoke all on function app_private.catalog_filter_valid(jsonb, integer)
  from public, anon, authenticated;

alter function public.catalog_filter_facets(text, text, integer, text)
  rename to catalog_filter_facets_pre_details;

create function public.catalog_filter_facets(
  p_field text,
  p_query text default null,
  p_limit integer default 40,
  p_after text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_items jsonb;
begin
  v_result := public.catalog_filter_facets_pre_details(p_field, p_query, p_limit, p_after);
  if lower(btrim(p_field)) = 'language' then
    select coalesce(jsonb_agg(item || jsonb_build_object('secondary', item ->> 'value')), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_result -> 'items') as item;
    v_result := jsonb_set(v_result, '{items}', v_items);
  end if;
  return v_result;
end;
$$;

revoke all on function public.catalog_filter_facets_pre_details(text, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.catalog_filter_facets(text, text, integer, text)
  from public, anon, service_role;
grant execute on function public.catalog_filter_facets(text, text, integer, text)
  to authenticated;

comment on function public.catalog_filter_facets(text, text, integer, text) is
  'Returns bounded data-derived options; language options include full name plus provider code.';
