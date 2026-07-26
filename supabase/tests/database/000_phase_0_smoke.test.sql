begin;

select plan(3);

select has_schema(
  'auth',
  'the local Supabase stack should provide the Auth schema'
);

select has_table(
  'auth',
  'users',
  'the local Supabase stack should provide auth.users'
);

select has_column(
  'auth',
  'users',
  'id',
  'auth.users should expose its canonical id column'
);

select * from finish();

rollback;
