-- Resolve an admitted profile handle to the managed Supabase Auth email.
--
-- The function lives in the exposed public schema only so the trusted server
-- client can call it through PostgREST. Execution is restricted to service_role;
-- anonymous and ordinary authenticated callers cannot enumerate the mapping.

create or replace function public.server_resolve_login_email(p_handle text)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select lower(u.email)
  from public.profiles as p
  join auth.users as u
    on u.id = p.user_id
  join app_private.invited_users as invited
    on invited.id = p.admission_invite_id
  where p_handle is not null
    and char_length(btrim(p_handle)) between 3 and 40
    and btrim(p_handle) ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    and p.handle is not null
    and lower(p.handle) = lower(btrim(p_handle))
    and p.status = 'active'::public.profile_status
    and invited.status = 'accepted'::public.invite_status
    and invited.revoked_at is null
    and invited.auth_user_id = p.user_id
    and u.email is not null
  limit 1
$$;

revoke all on function public.server_resolve_login_email(text)
from public, anon, authenticated;
grant execute on function public.server_resolve_login_email(text)
to service_role;

comment on function public.server_resolve_login_email(text) is
  'Service-role-only handle-to-email resolution for managed Supabase Auth login.';
