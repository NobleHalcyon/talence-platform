import { createHash, createHmac, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

function invariant(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function assertSafeIntegrationTarget(status) {
  const isLocal = isLoopbackUrl(status.DB_URL) && isLoopbackUrl(status.API_URL);
  invariant(
    isLocal || process.env.TALENCE_ALLOW_HOSTED_PHASE3_INTEGRATION === "1",
    "phase3_integration_refuses_hosted_target_without_explicit_opt_in",
  );
}

function localStatus() {
  if (
    process.env.TALENCE_DATABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_JWT_SECRET
  ) {
    const status = {
      DB_URL: process.env.TALENCE_DATABASE_URL,
      API_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    };
    assertSafeIntegrationTarget(status);
    return status;
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
  assertSafeIntegrationTarget(status);
  return status;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function authenticatedJwt(userId, email, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
      iss: "supabase-demo",
      sub: userId,
      email,
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "test", timestamp: now }],
      session_id: randomUUID(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      is_anonymous: false,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function authenticatedClient(status, userId, email) {
  return createClient(status.API_URL, status.ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${authenticatedJwt(userId, email, status.JWT_SECRET)}`,
      },
    },
  });
}

async function provisionAdmittedUser(client, userId, inviteId, email) {
  await client.query("begin");
  try {
    await client.query(
      `
        insert into app_private.invited_users (id, email, expires_at)
        values ($1, $2, statement_timestamp() + interval '1 day')
      `,
      [inviteId, email],
    );
    await client.query(
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
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("set local role authenticated");
    await client.query("select public.finalize_admitted_user()");
    await client.query("reset role");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function authenticatedDatabaseSession(databaseUrl, userId) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query("set role authenticated");
  await client.query("set statement_timeout = '30s'");
  return client;
}

async function applyInventory(
  client,
  collectionId,
  idempotencyKey,
  occurredAt,
  condition,
  quantityDelta,
  printingId,
) {
  const lines = [
    {
      line_id: "concurrent-line",
      printing_id: printingId,
      finish: "nonfoil",
      condition,
      quantity_delta: quantityDelta,
    },
  ];
  const result = await client.query(
    `
      select public.apply_inventory_transaction(
        $1::uuid,
        $2,
        $3::timestamptz,
        $4::jsonb,
        null,
        null,
        '{"integration":"two-session"}'::jsonb
      ) as result
    `,
    [collectionId, idempotencyKey, occurredAt, JSON.stringify(lines)],
  );
  return result.rows[0].result;
}

const status = localStatus();
const admin = new pg.Client({ connectionString: status.DB_URL });
await admin.connect();

const runId = randomUUID();
const suffix = runId.replaceAll("-", "").slice(0, 10);
const editorUserId = randomUUID();
const viewerUserId = randomUUID();
const editorInviteId = randomUUID();
const viewerInviteId = randomUUID();
const editorEmail = `phase3-editor-${suffix}@example.test`;
const viewerEmail = `phase3-viewer-${suffix}@example.test`;
const setId = randomUUID();
const cardId = randomUUID();
const printingId = randomUUID();
const setCode = `z${suffix}`;
const collectorNumber = "1";

let sessionOne;
let sessionTwo;
try {
  await provisionAdmittedUser(admin, editorUserId, editorInviteId, editorEmail);
  await provisionAdmittedUser(admin, viewerUserId, viewerInviteId, viewerEmail);

  const editorProfile = await admin.query(
    `
      select default_workspace_id, default_collection_id
      from public.profiles
      where user_id = $1
    `,
    [editorUserId],
  );
  const workspaceId = editorProfile.rows[0].default_workspace_id;
  const collectionId = editorProfile.rows[0].default_collection_id;

  await admin.query(
    `
      insert into public.workspace_memberships (
        workspace_id,
        user_id,
        role,
        created_by_user_id
      )
      values ($1, $2, 'viewer', $3)
    `,
    [workspaceId, viewerUserId, editorUserId],
  );

  const game = await admin.query("select id from public.games where code = 'mtg' and active");
  const gameId = game.rows[0].id;
  await admin.query(
    `
      insert into public.catalog_sets (
        id,
        game_id,
        source_provider,
        source_id,
        code,
        name,
        digital
      )
      values ($1, $2, 'fixture', $3, $4, $5, false)
    `,
    [setId, gameId, `integration-set-${runId}`, setCode, `Integration ${suffix}`],
  );
  await admin.query(
    `
      insert into public.catalog_cards (
        id,
        game_id,
        source_provider,
        source_id,
        name,
        normalized_name
      )
      values (
        $1,
        $2,
        'fixture',
        $3,
        $4,
        app_private.normalize_catalog_search_text($4)
      )
    `,
    [cardId, gameId, `integration-card-${runId}`, `Integration ${suffix}`],
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
        is_default_browse
      )
      values (
        $1,
        $2,
        $3,
        $4,
        'fixture',
        $5,
        $6,
        'en',
        $7,
        false,
        array['nonfoil'::public.card_finish],
        true
      )
    `,
    [
      printingId,
      gameId,
      cardId,
      setId,
      `integration-printing-${runId}`,
      collectorNumber,
      `Integration ${suffix}`,
    ],
  );

  const editor = authenticatedClient(status, editorUserId, editorEmail);
  const viewer = authenticatedClient(status, viewerUserId, viewerEmail);
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const csv = [
    "set_code,collector_number,language,finish,condition,quantity",
    `${setCode},${collectorNumber},en,nonfoil,near_mint,1`,
  ].join("\n");
  const bytes = new TextEncoder().encode(csv);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const parserVersion = "phase3-storage-concurrency-v1";
  const createResult = await editor.rpc("inventory_import_create", {
    p_collection_id: collectionId,
    p_original_filename: "integration.csv",
    p_file_size: bytes.byteLength,
    p_file_sha256: sha256,
    p_parser_version: parserVersion,
    p_idempotency_key: `integration-create-${runId}`,
  });
  invariant(!createResult.error, `import_create_failed:${createResult.error?.message}`);
  const job = createResult.data;
  const bucket = editor.storage.from(job.storage_bucket);

  const upload = await bucket.upload(job.storage_path, bytes, {
    contentType: "text/csv",
    metadata: {
      sha256,
      import_job_id: job.import_job_id,
      parser_version: parserVersion,
    },
    upsert: false,
  });
  invariant(!upload.error, `exact_storage_upload_failed:${upload.error?.message}`);

  const stage = await editor.rpc("inventory_import_stage_rows", {
    p_import_job_id: job.import_job_id,
    p_rows: [
      {
        row_number: 2,
        set_code: setCode,
        collector_number: collectorNumber,
        language: "en",
        finish: "nonfoil",
        condition: "near_mint",
        quantity: 1,
      },
    ],
    p_complete: true,
  });
  invariant(!stage.error, `object_bound_stage_failed:${stage.error?.message}`);

  const editorDownload = await bucket.download(job.storage_path);
  invariant(!editorDownload.error, "editor_exact_download_failed");
  invariant((await editorDownload.data.text()) === csv, "editor_download_content_mismatch");

  const viewerDownload = await viewer.storage.from(job.storage_bucket).download(job.storage_path);
  invariant(Boolean(viewerDownload.error), "viewer_download_unexpectedly_succeeded");

  const duplicateUpload = await bucket.upload(job.storage_path, bytes, {
    contentType: "text/csv",
    metadata: {
      sha256,
      import_job_id: job.import_job_id,
      parser_version: parserVersion,
    },
    upsert: false,
  });
  invariant(Boolean(duplicateUpload.error), "duplicate_insert_only_upload_unexpectedly_succeeded");

  const upsert = await bucket.upload(job.storage_path, bytes, {
    contentType: "text/csv",
    metadata: {
      sha256,
      import_job_id: job.import_job_id,
      parser_version: parserVersion,
    },
    upsert: true,
  });
  invariant(Boolean(upsert.error), "authenticated_upsert_unexpectedly_succeeded");

  const wrongPath = `${workspaceId}/${randomUUID()}/source.csv`;
  const wrongPathUpload = await bucket.upload(wrongPath, bytes, {
    contentType: "text/csv",
    metadata: {
      sha256,
      import_job_id: job.import_job_id,
      parser_version: parserVersion,
    },
    upsert: false,
  });
  invariant(Boolean(wrongPathUpload.error), "cross_job_path_upload_unexpectedly_succeeded");

  const editorRemove = await bucket.remove([job.storage_path]);
  invariant(
    Boolean(editorRemove.error) ||
      (Array.isArray(editorRemove.data) && editorRemove.data.length === 0),
    "authenticated_source_delete_reported_a_deleted_object",
  );
  const stillPresent = await bucket.download(job.storage_path);
  invariant(!stillPresent.error, "denied_delete_removed_source_object");

  const cancel = await editor.rpc("inventory_import_cancel", {
    p_import_job_id: job.import_job_id,
  });
  invariant(!cancel.error, `integration_job_cancel_failed:${cancel.error?.message}`);

  const serviceRemove = await service.storage.from(job.storage_bucket).remove([job.storage_path]);
  invariant(!serviceRemove.error, `service_cleanup_failed:${serviceRemove.error?.message}`);
  const afterCleanup = await bucket.download(job.storage_path);
  invariant(Boolean(afterCleanup.error), "service_cleanup_left_source_object");

  sessionOne = await authenticatedDatabaseSession(status.DB_URL, editorUserId);
  sessionTwo = await authenticatedDatabaseSession(status.DB_URL, editorUserId);

  const occurredAt = new Date(Date.now() - 1000).toISOString();
  const identicalKey = `concurrent-identical-${runId}`;
  const identicalResults = await Promise.all([
    applyInventory(sessionOne, collectionId, identicalKey, occurredAt, "near_mint", 3, printingId),
    applyInventory(sessionTwo, collectionId, identicalKey, occurredAt, "near_mint", 3, printingId),
  ]);
  invariant(
    identicalResults[0].transaction_id === identicalResults[1].transaction_id,
    "identical_race_created_multiple_transactions",
  );
  invariant(
    identicalResults.filter((result) => result.replayed === false).length === 1 &&
      identicalResults.filter((result) => result.replayed === true).length === 1,
    "identical_race_replay_flags_invalid",
  );

  const conflictingKey = `concurrent-conflict-${runId}`;
  const conflictingResults = await Promise.allSettled([
    applyInventory(
      sessionOne,
      collectionId,
      conflictingKey,
      occurredAt,
      "lightly_played",
      1,
      printingId,
    ),
    applyInventory(
      sessionTwo,
      collectionId,
      conflictingKey,
      occurredAt,
      "lightly_played",
      2,
      printingId,
    ),
  ]);
  const successfulConflicts = conflictingResults.filter((result) => result.status === "fulfilled");
  const rejectedConflicts = conflictingResults.filter((result) => result.status === "rejected");
  invariant(
    successfulConflicts.length === 1 && rejectedConflicts.length === 1,
    "conflicting_race_did_not_produce_one_winner",
  );
  invariant(
    rejectedConflicts[0].reason?.code === "23505" &&
      rejectedConflicts[0].reason?.message === "talence_inventory_idempotency_conflict",
    "conflicting_race_wrong_error",
  );

  const distinctKeyOne = `concurrent-distinct-a-${runId}`;
  const distinctKeyTwo = `concurrent-distinct-b-${runId}`;
  const distinctResults = await Promise.all([
    applyInventory(
      sessionOne,
      collectionId,
      distinctKeyOne,
      occurredAt,
      "moderately_played",
      4,
      printingId,
    ),
    applyInventory(
      sessionTwo,
      collectionId,
      distinctKeyTwo,
      occurredAt,
      "moderately_played",
      5,
      printingId,
    ),
  ]);
  invariant(
    distinctResults.every((result) => result.replayed === false),
    "distinct_race_unexpected_replay",
  );
  invariant(
    distinctResults[0].transaction_id !== distinctResults[1].transaction_id,
    "distinct_race_reused_transaction",
  );

  const ledgerState = await admin.query(
    `
      select
        (
          select quantity
          from public.inventory_balances
          where collection_id = $1
            and printing_id = $2
            and finish = 'nonfoil'
            and condition = 'near_mint'
        ) as identical_quantity,
        (
          select quantity
          from public.inventory_balances
          where collection_id = $1
            and printing_id = $2
            and finish = 'nonfoil'
            and condition = 'lightly_played'
        ) as conflict_quantity,
        (
          select quantity
          from public.inventory_balances
          where collection_id = $1
            and printing_id = $2
            and finish = 'nonfoil'
            and condition = 'moderately_played'
        ) as distinct_quantity,
        (
          select count(*)::integer
          from public.inventory_transactions
          where collection_id = $1
            and idempotency_key in ($3, $4, $5, $6)
        ) as transaction_count
    `,
    [collectionId, printingId, identicalKey, conflictingKey, distinctKeyOne, distinctKeyTwo],
  );
  invariant(ledgerState.rows[0].identical_quantity === 3, "identical_race_applied_more_than_once");
  invariant(
    [1, 2].includes(ledgerState.rows[0].conflict_quantity),
    "conflicting_race_balance_invalid",
  );
  invariant(ledgerState.rows[0].distinct_quantity === 9, "distinct_race_lost_balance_update");
  invariant(
    ledgerState.rows[0].transaction_count === 4,
    "concurrent_requests_created_extra_history",
  );

  process.stdout.write(
    [
      "Phase 3 Storage + concurrency integration: PASS",
      `run_id=${runId}`,
      "storage=editor exact upload/download; viewer/overwrite/upsert/delete denied; service cleanup passed",
      "concurrency=identical same-key one commit + one replay; conflicting same-key one winner + one 23505 conflict; distinct keys +4/+5 preserve quantity 9",
    ].join("\n") + "\n",
  );
} finally {
  await sessionOne?.end();
  await sessionTwo?.end();
  await admin.end();
}
