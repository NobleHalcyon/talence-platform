-- Bounded, data-derived selector options. Large facets never need to be loaded
-- into the browser as one unbounded list.

create function app_private.catalog_language_name(p_code text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(p_code)
    when 'en' then 'English'
    when 'es' then 'Spanish'
    when 'fr' then 'French'
    when 'de' then 'German'
    when 'it' then 'Italian'
    when 'pt' then 'Portuguese'
    when 'ja' then 'Japanese'
    when 'ko' then 'Korean'
    when 'ru' then 'Russian'
    when 'zhs' then 'Simplified Chinese'
    when 'zht' then 'Traditional Chinese'
    when 'he' then 'Hebrew'
    when 'la' then 'Latin'
    when 'grc' then 'Ancient Greek'
    when 'ar' then 'Arabic'
    when 'sa' then 'Sanskrit'
    when 'ph' then 'Phyrexian'
    else upper(p_code)
  end
$$;

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
  v_field text := lower(nullif(btrim(p_field), ''));
  v_query text := lower(nullif(btrim(p_query), ''));
  v_after text := lower(nullif(btrim(p_after), ''));
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next text;
begin
  perform app_private.assert_catalog_reader();
  if v_field not in (
    'set', 'language', 'supertype', 'cardtype', 'subtype', 'artist',
    'keyword', 'format', 'rarity', 'finish'
  ) or p_limit is null or p_limit not between 1 and 100
    or v_query is not null and char_length(v_query) > 100
    or v_after is not null and char_length(v_after) > 200
  then raise exception using errcode = '22023', message = 'talence_catalog_facet_invalid'; end if;

  if v_field = 'set' then
    with options as (
      select jsonb_build_object(
        'value', upper(catalog_set.code),
        'label', catalog_set.name,
        'secondary', upper(catalog_set.code) || case
          when catalog_set.released_at is null then '' else ' · ' || catalog_set.released_at::text end,
        'symbol_uri', '/api/catalog/assets/set/' || lower(catalog_set.code),
        'set_type', catalog_set.set_type,
        'released_at', catalog_set.released_at
      ) as item,
      lower(catalog_set.name) || chr(31) || lower(catalog_set.code) as cursor_value
      from public.catalog_sets as catalog_set
      where catalog_set.active
        and (v_query is null or lower(catalog_set.name) like '%' || app_private.catalog_escape_like(v_query) || '%' escape E'\\'
          or lower(catalog_set.code) like '%' || app_private.catalog_escape_like(v_query) || '%' escape E'\\')
        and (v_after is null or lower(catalog_set.name) || chr(31) || lower(catalog_set.code) > v_after)
      order by lower(catalog_set.name), lower(catalog_set.code)
      limit p_limit + 1
    ), numbered as (select *, row_number() over () as row_number from options)
    select coalesce(jsonb_agg(item order by row_number) filter (where row_number <= p_limit), '[]'::jsonb),
      count(*) > p_limit, max(cursor_value) filter (where row_number = p_limit)
    into v_items, v_has_more, v_next from numbered;
  else
    with raw_values as materialized (
      select distinct lower(value) as value, label
      from (
        select printing.language as value,
          app_private.catalog_language_name(printing.language) as label
        from public.catalog_printings as printing where v_field = 'language' and printing.active
        union all
        select value, value from public.catalog_cards as card
          cross join lateral unnest(card.supertypes) as value
          where v_field = 'supertype' and card.active
        union all
        select value, value from public.catalog_cards as card
          cross join lateral unnest(card.card_types) as value
          where v_field = 'cardtype' and card.active
        union all
        select value, value from public.catalog_faces as face
          cross join lateral unnest(face.subtypes) as value
          where v_field = 'subtype'
        union all
        select value, value from public.catalog_printings as printing
          cross join lateral unnest(printing.artists) as value
          where v_field = 'artist' and printing.active
        union all
        select value, value from public.catalog_cards as card
          cross join lateral unnest(card.keywords) as value
          where v_field = 'keyword' and card.active
        union all
        select legality.format_code, initcap(replace(legality.format_code, '_', ' '))
          from public.catalog_legalities as legality where v_field = 'format'
        union all
        select printing.rarity, initcap(printing.rarity)
          from public.catalog_printings as printing
          where v_field = 'rarity' and printing.active and printing.rarity is not null
        union all
        select finish::text, initcap(finish::text)
          from public.catalog_printings as printing
          cross join lateral unnest(printing.finishes) as finish
          where v_field = 'finish' and printing.active
      ) as source(value, label)
      where value is not null and btrim(value) <> ''
    ), options as (
      select jsonb_build_object('value', value, 'label', min(label)) as item, value as cursor_value
      from raw_values
      where (v_query is null or value like '%' || app_private.catalog_escape_like(v_query) || '%' escape E'\\'
        or lower(label) like '%' || app_private.catalog_escape_like(v_query) || '%' escape E'\\')
        and (v_after is null or value > v_after)
      group by value
      order by value
      limit p_limit + 1
    ), numbered as (select *, row_number() over () as row_number from options)
    select coalesce(jsonb_agg(item order by row_number) filter (where row_number <= p_limit), '[]'::jsonb),
      count(*) > p_limit, max(cursor_value) filter (where row_number = p_limit)
    into v_items, v_has_more, v_next from numbered;
  end if;

  return jsonb_build_object('field', p_field, 'items', v_items,
    'next_cursor', case when v_has_more then v_next else null end, 'has_more', v_has_more);
end;
$$;

revoke all on function app_private.catalog_language_name(text)
  from public, anon, authenticated;
revoke all on function public.catalog_filter_facets(text, text, integer, text)
  from public, anon, service_role;
grant execute on function public.catalog_filter_facets(text, text, integer, text)
  to authenticated;

comment on function public.catalog_filter_facets(text, text, integer, text) is
  'Returns bounded searchable catalog-derived selector options for shared filters.';
