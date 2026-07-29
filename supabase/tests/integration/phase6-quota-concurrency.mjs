import { randomUUID } from "node:crypto";

import pg from "pg";

import { readLocalSupabaseStatus } from "../../../scripts/lib/local-supabase.mjs";

const ATTEMPTS = 8;
const LIMIT = 3;
const status = readLocalSupabaseStatus();

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function quotaExceeded(error, category) {
  return `${error?.code ?? ""} ${error?.message ?? ""} ${error?.detail ?? ""}`
    .toLowerCase()
    .includes(`talence_${category}_quota_exceeded`);
}

async function connect(role, userId = null) {
  const client = new pg.Client({ connectionString: status.databaseUrl });
  await client.connect();
  if (userId) {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  }
  if (role) await client.query(`set role ${role}`);
  await client.query("set statement_timeout = '30s'");
  return client;
}

async function provisionOwner(admin) {
  const inviteId = randomUUID();
  const userId = randomUUID();
  const email = `phase6-quota-${randomUUID()}@example.test`;
  await admin.query("begin");
  try {
    await admin.query(
      `
        insert into app_private.invited_users (id, email, expires_at)
        values ($1, $2, statement_timestamp() + interval '1 day')
      `,
      [inviteId, email],
    );
    await admin.query(
      `
        insert into auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at
        )
        values (
          '00000000-0000-0000-0000-000000000000',
          $1,
          'authenticated',
          'authenticated',
          $2,
          '',
          statement_timestamp(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('invited_user_id', $3::text),
          statement_timestamp(),
          statement_timestamp()
        )
      `,
      [userId, email, inviteId],
    );
    await admin.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await admin.query("set local role authenticated");
    await admin.query("select public.finalize_admitted_user()");
    await admin.query("reset role");
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
  const profile = await admin.query(
    "select default_workspace_id from public.profiles where user_id = $1",
    [userId],
  );
  invariant(profile.rowCount === 1, "phase6_quota_owner_profile_missing");
  return { userId, workspaceId: profile.rows[0].default_workspace_id };
}

async function runConcurrentApplicationQuota(admin, fixture) {
  await admin.query(
    `
      update app_private.application_feature_policies
      set
        enabled = true,
        per_minute_requests = $1,
        per_day_requests = $1,
        per_day_units = $1,
        max_units_per_request = 1
      where feature_key = 'catalog_search'
    `,
    [LIMIT],
  );
  await admin.query(
    "delete from app_private.application_usage_windows where feature_key = 'catalog_search'",
  );

  const sessions = await Promise.all(
    Array.from({ length: ATTEMPTS }, () => connect("authenticated", fixture.userId)),
  );
  try {
    const settled = await Promise.allSettled(
      sessions.map((client) =>
        client.query(
          `
            select public.consume_application_feature_quota(
              'catalog_search',
              $1::uuid,
              1,
              $2::uuid
            ) as result
          `,
          [fixture.workspaceId, randomUUID()],
        ),
      ),
    );
    invariant(
      settled.filter((result) => result.status === "fulfilled").length === LIMIT,
      "application_quota_admitted_the_wrong_number_of_concurrent_requests",
    );
    invariant(
      settled.filter(
        (result) => result.status === "rejected" && quotaExceeded(result.reason, "application"),
      ).length ===
        ATTEMPTS - LIMIT,
      "application_quota_did_not_fail_closed_after_exhaustion",
    );
    const usage = await admin.query(
      `
        select sum(request_count)::integer as request_count, sum(units_consumed)::integer as units
        from app_private.application_usage_windows
        where feature_key = 'catalog_search'
          and user_id = $1
          and workspace_id = $2
          and window_seconds = 86400
      `,
      [fixture.userId, fixture.workspaceId],
    );
    invariant(
      usage.rows[0].request_count === LIMIT && usage.rows[0].units === LIMIT,
      "application_quota_usage_was_not_exact",
    );
  } finally {
    await Promise.allSettled(sessions.map((client) => client.end()));
  }
}

async function runConcurrentExternalQuota(admin, fixture) {
  await admin.query(
    `
      update app_private.external_service_policies
      set
        enabled = true,
        global_daily_units = $1,
        per_user_daily_units = $1,
        per_workspace_daily_units = $1,
        per_device_daily_units = null
      where service_key = 'managed_auth_invitation'
    `,
    [LIMIT],
  );
  await admin.query(
    "delete from app_private.external_service_usage_daily where service_key = 'managed_auth_invitation'",
  );

  const sessions = await Promise.all(
    Array.from({ length: ATTEMPTS }, () => connect("service_role")),
  );
  try {
    const settled = await Promise.allSettled(
      sessions.map((client) =>
        client.query(
          `
            select public.consume_external_service_quota(
              'managed_auth_invitation',
              1,
              $1::uuid,
              $2::uuid,
              null,
              $3::uuid
            ) as result
          `,
          [fixture.userId, fixture.workspaceId, randomUUID()],
        ),
      ),
    );
    invariant(
      settled.filter((result) => result.status === "fulfilled").length === LIMIT,
      "external_quota_admitted_the_wrong_number_of_concurrent_requests",
    );
    invariant(
      settled.filter(
        (result) =>
          result.status === "rejected" && quotaExceeded(result.reason, "external_service"),
      ).length ===
        ATTEMPTS - LIMIT,
      "external_quota_did_not_fail_closed_after_exhaustion",
    );
    const usage = await admin.query(
      `
        select
          count(*)::integer as scope_count,
          min(request_count)::integer as minimum_requests,
          max(request_count)::integer as maximum_requests,
          min(units_consumed)::integer as minimum_units,
          max(units_consumed)::integer as maximum_units
        from app_private.external_service_usage_daily
        where service_key = 'managed_auth_invitation'
      `,
    );
    invariant(
      usage.rows[0].scope_count === 3 &&
        usage.rows[0].minimum_requests === LIMIT &&
        usage.rows[0].maximum_requests === LIMIT &&
        usage.rows[0].minimum_units === LIMIT &&
        usage.rows[0].maximum_units === LIMIT,
      "external_quota_usage_was_not_exact_across_scopes",
    );
  } finally {
    await Promise.allSettled(sessions.map((client) => client.end()));
  }
}

const admin = await connect(null);
try {
  const fixture = await provisionOwner(admin);
  await runConcurrentApplicationQuota(admin, fixture);
  await runConcurrentExternalQuota(admin, fixture);
  process.stdout.write(
    [
      "Phase 6 quota concurrency integration: PASS",
      `attempts=${ATTEMPTS}`,
      `admitted=${LIMIT}`,
      `rejected=${ATTEMPTS - LIMIT}`,
      "application=atomic user/workspace request and work-unit windows",
      "external=atomic global/user/workspace daily reservations",
    ].join("\n") + "\n",
  );
} finally {
  await admin.end();
}
