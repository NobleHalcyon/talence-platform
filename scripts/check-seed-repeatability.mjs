import pg from "pg";

import { readLocalSupabaseStatus } from "./lib/local-supabase.mjs";
import {
  PRIVATE_BETA_FIXTURE_USERS,
  seedPrivateBetaFixture,
} from "./seed-private-beta-fixture.mjs";

const status = readLocalSupabaseStatus();

async function fixtureState() {
  const database = new pg.Client({ connectionString: status.databaseUrl });
  await database.connect();
  try {
    const state = await database.query(
      `
        select jsonb_build_object(
          'active_catalog_version', (
            select active_catalog_version
            from public.catalog_state
            where singleton_id = 1
          ),
          'catalog_imports', (
            select count(*)::integer
            from public.catalog_import_runs
          ),
          'active_printings', (
            select count(*)::integer
            from public.catalog_printings
            where active
          ),
          'fixture_invitations', (
            select count(*)::integer
            from app_private.invited_users
            where id = any($1::uuid[])
          ),
          'fixture_users', (
            select count(*)::integer
            from auth.users
            where lower(email) = any($2::text[])
          ),
          'fixture_profiles', (
            select count(*)::integer
            from public.profiles
            where user_id in (
              select id
              from auth.users
              where lower(email) = any($2::text[])
            )
          ),
          'fixture_workspaces', (
            select count(distinct profile.default_workspace_id)::integer
            from public.profiles as profile
            where profile.user_id in (
              select id
              from auth.users
              where lower(email) = any($2::text[])
            )
          ),
          'fixture_collections', (
            select count(distinct profile.default_collection_id)::integer
            from public.profiles as profile
            where profile.user_id in (
              select id
              from auth.users
              where lower(email) = any($2::text[])
            )
          ),
          'platform_admins', (
            select count(*)::integer
            from public.platform_user_roles as role
            where role.user_id in (
              select id
              from auth.users
              where lower(email) = any($2::text[])
            )
              and role.role = 'platform_admin'
          )
        ) as state
      `,
      [
        PRIVATE_BETA_FIXTURE_USERS.map((user) => user.invitationId),
        PRIVATE_BETA_FIXTURE_USERS.map((user) => user.email.toLowerCase()),
      ],
    );
    return state.rows[0].state;
  } finally {
    await database.end();
  }
}

await seedPrivateBetaFixture();
const first = await fixtureState();
await seedPrivateBetaFixture();
const second = await fixtureState();

if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error(`private_beta_fixture_seed_not_repeatable:${JSON.stringify({ first, second })}`);
}
if (
  second.fixture_invitations !== 2 ||
  second.fixture_users !== 2 ||
  second.fixture_profiles !== 2 ||
  second.fixture_workspaces !== 2 ||
  second.fixture_collections !== 2 ||
  second.platform_admins !== 1 ||
  second.active_printings < 1
) {
  throw new Error(`private_beta_fixture_seed_incomplete:${JSON.stringify(second)}`);
}

process.stdout.write(
  [
    "Private-beta fixture repeatability: PASS",
    `catalog_version=${second.active_catalog_version}`,
    `catalog_imports=${second.catalog_imports}`,
    `active_printings=${second.active_printings}`,
    "identities=2 admitted users, 2 isolated workspaces, 2 default collections",
    "replay=second seed produced the identical bounded database state",
  ].join("\n") + "\n",
);
