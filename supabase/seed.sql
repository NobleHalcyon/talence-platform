-- Phase 0 intentionally seeds no application or authentication data.
--
-- Supabase applies this file after all migrations during `db reset`. Keeping it
-- schema-independent makes the Phase 0 scaffold repeatable before the Phase 1
-- admission and workspace schema exists. Later phases may add deterministic
-- local fixtures; production data must never be placed here.

begin;

-- Deliberate no-op.
select 1 where false;

commit;
