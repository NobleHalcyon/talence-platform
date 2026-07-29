-- Phase 1 intentionally seeds no human, invitation, or workspace data.
--
-- Supabase applies this file after all migrations during `db reset`. The
-- required MTG game row is migration-owned because admission finalization needs
-- it in every environment, not only local development. Later phases may add
-- deterministic local fixtures; production identities and secrets never belong
-- here.

begin;

-- Deliberate no-op.
select 1 where false;

commit;
