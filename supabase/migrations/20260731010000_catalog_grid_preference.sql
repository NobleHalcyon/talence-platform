-- New admitted users begin in the visual catalog view. Existing users retain
-- the table/grid choice already stored in their preferences row.

alter table public.user_preferences
  alter column catalog_view set default 'grid';

comment on column public.user_preferences.catalog_view is
  'Persisted catalog presentation preference; new preference rows default to grid.';
