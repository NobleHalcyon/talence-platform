-- Rule-level NOT is explicit in Logic mode. Groups already supported the same
-- flag; this extends validation/evaluation without changing stored rows.

create or replace function app_private.catalog_filter_valid(p_node jsonb, p_depth integer default 0)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_child jsonb;
  v_field text;
  v_comparator text;
  v_value jsonb;
begin
  if p_node is null or jsonb_typeof(p_node) <> 'object' then return false; end if;
  if p_node ? 'children' then
    if p_depth > 2 or p_node ->> 'operator' not in ('and', 'or')
      or jsonb_typeof(p_node -> 'children') <> 'array'
      or jsonb_array_length(p_node -> 'children') > 50
      or p_node ? 'negated' and jsonb_typeof(p_node -> 'negated') <> 'boolean'
    then return false; end if;
    for v_child in select value from jsonb_array_elements(p_node -> 'children') loop
      if not app_private.catalog_filter_valid(v_child, p_depth + 1) then return false; end if;
    end loop;
    return true;
  end if;
  v_field := p_node ->> 'field';
  v_comparator := p_node ->> 'comparator';
  v_value := p_node -> 'value';
  if p_node ? 'negated' and jsonb_typeof(p_node -> 'negated') <> 'boolean' then return false; end if;
  if v_field not in (
    'set', 'language', 'cardColor', 'colorIdentity', 'supertype', 'cardType', 'subtype',
    'manaValue', 'power', 'toughness', 'loyalty', 'legality', 'artist', 'keyword',
    'rulesText', 'rarity', 'finish', 'releasedAt', 'digital', 'defaultObject',
    'condition', 'ownedQuantity'
  ) or v_comparator not in (
    'is', 'isNot', 'any', 'all', 'exactly', 'excludes', 'between', 'contains',
    'doesNotContain', 'exactPhrase'
  ) then return false; end if;
  if v_field in (
    'set', 'language', 'cardColor', 'colorIdentity', 'supertype', 'cardType', 'subtype',
    'artist', 'keyword', 'rarity', 'finish', 'condition'
  ) then
    return v_comparator in ('is', 'isNot', 'any', 'all', 'exactly', 'excludes')
      and jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) between 1 and 50
      and not exists (select 1 from jsonb_array_elements(v_value) as item(value)
        where jsonb_typeof(item.value) <> 'string'
          or char_length(item.value #>> '{}') not between 1 and 200);
  elsif v_field in ('manaValue', 'power', 'toughness', 'loyalty', 'releasedAt', 'ownedQuantity') then
    return v_comparator = 'between' and jsonb_typeof(v_value) = 'object'
      and (not v_value ? 'min' or jsonb_typeof(v_value -> 'min') in ('number', 'null'))
      and (not v_value ? 'max' or jsonb_typeof(v_value -> 'max') in ('number', 'null'));
  elsif v_field in ('digital', 'defaultObject') then
    return v_comparator in ('is', 'isNot') and jsonb_typeof(v_value) = 'boolean';
  elsif v_field = 'rulesText' then
    return v_comparator in ('contains', 'doesNotContain', 'exactPhrase')
      and jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') between 1 and 200;
  elsif v_field = 'legality' then
    return v_comparator in ('is', 'isNot') and jsonb_typeof(v_value) = 'object'
      and v_value ->> 'state' in ('legal', 'restricted', 'banned', 'not_legal')
      and jsonb_typeof(v_value -> 'formats') = 'array'
      and jsonb_array_length(v_value -> 'formats') between 1 and 50;
  end if;
  return false;
end;
$$;

create or replace function app_private.catalog_filter_matches(
  p_node jsonb, p_printing_id uuid, p_card_id uuid,
  p_owned_finish public.card_finish default null,
  p_condition public.card_condition default null,
  p_quantity integer default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_child jsonb;
  v_result boolean;
begin
  if p_node ? 'children' then
    v_result := p_node ->> 'operator' = 'and';
    for v_child in select value from jsonb_array_elements(p_node -> 'children') loop
      if p_node ->> 'operator' = 'and' then
        v_result := v_result and app_private.catalog_filter_matches(
          v_child, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity);
      else
        v_result := v_result or app_private.catalog_filter_matches(
          v_child, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity);
      end if;
    end loop;
  else
    v_result := app_private.catalog_filter_rule_matches(
      p_node, p_printing_id, p_card_id, p_owned_finish, p_condition, p_quantity);
  end if;
  return case when coalesce((p_node ->> 'negated')::boolean, false)
    then not v_result else v_result end;
end;
$$;

revoke all on function app_private.catalog_filter_valid(jsonb, integer)
  from public, anon, authenticated;
revoke all on function app_private.catalog_filter_matches(
  jsonb, uuid, uuid, public.card_finish, public.card_condition, integer
) from public, anon, authenticated;
