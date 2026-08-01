-- Shared catalog/collection filter foundations. This migration is additive:
-- existing catalog and identity rows are preserved while derived filter columns
-- are backfilled from the canonical imported values.

alter table public.catalog_cards
  add column supertypes text[] not null default '{}'::text[],
  add column card_types text[] not null default '{}'::text[],
  add column subtypes text[] not null default '{}'::text[];

alter table public.catalog_faces
  add column supertypes text[] not null default '{}'::text[],
  add column card_types text[] not null default '{}'::text[],
  add column subtypes text[] not null default '{}'::text[],
  add column power_numeric numeric null,
  add column toughness_numeric numeric null,
  add column loyalty_numeric numeric null;

alter table public.catalog_printings
  add column artists text[] not null default '{}'::text[];

create function app_private.catalog_numeric_stat(p_value text)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when nullif(btrim(p_value), '') ~ '^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$'
    then btrim(p_value)::numeric
    else null
  end
$$;

create function app_private.catalog_type_parts(p_type_line text)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  with faces as (
    select btrim(face_part) as face_part
    from regexp_split_to_table(coalesce(p_type_line, ''), '\s*//\s*') as face_part
    where btrim(face_part) <> ''
  ), split_parts as (
    select
      btrim(split_part(face_part, ' — ', 1)) as left_part,
      nullif(btrim(split_part(face_part, ' — ', 2)), '') as right_part
    from faces
  ), left_words as (
    select distinct word
    from split_parts
    cross join lateral regexp_split_to_table(left_part, '\s+') as word
    where word <> ''
  ), right_words as (
    select distinct word
    from split_parts
    cross join lateral regexp_split_to_table(coalesce(right_part, ''), '\s+') as word
    where word <> ''
  ), supertype_words as (
    select word
    from left_words
    where lower(word) in (
      'basic', 'legendary', 'ongoing', 'snow', 'world', 'elite', 'host'
    )
  ), card_type_words as (
    select word
    from left_words
    where lower(word) not in (
      'basic', 'legendary', 'ongoing', 'snow', 'world', 'elite', 'host'
    )
  )
  select jsonb_build_object(
    'supertypes', coalesce(
      (select jsonb_agg(word order by lower(word)) from supertype_words),
      '[]'::jsonb
    ),
    'card_types', coalesce(
      (select jsonb_agg(word order by lower(word)) from card_type_words),
      '[]'::jsonb
    ),
    'subtypes', coalesce(
      (select jsonb_agg(word order by lower(word)) from right_words),
      '[]'::jsonb
    )
  )
$$;

create function app_private.catalog_apply_card_filter_derivations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_parts jsonb := app_private.catalog_type_parts(new.type_line);
begin
  select coalesce(array_agg(value order by lower(value)), '{}'::text[])
  into new.supertypes
  from jsonb_array_elements_text(v_parts -> 'supertypes') as value;
  select coalesce(array_agg(value order by lower(value)), '{}'::text[])
  into new.card_types
  from jsonb_array_elements_text(v_parts -> 'card_types') as value;
  select coalesce(array_agg(value order by lower(value)), '{}'::text[])
  into new.subtypes
  from jsonb_array_elements_text(v_parts -> 'subtypes') as value;
  return new;
end;
$$;

create function app_private.catalog_apply_face_filter_derivations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_parts jsonb := app_private.catalog_type_parts(new.type_line);
begin
  select coalesce(array_agg(value order by lower(value)), '{}'::text[])
  into new.supertypes
  from jsonb_array_elements_text(v_parts -> 'supertypes') as value;
  select coalesce(array_agg(value order by lower(value)), '{}'::text[])
  into new.card_types
  from jsonb_array_elements_text(v_parts -> 'card_types') as value;
  select coalesce(array_agg(value order by lower(value)), '{}'::text[])
  into new.subtypes
  from jsonb_array_elements_text(v_parts -> 'subtypes') as value;
  new.power_numeric := app_private.catalog_numeric_stat(new.power);
  new.toughness_numeric := app_private.catalog_numeric_stat(new.toughness);
  new.loyalty_numeric := app_private.catalog_numeric_stat(new.loyalty);
  return new;
end;
$$;

create trigger catalog_cards_filter_derivations
before insert or update of type_line on public.catalog_cards
for each row execute function app_private.catalog_apply_card_filter_derivations();

create trigger catalog_faces_filter_derivations
before insert or update of type_line, power, toughness, loyalty on public.catalog_faces
for each row execute function app_private.catalog_apply_face_filter_derivations();

update public.catalog_cards
set type_line = type_line;

update public.catalog_faces
set type_line = type_line,
    power = power,
    toughness = toughness,
    loyalty = loyalty;

update public.catalog_printings as printing
set artists = artist_names.artists
from (
  select
    printing_row.id,
    coalesce(
      array_agg(distinct artist_name order by artist_name)
        filter (where artist_name is not null),
      '{}'::text[]
    ) as artists
  from public.catalog_printings as printing_row
  left join lateral (
    select nullif(btrim(face.artist), '') as artist_name
    from public.catalog_faces as face
    where face.printing_id = printing_row.id
    union
    select nullif(btrim(printing_row.artist), '')
  ) as source_artist on true
  group by printing_row.id
) as artist_names
where artist_names.id = printing.id;

create function app_private.catalog_refresh_printing_artists()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_printing_id uuid;
begin
  v_printing_id := case when tg_op = 'DELETE' then old.printing_id else new.printing_id end;
  update public.catalog_printings as printing
  set artists = coalesce(
    (
      select array_agg(distinct artist_name order by artist_name)
      from (
        select nullif(btrim(face.artist), '') as artist_name
        from public.catalog_faces as face
        where face.printing_id = v_printing_id
        union
        select nullif(btrim(printing.artist), '')
      ) as names
      where artist_name is not null
    ),
    '{}'::text[]
  )
  where printing.id = v_printing_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger catalog_faces_refresh_printing_artists
after insert or delete or update of artist on public.catalog_faces
for each row execute function app_private.catalog_refresh_printing_artists();

create index catalog_cards_supertypes_idx on public.catalog_cards using gin (supertypes);
create index catalog_cards_card_types_idx on public.catalog_cards using gin (card_types);
create index catalog_cards_subtypes_idx on public.catalog_cards using gin (subtypes);
create index catalog_faces_supertypes_idx on public.catalog_faces using gin (supertypes);
create index catalog_faces_card_types_idx on public.catalog_faces using gin (card_types);
create index catalog_faces_subtypes_idx on public.catalog_faces using gin (subtypes);
create index catalog_faces_power_numeric_idx on public.catalog_faces (power_numeric)
  where power_numeric is not null;
create index catalog_faces_toughness_numeric_idx on public.catalog_faces (toughness_numeric)
  where toughness_numeric is not null;
create index catalog_faces_loyalty_numeric_idx on public.catalog_faces (loyalty_numeric)
  where loyalty_numeric is not null;
create index catalog_printings_artists_idx on public.catalog_printings using gin (artists);
create index catalog_printings_artist_trgm_idx
  on public.catalog_printings using gin (lower(artist) gin_trgm_ops)
  where artist is not null;
create index catalog_faces_artist_trgm_idx
  on public.catalog_faces using gin (lower(artist) gin_trgm_ops)
  where artist is not null;
create index catalog_sets_name_trgm_idx
  on public.catalog_sets using gin (lower(name) gin_trgm_ops);

revoke all on function app_private.catalog_numeric_stat(text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_type_parts(text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_apply_card_filter_derivations()
  from public, anon, authenticated;
revoke all on function app_private.catalog_apply_face_filter_derivations()
  from public, anon, authenticated;
revoke all on function app_private.catalog_refresh_printing_artists()
  from public, anon, authenticated;

comment on column public.catalog_cards.supertypes is
  'Derived once during catalog persistence from Scryfall type_line; never parsed in browser code.';
comment on column public.catalog_faces.power_numeric is
  'Numeric projection of Scryfall power. Variable values such as *, X, and expressions remain null.';
comment on column public.catalog_printings.artists is
  'Indexed distinct artist names across the printing and its faces.';
