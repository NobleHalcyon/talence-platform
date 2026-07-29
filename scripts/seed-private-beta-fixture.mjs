import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { readLocalSupabaseStatus, repositoryRoot } from "./lib/local-supabase.mjs";

export const PRIVATE_BETA_FIXTURE_USERS = Object.freeze([
  Object.freeze({
    displayName: "Phase 6 Owner A",
    email: "phase6-owner-a@example.test",
    handle: "phase6-owner-a",
    invitationId: "66000000-0000-4000-8000-000000000001",
    password: "Talence-Phase6-Owner-A-2026!",
    platformAdmin: true,
  }),
  Object.freeze({
    displayName: "Phase 6 Owner B",
    email: "phase6-owner-b@example.test",
    handle: "phase6-owner-b",
    invitationId: "66000000-0000-4000-8000-000000000002",
    password: "Talence-Phase6-Owner-B-2026!",
    platformAdmin: false,
  }),
]);

const FIXTURE_OBSERVED_AT = "2026-07-27T00:00:00Z";

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function importCatalog(status) {
  const pythonLauncher = path.join(repositoryRoot, "scripts", "python.mjs");
  const result = spawnSync(
    process.execPath,
    [
      pythonLauncher,
      "-m",
      "talence_catalog",
      "fixture-import",
      "--observed-at",
      FIXTURE_OBSERVED_AT,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        TALENCE_DATABASE_URL: status.databaseUrl,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  invariant(result.status === 0, "private_beta_catalog_fixture_import_failed");
}

async function findAuthUser(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    invariant(!result.error, "private_beta_auth_user_list_failed");
    const found = result.data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (found) return found;
    if (result.data.users.length < 100) return null;
  }
  throw new Error("private_beta_auth_user_search_exceeded_bound");
}

async function ensureFixtureUser(status, database, fixture) {
  await database.query(
    `
      insert into app_private.invited_users (
        id,
        email,
        expires_at,
        note
      )
      values (
        $1,
        $2,
        statement_timestamp() + interval '7 days',
        'Repeatable local Phase 6 private-beta fixture'
      )
      on conflict (id) do update
      set
        email = excluded.email,
        note = excluded.note
    `,
    [fixture.invitationId, fixture.email],
  );

  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  let user = await findAuthUser(admin, fixture.email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: fixture.email,
      email_confirm: true,
      password: fixture.password,
      user_metadata: {
        display_name: fixture.displayName,
        invited_user_id: fixture.invitationId,
      },
    });
    invariant(!created.error && created.data.user, "private_beta_auth_user_creation_failed");
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      password: fixture.password,
      user_metadata: {
        display_name: fixture.displayName,
        invited_user_id: fixture.invitationId,
      },
    });
    invariant(!updated.error && updated.data.user, "private_beta_auth_user_update_failed");
    user = updated.data.user;
  }

  const admitted = createClient(status.apiUrl, status.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const signedIn = await admitted.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });
  invariant(!signedIn.error && signedIn.data.user, "private_beta_auth_sign_in_failed");
  const finalized = await admitted.rpc("finalize_admitted_user");
  invariant(!finalized.error, "private_beta_admission_finalization_failed");
  const profileUpdate = await admitted
    .from("profiles")
    .update({
      display_name: fixture.displayName,
      handle: fixture.handle,
    })
    .eq("user_id", user.id);
  invariant(!profileUpdate.error, "private_beta_profile_completion_failed");
  await admitted.auth.signOut({ scope: "local" });

  if (fixture.platformAdmin) {
    await database.query(
      `
        insert into public.platform_user_roles (user_id, role)
        values ($1, 'platform_admin')
        on conflict (user_id, role) do nothing
      `,
      [user.id],
    );
  }

  const profile = await database.query(
    `
      select
        default_workspace_id::text as workspace_id,
        default_collection_id::text as collection_id
      from public.profiles
      where user_id = $1
    `,
    [user.id],
  );
  invariant(profile.rowCount === 1, "private_beta_fixture_profile_missing");
  return {
    collectionId: profile.rows[0].collection_id,
    email: fixture.email,
    userId: user.id,
    workspaceId: profile.rows[0].workspace_id,
  };
}

export async function seedPrivateBetaFixture() {
  const status = readLocalSupabaseStatus();
  importCatalog(status);
  const database = new pg.Client({ connectionString: status.databaseUrl });
  await database.connect();
  try {
    const users = [];
    for (const fixture of PRIVATE_BETA_FIXTURE_USERS) {
      users.push(await ensureFixtureUser(status, database, fixture));
    }
    const catalog = await database.query(
      `
        select
          state.active_catalog_version,
          count(printing.id)::integer as active_printings
        from public.catalog_state as state
        cross join public.catalog_printings as printing
        where state.singleton_id = 1
          and printing.active
        group by state.active_catalog_version
      `,
    );
    invariant(
      catalog.rowCount === 1 && catalog.rows[0].active_printings > 0,
      "private_beta_active_catalog_missing",
    );
    return {
      activeCatalogVersion: catalog.rows[0].active_catalog_version,
      activePrintings: catalog.rows[0].active_printings,
      users,
    };
  } finally {
    await database.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await seedPrivateBetaFixture();
  process.stdout.write(
    [
      "Private-beta local fixture seed: PASS",
      `catalog_version=${result.activeCatalogVersion}`,
      `active_printings=${result.activePrintings}`,
      `users=${result.users.length}`,
      `workspaces=${new Set(result.users.map((user) => user.workspaceId)).size}`,
    ].join("\n") + "\n",
  );
}
