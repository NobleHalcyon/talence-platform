import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import process from "node:process";
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

function assertSafeIntegrationTarget(databaseUrl) {
  invariant(isLoopbackUrl(databaseUrl), "phase4_integration_requires_disposable_loopback_database");
}

function localDatabaseUrl() {
  if (process.env.TALENCE_DATABASE_URL) {
    assertSafeIntegrationTarget(process.env.TALENCE_DATABASE_URL);
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
  assertSafeIntegrationTarget(status.DB_URL);
  return status.DB_URL;
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
  const backend = await client.query("select pg_backend_pid() as pid");
  return { client, pid: backend.rows[0].pid };
}

async function createDeck(client, workspaceId, name = "Concurrent Revision Baseline") {
  const result = await client.query(
    `
      select public.deck_create(
        $1::uuid,
        $2,
        'modern',
        null,
        null,
        '{}'::text[],
        '{}'::uuid[]
      ) as result
    `,
    [workspaceId, name],
  );
  return result.rows[0].result;
}

async function createCollection(client, workspaceId, name) {
  const result = await client.query(
    `
      select public.collection_create(
        $1::uuid,
        $2,
        null,
        null
      ) as result
    `,
    [workspaceId, name],
  );
  return result.rows[0].result;
}

async function updateDeck(client, deckId, name, expectedRevision = 1) {
  const result = await client.query(
    `
      select public.deck_update(
        $1::uuid,
        $2,
        null,
        null,
        '{}'::text[],
        'modern',
        null,
        null,
        $3
      ) as result
    `,
    [deckId, name, expectedRevision],
  );
  return result.rows[0].result;
}

async function archiveDeck(client, deckId, expectedRevision) {
  const result = await client.query("select public.deck_archive($1::uuid, $2::integer) as result", [
    deckId,
    expectedRevision,
  ]);
  return result.rows[0].result;
}

async function replaceDeckSources(client, deckId, collectionIds) {
  const result = await client.query(
    `
      select public.deck_sources_replace(
        $1::uuid,
        $2::uuid[],
        1
      ) as result
    `,
    [deckId, collectionIds],
  );
  return result.rows[0].result;
}

async function deleteCollection(client, collectionId, updatedAt) {
  const result = await client.query(
    `
      select public.collection_delete(
        $1::uuid,
        $2::timestamptz
      ) as result
    `,
    [collectionId, updatedAt],
  );
  return result.rows[0].result;
}

async function validateDeck(client, deckId) {
  const result = await client.query("select public.validate_deck($1::uuid) as result", [deckId]);
  return result.rows[0].result;
}

async function addDeckEntry(client, deckId, cardId, expectedRevision = 1) {
  const result = await client.query(
    `
      select public.deck_entry_add(
        $1::uuid,
        $2::uuid,
        'mainboard',
        1,
        $3
      ) as result
    `,
    [deckId, cardId, expectedRevision],
  );
  return result.rows[0].result;
}

async function updateDeckEntry(client, entryId, expectedRevision) {
  const result = await client.query(
    `
      select public.deck_entry_update(
        $1::uuid,
        2,
        'sideboard',
        null,
        null,
        'concurrent update',
        $2::integer
      ) as result
    `,
    [entryId, expectedRevision],
  );
  return result.rows[0].result;
}

async function removeDeckEntry(client, entryId, expectedRevision) {
  const result = await client.query(
    "select public.deck_entry_remove($1::uuid, $2::integer) as result",
    [entryId, expectedRevision],
  );
  return result.rows[0].result;
}

async function waitForLockWaiters(admin, backendPids) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await admin.query(
      `
        select count(*)::integer as waiting
        from pg_catalog.pg_stat_activity
        where pid = any($1::integer[])
          and state = 'active'
          and wait_event_type = 'Lock'
      `,
      [backendPids],
    );
    if (state.rows[0].waiting === backendPids.length) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("concurrent_operations_did_not_reach_lock_barrier");
}

const databaseUrl = localDatabaseUrl();
const admin = new pg.Client({ connectionString: databaseUrl });
await admin.connect();

const runId = randomUUID();
const suffix = runId.replaceAll("-", "").slice(0, 10);
const userId = randomUUID();
const inviteId = randomUUID();
const email = `phase4-concurrency-${suffix}@example.test`;
let sessionOne;
let sessionTwo;
let adminHoldingBarrier = false;
let sessionOneInTransaction = false;
const launchedOperations = [];

function trackOperation(promise) {
  launchedOperations.push(promise);
  promise.catch(() => {});
  return promise;
}

try {
  await provisionAdmittedUser(admin, userId, inviteId, email);
  const profile = await admin.query(
    `
      select default_workspace_id
      from public.profiles
      where user_id = $1
    `,
    [userId],
  );
  const workspaceId = profile.rows[0].default_workspace_id;

  sessionOne = await authenticatedDatabaseSession(databaseUrl, userId);
  sessionTwo = await authenticatedDatabaseSession(databaseUrl, userId);
  const created = await createDeck(sessionOne.client, workspaceId);
  const deckId = created.deck.deck_id;
  invariant(created.deck.current_revision === 1, "created_deck_revision_not_one");

  await admin.query("begin");
  adminHoldingBarrier = true;
  await admin.query("select id from public.decks where id = $1 for update", [deckId]);

  const firstName = `Concurrent Winner A ${suffix}`;
  const secondName = `Concurrent Winner B ${suffix}`;
  const updates = [
    trackOperation(updateDeck(sessionOne.client, deckId, firstName)),
    trackOperation(updateDeck(sessionTwo.client, deckId, secondName)),
  ];

  await waitForLockWaiters(admin, [sessionOne.pid, sessionTwo.pid]);
  await admin.query("commit");
  adminHoldingBarrier = false;

  const settled = await Promise.allSettled(updates);
  const fulfilled = settled.filter((result) => result.status === "fulfilled");
  const rejected = settled.filter((result) => result.status === "rejected");
  invariant(
    fulfilled.length === 1 && rejected.length === 1,
    "concurrent_revision_race_did_not_produce_one_winner",
  );
  invariant(
    rejected[0].reason?.code === "40001" && rejected[0].reason?.message === "talence_deck_stale",
    "concurrent_revision_race_wrong_loser_error",
  );

  const winningName = fulfilled[0].value.deck.name;
  invariant(
    winningName === firstName || winningName === secondName,
    "concurrent_revision_race_unknown_winner",
  );

  const finalState = await admin.query(
    `
      select
        deck.name,
        deck.current_revision,
        (
          select count(*)::integer
          from public.deck_revisions as revision
          where revision.deck_id = deck.id
        ) as revision_count,
        (
          select revision.snapshot #>> '{logical_content,deck,name}'
          from public.deck_revisions as revision
          where revision.deck_id = deck.id
          order by revision.revision desc
          limit 1
        ) as latest_snapshot_name
      from public.decks as deck
      where deck.id = $1
    `,
    [deckId],
  );
  invariant(finalState.rows.length === 1, "concurrent_deck_final_state_missing");
  invariant(finalState.rows[0].name === winningName, "concurrent_deck_lost_winner_name");
  invariant(finalState.rows[0].current_revision === 2, "concurrent_deck_revision_not_two");
  invariant(finalState.rows[0].revision_count === 2, "concurrent_deck_extra_revision");
  invariant(
    finalState.rows[0].latest_snapshot_name === winningName,
    "concurrent_deck_snapshot_does_not_match_winner",
  );

  const entryRaceCardId = randomUUID();
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
        '00000000-0000-4000-8000-000000000001',
        'fixture',
        $2,
        $3,
        app_private.normalize_catalog_search_text($3)
      )
    `,
    [entryRaceCardId, `phase4-entry-race-card-${runId}`, `Entry Race Card ${suffix}`],
  );

  const updateRaceDeck = await createDeck(
    sessionOne.client,
    workspaceId,
    `Entry Update Race ${suffix}`,
  );
  const updateRaceDeckId = updateRaceDeck.deck.deck_id;
  const updateRaceEntry = await addDeckEntry(sessionOne.client, updateRaceDeckId, entryRaceCardId);
  const updateRaceEntryId = updateRaceEntry.entry.entry_id;

  await sessionOne.client.query("begin");
  sessionOneInTransaction = true;
  const winningRemove = await removeDeckEntry(sessionOne.client, updateRaceEntryId, 2);
  const losingUpdate = trackOperation(updateDeckEntry(sessionTwo.client, updateRaceEntryId, 2));
  await waitForLockWaiters(admin, [sessionTwo.pid]);
  await sessionOne.client.query("commit");
  sessionOneInTransaction = false;

  const updateRaceSettled = await Promise.allSettled([losingUpdate]);
  invariant(
    winningRemove.removed_entry_id === updateRaceEntryId &&
      updateRaceSettled[0].status === "rejected" &&
      updateRaceSettled[0].reason?.code === "40001" &&
      updateRaceSettled[0].reason?.message === "talence_deck_stale",
    "vanished_entry_update_race_wrong_result",
  );
  const updateRaceState = await admin.query(
    `
      select
        deck.current_revision,
        (
          select count(*)::integer
          from public.deck_revisions as revision
          where revision.deck_id = deck.id
        ) as revision_count,
        (
          select count(*)::integer
          from public.deck_entries as entry
          where entry.deck_id = deck.id
        ) as entry_count
      from public.decks as deck
      where deck.id = $1
    `,
    [updateRaceDeckId],
  );
  invariant(
    updateRaceState.rows[0].current_revision === 3 &&
      updateRaceState.rows[0].revision_count === 3 &&
      updateRaceState.rows[0].entry_count === 0,
    "vanished_entry_update_created_spurious_revision",
  );

  const removeRaceDeck = await createDeck(
    sessionOne.client,
    workspaceId,
    `Entry Remove Race ${suffix}`,
  );
  const removeRaceDeckId = removeRaceDeck.deck.deck_id;
  const removeRaceEntry = await addDeckEntry(sessionOne.client, removeRaceDeckId, entryRaceCardId);
  const removeRaceEntryId = removeRaceEntry.entry.entry_id;

  await sessionOne.client.query("begin");
  sessionOneInTransaction = true;
  const firstRemove = await removeDeckEntry(sessionOne.client, removeRaceEntryId, 2);
  const secondRemove = trackOperation(removeDeckEntry(sessionTwo.client, removeRaceEntryId, 2));
  await waitForLockWaiters(admin, [sessionTwo.pid]);
  await sessionOne.client.query("commit");
  sessionOneInTransaction = false;

  const removeRaceSettled = await Promise.allSettled([secondRemove]);
  invariant(
    firstRemove.removed_entry_id === removeRaceEntryId &&
      removeRaceSettled[0].status === "rejected" &&
      removeRaceSettled[0].reason?.code === "40001" &&
      removeRaceSettled[0].reason?.message === "talence_deck_stale",
    "vanished_entry_remove_race_wrong_result",
  );
  const removeRaceState = await admin.query(
    `
      select
        deck.current_revision,
        (
          select count(*)::integer
          from public.deck_revisions as revision
          where revision.deck_id = deck.id
        ) as revision_count,
        (
          select count(*)::integer
          from public.deck_entries as entry
          where entry.deck_id = deck.id
        ) as entry_count
      from public.decks as deck
      where deck.id = $1
    `,
    [removeRaceDeckId],
  );
  invariant(
    removeRaceState.rows[0].current_revision === 3 &&
      removeRaceState.rows[0].revision_count === 3 &&
      removeRaceState.rows[0].entry_count === 0,
    "vanished_entry_remove_created_spurious_revision",
  );

  const archiveRaceDeck = await createDeck(
    sessionOne.client,
    workspaceId,
    `Archive Authorization Race ${suffix}`,
  );
  const archiveRaceDeckId = archiveRaceDeck.deck.deck_id;
  await sessionOne.client.query("begin");
  sessionOneInTransaction = true;
  const winningArchive = await archiveDeck(sessionOne.client, archiveRaceDeckId, 1);
  const losingArchivedUpdate = trackOperation(
    updateDeck(sessionTwo.client, archiveRaceDeckId, `Archived Mutation Must Fail ${suffix}`, 1),
  );
  await waitForLockWaiters(admin, [sessionTwo.pid]);
  await sessionOne.client.query("commit");
  sessionOneInTransaction = false;

  const archiveRaceSettled = await Promise.allSettled([losingArchivedUpdate]);
  invariant(
    winningArchive.deck.status === "archived" &&
      archiveRaceSettled[0].status === "rejected" &&
      archiveRaceSettled[0].reason?.code === "55000" &&
      archiveRaceSettled[0].reason?.message === "talence_deck_not_active",
    "post_wait_archived_deck_update_was_not_denied",
  );
  const archiveRaceState = await admin.query(
    `
      select
        deck.status,
        deck.name,
        deck.current_revision,
        (
          select count(*)::integer
          from public.deck_revisions as revision
          where revision.deck_id = deck.id
        ) as revision_count
      from public.decks as deck
      where deck.id = $1
    `,
    [archiveRaceDeckId],
  );
  invariant(
    archiveRaceState.rows[0].status === "archived" &&
      archiveRaceState.rows[0].name === `Archive Authorization Race ${suffix}` &&
      archiveRaceState.rows[0].current_revision === 2 &&
      archiveRaceState.rows[0].revision_count === 2,
    "archived_deck_race_left_spurious_mutation",
  );

  const deleteCandidate = await createCollection(
    sessionOne.client,
    workspaceId,
    `Delete Race ${suffix}`,
  );
  const deleteCandidateId = deleteCandidate.collection.collection_id;
  const deleteCandidateUpdatedAt = deleteCandidate.collection.updated_at;
  const deleteRaceDeck = await createDeck(
    sessionOne.client,
    workspaceId,
    `Delete Source Race ${suffix}`,
  );
  const deleteRaceDeckId = deleteRaceDeck.deck.deck_id;

  await admin.query("begin");
  adminHoldingBarrier = true;
  await admin.query("select app_private.lock_collection_deck_source_scope($1::uuid)", [
    deleteCandidateId,
  ]);
  const deleteRace = [
    trackOperation(
      deleteCollection(sessionOne.client, deleteCandidateId, deleteCandidateUpdatedAt),
    ),
    trackOperation(replaceDeckSources(sessionTwo.client, deleteRaceDeckId, [deleteCandidateId])),
  ];
  await waitForLockWaiters(admin, [sessionOne.pid, sessionTwo.pid]);
  await admin.query("commit");
  adminHoldingBarrier = false;

  const deleteSettled = await Promise.allSettled(deleteRace);
  const deleteFulfilled = deleteSettled.filter((result) => result.status === "fulfilled");
  const deleteRejected = deleteSettled.filter((result) => result.status === "rejected");
  invariant(
    deleteFulfilled.length === 1 && deleteRejected.length === 1,
    "collection_delete_source_race_did_not_produce_one_winner",
  );

  const deleteRaceState = await admin.query(
    `
      select
        collection.status,
        exists (
          select 1
          from public.deck_inventory_sources as source
          where source.deck_id = $2
            and source.collection_id = collection.id
        ) as referenced,
        (
          select deck.current_revision
          from public.decks as deck
          where deck.id = $2
        ) as deck_revision
      from public.collections as collection
      where collection.id = $1
    `,
    [deleteCandidateId, deleteRaceDeckId],
  );
  invariant(deleteRaceState.rows.length === 1, "collection_delete_source_state_missing");
  const deleteWon = deleteRaceState.rows[0].status === "deleted";
  if (deleteWon) {
    invariant(!deleteRaceState.rows[0].referenced, "deleted_collection_became_deck_source");
    invariant(deleteRaceState.rows[0].deck_revision === 1, "failed_source_changed_revision");
    invariant(
      deleteRejected[0].reason?.code === "23514" &&
        deleteRejected[0].reason?.message === "talence_deck_source_unavailable",
      "collection_delete_winner_wrong_source_error",
    );
  } else {
    invariant(deleteRaceState.rows[0].status === "active", "delete_source_race_bad_status");
    invariant(deleteRaceState.rows[0].referenced, "source_winner_reference_missing");
    invariant(deleteRaceState.rows[0].deck_revision === 2, "source_winner_revision_not_two");
    invariant(
      deleteRejected[0].reason?.code === "55000" &&
        deleteRejected[0].reason?.message === "talence_collection_referenced_by_deck",
      "deck_source_winner_wrong_delete_error",
    );
  }

  const collectionA = await createCollection(
    sessionOne.client,
    workspaceId,
    `Ordered Source A ${suffix}`,
  );
  const collectionB = await createCollection(
    sessionOne.client,
    workspaceId,
    `Ordered Source B ${suffix}`,
  );
  const collectionAId = collectionA.collection.collection_id;
  const collectionBId = collectionB.collection.collection_id;
  const sourceDeckOne = await createDeck(
    sessionOne.client,
    workspaceId,
    `Ordered Source Deck One ${suffix}`,
  );
  const sourceDeckTwo = await createDeck(
    sessionOne.client,
    workspaceId,
    `Ordered Source Deck Two ${suffix}`,
  );
  const sourceDeckOneId = sourceDeckOne.deck.deck_id;
  const sourceDeckTwoId = sourceDeckTwo.deck.deck_id;

  await admin.query("begin");
  adminHoldingBarrier = true;
  for (const collectionId of [collectionAId, collectionBId].sort()) {
    await admin.query("select app_private.lock_collection_deck_source_scope($1::uuid)", [
      collectionId,
    ]);
  }
  const oppositeOrderReplacements = [
    trackOperation(
      replaceDeckSources(sessionOne.client, sourceDeckOneId, [collectionAId, collectionBId]),
    ),
    trackOperation(
      replaceDeckSources(sessionTwo.client, sourceDeckTwoId, [collectionBId, collectionAId]),
    ),
  ];
  await waitForLockWaiters(admin, [sessionOne.pid, sessionTwo.pid]);
  await admin.query("commit");
  adminHoldingBarrier = false;

  const oppositeSettled = await Promise.allSettled(oppositeOrderReplacements);
  invariant(
    oppositeSettled.every((result) => result.status === "fulfilled"),
    `opposite_order_source_replacement_failed:${oppositeSettled
      .filter((result) => result.status === "rejected")
      .map((result) => `${result.reason?.code}:${result.reason?.message}`)
      .join(",")}`,
  );
  const sourceState = await admin.query(
    `
      select
        deck.id as deck_id,
        deck.current_revision,
        coalesce(
          array_agg(source.collection_id order by source.priority),
          '{}'::uuid[]
        ) as collection_ids
      from public.decks as deck
      left join public.deck_inventory_sources as source
        on source.deck_id = deck.id
      where deck.id = any($1::uuid[])
      group by deck.id, deck.current_revision
    `,
    [[sourceDeckOneId, sourceDeckTwoId]],
  );
  const sourceStateByDeck = new Map(sourceState.rows.map((row) => [row.deck_id, row]));
  invariant(
    sourceStateByDeck.get(sourceDeckOneId)?.current_revision === 2 &&
      JSON.stringify(sourceStateByDeck.get(sourceDeckOneId)?.collection_ids) ===
        JSON.stringify([collectionAId, collectionBId]),
    "first_opposite_order_source_result_invalid",
  );
  invariant(
    sourceStateByDeck.get(sourceDeckTwoId)?.current_revision === 2 &&
      JSON.stringify(sourceStateByDeck.get(sourceDeckTwoId)?.collection_ids) ===
        JSON.stringify([collectionBId, collectionAId]),
    "second_opposite_order_source_result_invalid",
  );

  const validationDeck = await createDeck(
    sessionOne.client,
    workspaceId,
    `Validation Cache Race ${suffix}`,
  );
  const validationDeckId = validationDeck.deck.deck_id;
  await admin.query("begin");
  adminHoldingBarrier = true;
  await admin.query("lock table public.deck_validation_runs in share mode");
  const validations = [
    trackOperation(validateDeck(sessionOne.client, validationDeckId)),
    trackOperation(validateDeck(sessionTwo.client, validationDeckId)),
  ];
  await waitForLockWaiters(admin, [sessionOne.pid, sessionTwo.pid]);
  await admin.query("commit");
  adminHoldingBarrier = false;

  const validationSettled = await Promise.allSettled(validations);
  invariant(
    validationSettled.every((result) => result.status === "fulfilled"),
    "concurrent_validation_cache_call_failed",
  );
  const validationRunIds = validationSettled.map((result) => result.value.validation_run_id);
  invariant(
    validationRunIds[0] === validationRunIds[1],
    "concurrent_validation_created_different_results",
  );
  const validationState = await admin.query(
    `
      select count(*)::integer as run_count
      from public.deck_validation_runs
      where deck_id = $1
    `,
    [validationDeckId],
  );
  invariant(
    validationState.rows[0].run_count === 1,
    "concurrent_validation_persisted_duplicate_runs",
  );

  const promotionCardId = randomUUID();
  const promotionImportId = randomUUID();
  const promotionCatalogVersion = `phase4-promotion-${suffix}`;
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
        '00000000-0000-4000-8000-000000000001',
        'fixture',
        $2,
        $3,
        app_private.normalize_catalog_search_text($3)
      )
    `,
    [promotionCardId, `phase4-promotion-card-${runId}`, `Promotion Race Card ${suffix}`],
  );
  await admin.query(
    `
      insert into public.catalog_import_runs (
        id,
        status,
        trigger_type,
        started_at,
        completed_at,
        catalog_version
      )
      values (
        $1,
        'succeeded',
        'fixture',
        statement_timestamp(),
        statement_timestamp(),
        $2
      )
    `,
    [promotionImportId, promotionCatalogVersion],
  );
  const promotionDeck = await createDeck(
    sessionOne.client,
    workspaceId,
    `Catalog Promotion Race ${suffix}`,
  );
  const promotionDeckId = promotionDeck.deck.deck_id;
  const promotionBaselineCatalogVersion = promotionDeck.revision.catalog_version;

  await admin.query("begin");
  adminHoldingBarrier = true;
  await admin.query(
    "select singleton_id from public.catalog_state where singleton_id = 1 for update",
  );
  await admin.query("update public.catalog_cards set active = false where id = $1", [
    promotionCardId,
  ]);
  await admin.query(
    `
      update public.catalog_state
      set
        active_import_id = $1,
        active_catalog_version = $2
      where singleton_id = 1
    `,
    [promotionImportId, promotionCatalogVersion],
  );
  const promotionMutation = trackOperation(
    addDeckEntry(sessionOne.client, promotionDeckId, promotionCardId),
  );
  await waitForLockWaiters(admin, [sessionOne.pid]);
  await admin.query("commit");
  adminHoldingBarrier = false;

  const promotionSettled = await Promise.allSettled([promotionMutation]);
  invariant(
    promotionSettled[0].status === "rejected" &&
      promotionSettled[0].reason?.code === "23514" &&
      promotionSettled[0].reason?.message === "talence_deck_entry_game_mismatch",
    "catalog_promotion_did_not_serialize_before_entry_validation",
  );
  const promotionDeckState = await admin.query(
    `
      select
        deck.current_revision,
        (
          select count(*)::integer
          from public.deck_entries as entry
          where entry.deck_id = deck.id
        ) as entry_count,
        (
          select revision.catalog_version
          from public.deck_revisions as revision
          where revision.deck_id = deck.id
          order by revision.revision desc
          limit 1
        ) as latest_revision_catalog
      from public.decks as deck
      where deck.id = $1
    `,
    [promotionDeckId],
  );
  invariant(
    promotionDeckState.rows[0].current_revision === 1 &&
      promotionDeckState.rows[0].entry_count === 0 &&
      promotionDeckState.rows[0].latest_revision_catalog === promotionBaselineCatalogVersion,
    "catalog_promotion_race_left_partial_deck_state",
  );

  process.stdout.write(
    [
      "Phase 4 deck concurrency integration: PASS",
      `run_id=${runId}`,
      `winner=${winningName}`,
      "revision=two authenticated writers blocked on one row; one revision 2 commit; one 40001 talence_deck_stale",
      "history=exactly two immutable revisions; latest snapshot matches winner; no lost overwrite",
      "entry=post-wait vanished update/remove both reject stale with no spurious revision",
      "status=post-wait archived deck rejects the stale update as talence_deck_not_active",
      `collection_source=one serializable winner (${deleteWon ? "delete" : "source"}); no deleted collection reference`,
      "source_order=opposite caller orders both commit without deadlock and retain caller priority",
      "validation=two concurrent evaluations return one persisted immutable cache row",
      "catalog=promotion state lock commits before entry validation; newly inactive identity rejected without partial revision",
    ].join("\n") + "\n",
  );
} finally {
  if (adminHoldingBarrier) {
    await admin.query("rollback");
  }
  if (sessionOneInTransaction) {
    await sessionOne.client.query("rollback");
  }
  await Promise.allSettled(launchedOperations);
  await sessionOne?.client.end();
  await sessionTwo?.client.end();
  await admin.end();
}
