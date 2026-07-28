import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import process from "node:process";

import pg from "pg";

const mutationBaseTime = new Date();
mutationBaseTime.setMilliseconds(0);
const INVENTORY_OCCURRED_AT = new Date(mutationBaseTime.getTime() - 60_000).toISOString();
const RUN_STARTED_AT = new Date(mutationBaseTime.getTime() - 120_000).toISOString();
const RUN_COMPLETED_AT = new Date(mutationBaseTime.getTime() - 60_000).toISOString();

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

function localDatabaseUrl() {
  if (process.env.TALENCE_DATABASE_URL) {
    invariant(
      isLoopbackUrl(process.env.TALENCE_DATABASE_URL),
      "phase5_concurrency_requires_disposable_loopback_database",
    );
    return process.env.TALENCE_DATABASE_URL;
  }
  const output = execSync("npx supabase status -o json", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  invariant(firstBrace >= 0 && lastBrace > firstBrace, "local_status_json_missing");
  const status = JSON.parse(output.slice(firstBrace, lastBrace + 1));
  invariant(typeof status.DB_URL === "string", "local_database_url_missing");
  invariant(isLoopbackUrl(status.DB_URL), "phase5_concurrency_refuses_hosted_database");
  return status.DB_URL;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function databaseErrorHas(error, token) {
  return `${error?.code ?? ""} ${error?.message ?? ""} ${error?.detail ?? ""}`
    .toLowerCase()
    .includes(token.toLowerCase());
}

async function connect(databaseUrl, role, userId = null) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  if (userId) {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  }
  if (role) await client.query(`set role ${role}`);
  await client.query("set statement_timeout = '30s'");
  const backend = await client.query("select pg_backend_pid() as pid");
  return { client, pid: backend.rows[0].pid };
}

async function provisionAdmittedOwner(admin, userId, inviteId, email) {
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
    `
      select default_workspace_id, default_collection_id
      from public.profiles
      where user_id = $1
    `,
    [userId],
  );
  invariant(profile.rowCount === 1, "phase5_owner_profile_missing");
  return {
    workspaceId: profile.rows[0].default_workspace_id,
    collectionId: profile.rows[0].default_collection_id,
  };
}

async function seedPrinting(admin, suffix) {
  const setId = randomUUID();
  const cardId = randomUUID();
  const printingId = randomUUID();
  await admin.query(
    `
      insert into public.catalog_sets (
        id, game_id, source_provider, source_id, code, name, digital
      )
      select $1, game.id, 'fixture', $2, $3, 'Phase 5 Concurrency Set', false
      from public.games as game
      where game.code = 'mtg'
    `,
    [setId, `phase5-concurrency-set-${suffix}`, `c${suffix.slice(0, 8)}`],
  );
  await admin.query(
    `
      insert into public.catalog_cards (
        id, game_id, source_provider, source_id, name, normalized_name
      )
      select $1, game.id, 'fixture', $2, 'Concurrency Card', 'concurrency card'
      from public.games as game
      where game.code = 'mtg'
    `,
    [cardId, `phase5-concurrency-card-${suffix}`],
  );
  await admin.query(
    `
      insert into public.catalog_printings (
        id,
        game_id,
        card_id,
        set_id,
        source_provider,
        source_id,
        collector_number,
        language,
        printed_name,
        digital,
        finishes,
        is_default_browse,
        active
      )
      select
        $1,
        game.id,
        $2,
        $3,
        'fixture',
        $4,
        '1',
        'en',
        'Concurrency Card',
        false,
        array['nonfoil'::public.card_finish],
        true,
        true
      from public.games as game
      where game.code = 'mtg'
    `,
    [printingId, cardId, setId, `phase5-concurrency-printing-${suffix}`],
  );
  return printingId;
}

async function createImportFixture(admin, label, observedAt) {
  const sourceId = randomUUID();
  const importId = randomUUID();
  const sourceSha = digest(`${label}:source`);
  const dependencySha = digest(`${label}:sets`);
  await admin.query(
    `
      insert into public.catalog_source_files (
        id,
        provider,
        source_type,
        provider_object_id,
        provider_updated_at,
        download_uri,
        content_type,
        downloaded_size,
        sha256,
        dependency_sha256,
        downloaded_at,
        status
      )
      values (
        $1,
        'scryfall',
        'all_cards',
        $2,
        $3,
        $4,
        'application/json',
        1024,
        $5,
        $6,
        $3::timestamptz + interval '30 seconds',
        'succeeded'
      )
    `,
    [sourceId, label, observedAt, `https://data.scryfall.test/${label}`, sourceSha, dependencySha],
  );
  const identity = await admin.query(
    `
      select
        'mtg-'
          || to_char(
            source.provider_updated_at at time zone 'UTC',
            'YYYYMMDD"T"HH24MISS"Z"'
          )
          || '-'
          || left(source.catalog_identity_sha256, 8)
          || '-s1' as version
      from public.catalog_source_files as source
      where source.id = $1
    `,
    [sourceId],
  );
  const version = identity.rows[0].version;
  await admin.query(
    `
      insert into public.catalog_import_runs (
        id,
        source_file_id,
        status,
        trigger_type,
        started_at,
        completed_at,
        records_seen,
        records_written,
        sets_written,
        cards_written,
        printings_written,
        faces_written,
        prices_written,
        worker_version,
        catalog_version,
        validation_summary
      )
      values (
        $1,
        $2,
        'succeeded',
        'fixture',
        $3::timestamptz + interval '31 seconds',
        $3::timestamptz + interval '32 seconds',
        3,
        3,
        1,
        1,
        1,
        0,
        0,
        'phase5-concurrency',
        $4,
        '{"valid":true}'::jsonb
      )
    `,
    [importId, sourceId, observedAt, version],
  );
  return {
    importId,
    sourceId,
    version,
    observedAt,
    artifactSha: digest(`${label}:artifact`),
  };
}

async function activateImport(admin, fixture) {
  await admin.query(
    `
      update public.catalog_state
      set
        active_import_id = $1,
        active_catalog_version = $2,
        last_successful_source_observed_at = $3,
        current_search_index_version = $2
      where singleton_id = 1
    `,
    [fixture.importId, fixture.version, fixture.observedAt],
  );
}

async function publishSnapshot(client, fixture) {
  const result = await client.query(
    `
      select app_private.catalog_publish_snapshot(
        $1::uuid,
        $2,
        1,
        $3,
        $4,
        8192,
        '{"sets":1,"oracle_cards":1,"printings":1,"faces":0,"prices":0}'::jsonb,
        '0.1.0-alpha.1',
        $5::timestamptz,
        'v1'
      ) as result
    `,
    [
      fixture.importId,
      fixture.version,
      `mtg/${fixture.version}/catalog.sqlite`,
      fixture.artifactSha,
      fixture.observedAt,
    ],
  );
  return result.rows[0].result;
}

async function registerDevice(admin, userId, workspaceId, label) {
  const prefix = randomBytes(6).toString("hex");
  const response = await admin.query(
    `
      select public.device_register(
        $1::uuid,
        $2::uuid,
        $3,
        'talence_sorter',
        'Talence',
        'Concurrency',
        $4,
        $5,
        $6,
        null
      ) as result
    `,
    [userId, workspaceId, label, `SERIAL-${label}`, prefix, digest(`${label}:credential`)],
  );
  const result = response.rows[0].result;
  invariant(
    result?.device?.device_id && result?.credential?.credential_id,
    `device_registration_failed:${label}`,
  );
  return {
    deviceId: result.device.device_id,
    credentialId: result.credential.credential_id,
    prefix,
  };
}

async function replaceGrants(owner, deviceId, collectionId, permissions) {
  const grants =
    permissions.length === 0
      ? []
      : [
          {
            collection_id: collectionId,
            permissions,
          },
        ];
  const result = await owner.query(
    "select public.device_grants_replace($1::uuid, $2::jsonb) as result",
    [deviceId, JSON.stringify(grants)],
  );
  return result.rows[0].result;
}

function inventoryLines(printingId, delta, condition = "near_mint") {
  return [
    {
      line_id: "line-1",
      printing_id: printingId,
      finish: "nonfoil",
      condition,
      quantity_delta: delta,
    },
  ];
}

async function applyDeviceBatch(
  client,
  device,
  collectionId,
  snapshotVersion,
  key,
  printingId,
  delta,
  condition = "near_mint",
) {
  const result = await client.query(
    `
      select public.apply_device_inventory_batch(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        $8::timestamptz,
        null,
        $7::jsonb,
        '{"integration":"phase5-concurrency"}'::jsonb,
        1024
      ) as result
    `,
    [
      device.deviceId,
      device.credentialId,
      randomUUID(),
      collectionId,
      key,
      snapshotVersion,
      JSON.stringify(inventoryLines(printingId, delta, condition)),
      INVENTORY_OCCURRED_AT,
    ],
  );
  return result.rows[0].result;
}

async function createRunSummary(
  client,
  device,
  collectionId,
  snapshotVersion,
  idempotencyKey,
  externalRunId,
  posted = 1,
) {
  const result = await client.query(
    `
      select public.device_api_create_run_summary(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6::uuid,
        'completed',
        $7,
        $9::timestamptz,
        $10::timestamptz,
        $8::jsonb,
        null,
        '{"integration":"phase5-concurrency"}'::jsonb,
        512
      ) as result
    `,
    [
      device.deviceId,
      device.credentialId,
      randomUUID(),
      idempotencyKey,
      externalRunId,
      collectionId,
      snapshotVersion,
      JSON.stringify({
        total: 1,
        recognized: 1,
        unrecognized: 0,
        posted,
      }),
      RUN_STARTED_AT,
      RUN_COMPLETED_AT,
    ],
  );
  return result.rows[0].result;
}

async function waitUntilBlocked(admin, pids, label) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const status = await admin.query(
      `
        select pid, wait_event_type, wait_event
        from pg_stat_activity
        where pid = any($1::integer[])
      `,
      [pids],
    );
    if (
      status.rows.length === pids.length &&
      status.rows.every((row) => row.wait_event_type === "Lock")
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${label}_sessions_did_not_block_as_expected`);
}

async function blockAdvisory(client, identity) {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtextextended($1::text, 0))", [identity]);
}

async function runInventoryIdempotencyRace({
  admin,
  blocker,
  sessionOne,
  sessionTwo,
  device,
  collectionId,
  snapshotVersion,
  printingId,
  suffix,
}) {
  const identicalKey = `phase5-identical-${suffix}`;
  await blockAdvisory(blocker, `talence.device.inventory:${device.deviceId}:${identicalKey}`);
  const identical = [
    applyDeviceBatch(
      sessionOne,
      device,
      collectionId,
      snapshotVersion,
      identicalKey,
      printingId,
      2,
    ),
    applyDeviceBatch(
      sessionTwo,
      device,
      collectionId,
      snapshotVersion,
      identicalKey,
      printingId,
      2,
    ),
  ];
  await waitUntilBlocked(
    admin,
    [sessionOne.processID, sessionTwo.processID],
    "inventory_identical",
  );
  await blocker.query("commit");
  const identicalResults = await Promise.all(identical);
  invariant(
    identicalResults.filter((result) => result.replayed === false).length === 1 &&
      identicalResults.filter((result) => result.replayed === true).length === 1 &&
      new Set(identicalResults.map((result) => result.transaction_id)).size === 1,
    "inventory_identical_replay_not_linearized",
  );

  const conflictKey = `phase5-conflict-${suffix}`;
  await blockAdvisory(blocker, `talence.device.inventory:${device.deviceId}:${conflictKey}`);
  const conflicting = [
    applyDeviceBatch(
      sessionOne,
      device,
      collectionId,
      snapshotVersion,
      conflictKey,
      printingId,
      3,
      "lightly_played",
    ),
    applyDeviceBatch(
      sessionTwo,
      device,
      collectionId,
      snapshotVersion,
      conflictKey,
      printingId,
      4,
      "lightly_played",
    ),
  ];
  await waitUntilBlocked(admin, [sessionOne.processID, sessionTwo.processID], "inventory_conflict");
  await blocker.query("commit");
  const conflictResults = await Promise.allSettled(conflicting);
  invariant(
    conflictResults.filter((result) => result.status === "fulfilled").length === 1 &&
      conflictResults.filter(
        (result) =>
          result.status === "rejected" && databaseErrorHas(result.reason, "idempotency_conflict"),
      ).length === 1,
    "inventory_conflicting_replay_not_linearized",
  );

  const rows = await admin.query(
    `
      select
        count(*) filter (where idempotency_key = $2)::integer as identical_receipts,
        count(*) filter (where idempotency_key = $3)::integer as conflict_receipts
      from public.device_sync_batches
      where device_id = $1
    `,
    [device.deviceId, identicalKey, conflictKey],
  );
  invariant(
    rows.rows[0].identical_receipts === 1 && rows.rows[0].conflict_receipts === 1,
    "inventory_receipt_count_invalid",
  );
}

async function runSummaryIdentityRaces({
  admin,
  blocker,
  sessionOne,
  sessionTwo,
  device,
  collectionId,
  snapshotVersion,
  suffix,
}) {
  const identicalKey = `phase5-run-identical-${suffix}`;
  const identicalExternal = `run-identical-${suffix}`;
  await blockAdvisory(blocker, `talence.device.run.idempotency:${device.deviceId}:${identicalKey}`);
  const identical = [
    createRunSummary(
      sessionOne,
      device,
      collectionId,
      snapshotVersion,
      identicalKey,
      identicalExternal,
    ),
    createRunSummary(
      sessionTwo,
      device,
      collectionId,
      snapshotVersion,
      identicalKey,
      identicalExternal,
    ),
  ];
  await waitUntilBlocked(admin, [sessionOne.processID, sessionTwo.processID], "run_identical");
  await blocker.query("commit");
  const identicalResults = await Promise.all(identical);
  invariant(
    identicalResults.filter((result) => result.replayed === false).length === 1 &&
      identicalResults.filter((result) => result.replayed === true).length === 1 &&
      new Set(identicalResults.map((result) => result.run_summary_id)).size === 1,
    "run_identical_replay_not_linearized",
  );

  const externalId = `run-external-${suffix}`;
  const firstKey = `phase5-run-external-a-${suffix}`;
  const secondKey = `phase5-run-external-b-${suffix}`;
  await blockAdvisory(blocker, `talence.device.run.external:${device.deviceId}:${externalId}`);
  const externalConflict = [
    createRunSummary(sessionOne, device, collectionId, snapshotVersion, firstKey, externalId, 1),
    createRunSummary(sessionTwo, device, collectionId, snapshotVersion, secondKey, externalId, 0),
  ];
  await waitUntilBlocked(admin, [sessionOne.processID, sessionTwo.processID], "run_external");
  await blocker.query("commit");
  const externalResults = await Promise.allSettled(externalConflict);
  invariant(
    externalResults.filter((result) => result.status === "fulfilled").length === 1 &&
      externalResults.filter(
        (result) => result.status === "rejected" && databaseErrorHas(result.reason, "run_conflict"),
      ).length === 1,
    "run_external_identity_conflict_not_linearized",
  );
}

async function blockBalance(blocker, collectionId, printingId, condition) {
  await blocker.query("begin");
  await blocker.query(
    `
      select quantity
      from public.inventory_balances
      where collection_id = $1
        and printing_id = $2
        and finish = 'nonfoil'
        and condition = $3::public.card_condition
      for update
    `,
    [collectionId, printingId, condition],
  );
}

async function runLifecycleRace({
  admin,
  blocker,
  deviceSession,
  ownerSession,
  device,
  collectionId,
  snapshotVersion,
  printingId,
  suffix,
  mode,
}) {
  const condition =
    mode === "suspend" ? "moderately_played" : mode === "credential" ? "heavily_played" : "damaged";
  await applyDeviceBatch(
    deviceSession,
    device,
    collectionId,
    snapshotVersion,
    `phase5-prime-${mode}-${suffix}`,
    printingId,
    1,
    condition,
  );
  const state = await admin.query(
    "select updated_at::text as updated_at from public.devices where id = $1",
    [device.deviceId],
  );
  await blockBalance(blocker, collectionId, printingId, condition);
  const inFlight = applyDeviceBatch(
    deviceSession,
    device,
    collectionId,
    snapshotVersion,
    `phase5-inflight-${mode}-${suffix}`,
    printingId,
    1,
    condition,
  );
  await waitUntilBlocked(admin, [deviceSession.processID], `${mode}_device`);

  let administration;
  if (mode === "suspend") {
    administration = ownerSession.query(
      `
        select public.device_set_status(
          $1::uuid,
          'suspended',
          $2::timestamptz
        ) as result
      `,
      [device.deviceId, state.rows[0].updated_at],
    );
  } else if (mode === "credential") {
    administration = ownerSession.query(
      "select public.device_credential_revoke($1::uuid, $2::uuid) as result",
      [device.deviceId, device.credentialId],
    );
  } else {
    administration = ownerSession.query(
      "select public.device_grants_replace($1::uuid, '[]'::jsonb) as result",
      [device.deviceId],
    );
  }
  await waitUntilBlocked(admin, [ownerSession.processID], `${mode}_administration`);
  await blocker.query("commit");
  const accepted = await inFlight;
  invariant(accepted.replayed === false, `${mode}_inflight_request_not_committed_first`);
  const administrationResult = await Promise.allSettled([administration]);
  invariant(
    administrationResult[0].status === "fulfilled",
    `${mode}_administration_did_not_commit_after_inflight_request`,
  );

  const denial = await Promise.allSettled([
    applyDeviceBatch(
      deviceSession,
      device,
      collectionId,
      snapshotVersion,
      `phase5-after-${mode}-${suffix}`,
      printingId,
      1,
      condition,
    ),
  ]);
  const rejected = denial[0];
  const expectedToken = mode === "grant" ? "grant_denied" : "credential_invalid";
  invariant(
    rejected.status === "rejected" && databaseErrorHas(rejected.reason, expectedToken),
    `${mode}_did_not_deny_subsequent_request`,
  );
}

async function runQuotaRace({ admin, sessionOne, sessionTwo, device }) {
  await admin.query(
    `
      update app_private.device_feature_policies
      set
        per_minute_requests = 1,
        per_day_requests = 2,
        per_day_units = 2
      where feature_key = 'device_heartbeat'
    `,
  );
  await admin.query(
    `
      delete from app_private.device_usage_windows
      where device_id = $1
        and feature_key = 'device_heartbeat'
    `,
    [device.deviceId],
  );
  const heartbeat = (client) =>
    client.query(
      `
        select public.device_api_heartbeat(
          $1::uuid,
          $2::uuid,
          $3::uuid,
          '1.0.0',
          null,
          null,
          '{"ready":true}'::jsonb,
          128
        ) as result
      `,
      [device.deviceId, device.credentialId, randomUUID()],
    );
  const results = await Promise.allSettled([heartbeat(sessionOne), heartbeat(sessionTwo)]);
  invariant(
    results.filter((result) => result.status === "fulfilled").length === 1 &&
      results.filter(
        (result) =>
          result.status === "rejected" && databaseErrorHas(result.reason, "quota_exceeded"),
      ).length === 1,
    "quota_race_did_not_admit_exactly_one_request",
  );
  const usage = await admin.query(
    `
      select request_count, units_consumed
      from app_private.device_usage_windows
      where feature_key = 'device_heartbeat'
        and device_id = $1
    `,
    [device.deviceId],
  );
  invariant(
    usage.rowCount === 2 &&
      usage.rows.every(
        (row) => Number(row.request_count) === 1 && Number(row.units_consumed) === 1,
      ),
    "quota_race_overconsumed_window",
  );
  await admin.query(
    `
      update app_private.device_feature_policies
      set
        per_minute_requests = 12,
        per_day_requests = 10000,
        per_day_units = 10000
      where feature_key = 'device_heartbeat'
    `,
  );
}

async function runSnapshotRaces({
  admin,
  blocker,
  publisherOne,
  publisherTwo,
  fixtureOne,
  fixtureTwo,
}) {
  await activateImport(admin, fixtureOne);
  await blockAdvisory(blocker, "talence:catalog-promotion");
  const publications = [
    publishSnapshot(publisherOne, fixtureOne),
    publishSnapshot(publisherTwo, fixtureOne),
  ];
  await waitUntilBlocked(
    admin,
    [publisherOne.processID, publisherTwo.processID],
    "snapshot_replay",
  );
  await blocker.query("commit");
  const replayResults = await Promise.all(publications);
  invariant(
    replayResults.filter((result) => result.replayed === false).length === 1 &&
      replayResults.filter((result) => result.replayed === true).length === 1 &&
      new Set(replayResults.map((result) => result.snapshot_id)).size === 1,
    "snapshot_replay_not_linearized",
  );
  const firstSnapshotId = replayResults[0].snapshot_id;

  await blocker.query("begin");
  await blocker.query(
    "select pg_advisory_xact_lock(hashtextextended('talence:catalog-promotion', 0))",
  );
  await blocker.query(
    `
      update public.catalog_state
      set
        active_import_id = $1,
        active_catalog_version = $2,
        last_successful_source_observed_at = $3,
        current_search_index_version = $2
      where singleton_id = 1
    `,
    [fixtureTwo.importId, fixtureTwo.version, fixtureTwo.observedAt],
  );
  const stale = publishSnapshot(publisherOne, fixtureOne);
  await waitUntilBlocked(admin, [publisherOne.processID], "snapshot_stale");
  await blocker.query("commit");
  const staleResult = await Promise.allSettled([stale]);
  invariant(
    staleResult[0].status === "rejected" &&
      databaseErrorHas(staleResult[0].reason, "snapshot_stale"),
    "stale_snapshot_publication_was_not_rejected",
  );
  const pointerAfterStale = await admin.query(
    "select current_robot_snapshot_id from public.catalog_state where singleton_id = 1",
  );
  invariant(
    pointerAfterStale.rows[0].current_robot_snapshot_id === firstSnapshotId,
    "stale_snapshot_changed_current_pointer",
  );

  const second = await publishSnapshot(publisherTwo, fixtureTwo);
  invariant(
    second.replayed === false &&
      second.previous_snapshot_id === firstSnapshotId &&
      second.current_snapshot_id === second.snapshot_id,
    "new_snapshot_did_not_retain_previous_pointer",
  );
}

const databaseUrl = localDatabaseUrl();
const runId = randomUUID();
const suffix = runId.replaceAll("-", "").slice(0, 10);
const userId = randomUUID();
const inviteId = randomUUID();
const admin = new pg.Client({ connectionString: databaseUrl });
await admin.connect();

const clients = [];
try {
  const owner = await provisionAdmittedOwner(
    admin,
    userId,
    inviteId,
    `phase5-concurrency-${suffix}@example.test`,
  );
  const printingId = await seedPrinting(admin, suffix);
  const observedBase = new Date(Date.now() - 10 * 60_000);
  observedBase.setMilliseconds(0);
  const fixtureOne = await createImportFixture(
    admin,
    `phase5-snapshot-one-${suffix}`,
    observedBase.toISOString(),
  );
  const fixtureTwo = await createImportFixture(
    admin,
    `phase5-snapshot-two-${suffix}`,
    new Date(observedBase.getTime() + 60_000).toISOString(),
  );

  const blocker = await connect(databaseUrl, null);
  const publisherOne = await connect(databaseUrl, null);
  const publisherTwo = await connect(databaseUrl, null);
  clients.push(blocker.client, publisherOne.client, publisherTwo.client);
  publisherOne.client.processID = publisherOne.pid;
  publisherTwo.client.processID = publisherTwo.pid;
  await runSnapshotRaces({
    admin,
    blocker: blocker.client,
    publisherOne: publisherOne.client,
    publisherTwo: publisherTwo.client,
    fixtureOne,
    fixtureTwo,
  });

  const ownerSession = await connect(databaseUrl, "authenticated", userId);
  const serviceOne = await connect(databaseUrl, "service_role");
  const serviceTwo = await connect(databaseUrl, "service_role");
  const balanceBlocker = await connect(databaseUrl, null);
  clients.push(ownerSession.client, serviceOne.client, serviceTwo.client, balanceBlocker.client);
  serviceOne.client.processID = serviceOne.pid;
  serviceTwo.client.processID = serviceTwo.pid;
  ownerSession.client.processID = ownerSession.pid;

  const primaryDevice = await registerDevice(admin, userId, owner.workspaceId, `Primary-${suffix}`);
  await replaceGrants(ownerSession.client, primaryDevice.deviceId, owner.collectionId, [
    "inventory_read",
    "inventory_write",
    "run_summary_write",
  ]);
  await runInventoryIdempotencyRace({
    admin,
    blocker: blocker.client,
    sessionOne: serviceOne.client,
    sessionTwo: serviceTwo.client,
    device: primaryDevice,
    collectionId: owner.collectionId,
    snapshotVersion: fixtureTwo.version,
    printingId,
    suffix,
  });
  await runSummaryIdentityRaces({
    admin,
    blocker: blocker.client,
    sessionOne: serviceOne.client,
    sessionTwo: serviceTwo.client,
    device: primaryDevice,
    collectionId: owner.collectionId,
    snapshotVersion: fixtureTwo.version,
    suffix,
  });

  for (const mode of ["suspend", "credential", "grant"]) {
    const device = await registerDevice(admin, userId, owner.workspaceId, `${mode}-${suffix}`);
    await replaceGrants(ownerSession.client, device.deviceId, owner.collectionId, [
      "inventory_write",
    ]);
    await runLifecycleRace({
      admin,
      blocker: balanceBlocker.client,
      deviceSession: serviceOne.client,
      ownerSession: ownerSession.client,
      device,
      collectionId: owner.collectionId,
      snapshotVersion: fixtureTwo.version,
      printingId,
      suffix,
      mode,
    });
  }

  const quotaDevice = await registerDevice(admin, userId, owner.workspaceId, `quota-${suffix}`);
  await runQuotaRace({
    admin,
    sessionOne: serviceOne.client,
    sessionTwo: serviceTwo.client,
    device: quotaDevice,
  });

  console.log("Phase 5 device concurrency integration: PASS");
  console.log(`run_id=${runId}`);
  console.log(
    "inventory=identical replay one commit; conflicting same-key one winner and one conflict",
  );
  console.log(
    "runs=identical idempotency replay; external-run identity conflict across distinct keys",
  );
  console.log(
    "lifecycle=in-flight inventory commits before queued suspend, credential revoke, and grant revoke; subsequent calls deny",
  );
  console.log(
    "quota=two concurrent heartbeats serialize to one success and one 429-equivalent denial",
  );
  console.log(
    "snapshots=concurrent publication one create/one replay; stale publisher rejected; previous pointer retained",
  );
} finally {
  for (const client of clients.reverse()) {
    try {
      await client.query("rollback");
    } catch {
      // Ignore cleanup rollback when no transaction is open.
    }
    await client.end();
  }
  await admin.end();
}
