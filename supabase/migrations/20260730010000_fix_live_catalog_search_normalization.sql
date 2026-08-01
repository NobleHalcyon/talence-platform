-- Preserve a deterministic, non-empty search value for legitimate names that
-- contain no alphanumeric characters (for example Scryfall's "_____").

create or replace function app_private.normalize_catalog_search_text(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case
    when btrim(p_value) = '' then ''
    else coalesce(
      nullif(
        btrim(
          regexp_replace(
            regexp_replace(lower(p_value), '[^[:alnum:]]+', ' ', 'g'),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ),
        ''
      ),
      'symbol' || encode(convert_to(lower(btrim(p_value)), 'UTF8'), 'hex')
    )
  end
$$;

revoke all on function app_private.normalize_catalog_search_text(text)
  from public, anon, authenticated;
