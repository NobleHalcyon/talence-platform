-- Phase 5: complete SemVer precedence for snapshot minimum-client matching.
-- Build metadata is ignored, release versions outrank prereleases, numeric
-- identifiers compare numerically, and numeric identifiers have lower
-- precedence than non-numeric identifiers.

create or replace function app_private.device_semver_gte(
  p_actual text,
  p_minimum text
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_actual_match text[];
  v_minimum_match text[];
  v_actual_core numeric[];
  v_minimum_core numeric[];
  v_actual_prerelease text;
  v_minimum_prerelease text;
  v_actual_identifiers text[];
  v_minimum_identifiers text[];
  v_actual_identifier text;
  v_minimum_identifier text;
  v_shared_length integer;
begin
  v_actual_match := regexp_match(
    p_actual,
    '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
  );
  v_minimum_match := regexp_match(
    p_minimum,
    '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
  );

  if v_actual_match is null or v_minimum_match is null then
    return false;
  end if;

  v_actual_core := array[
    v_actual_match[1]::numeric,
    v_actual_match[2]::numeric,
    v_actual_match[3]::numeric
  ];
  v_minimum_core := array[
    v_minimum_match[1]::numeric,
    v_minimum_match[2]::numeric,
    v_minimum_match[3]::numeric
  ];

  if v_actual_core > v_minimum_core then
    return true;
  elsif v_actual_core < v_minimum_core then
    return false;
  end if;

  v_actual_prerelease := v_actual_match[4];
  v_minimum_prerelease := v_minimum_match[4];

  if v_actual_prerelease is null then
    return true;
  elsif v_minimum_prerelease is null then
    return false;
  end if;

  v_actual_identifiers := string_to_array(v_actual_prerelease, '.');
  v_minimum_identifiers := string_to_array(v_minimum_prerelease, '.');

  foreach v_actual_identifier in array v_actual_identifiers loop
    if v_actual_identifier ~ '^[0-9]+$'
      and char_length(v_actual_identifier) > 1
      and left(v_actual_identifier, 1) = '0'
    then
      return false;
    end if;
  end loop;
  foreach v_minimum_identifier in array v_minimum_identifiers loop
    if v_minimum_identifier ~ '^[0-9]+$'
      and char_length(v_minimum_identifier) > 1
      and left(v_minimum_identifier, 1) = '0'
    then
      return false;
    end if;
  end loop;

  v_shared_length := least(
    cardinality(v_actual_identifiers),
    cardinality(v_minimum_identifiers)
  );
  for v_index in 1..v_shared_length loop
    v_actual_identifier := v_actual_identifiers[v_index];
    v_minimum_identifier := v_minimum_identifiers[v_index];

    if v_actual_identifier = v_minimum_identifier then
      continue;
    end if;

    if v_actual_identifier ~ '^[0-9]+$'
      and v_minimum_identifier ~ '^[0-9]+$'
    then
      return v_actual_identifier::numeric > v_minimum_identifier::numeric;
    elsif v_actual_identifier ~ '^[0-9]+$' then
      return false;
    elsif v_minimum_identifier ~ '^[0-9]+$' then
      return true;
    end if;

    return
      v_actual_identifier collate "C"
        > v_minimum_identifier collate "C";
  end loop;

  return cardinality(v_actual_identifiers) >= cardinality(v_minimum_identifiers);
end;
$$;
