import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import { expect, test, type APIResponse } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  parseCatalogSnapshotManifest,
  parseDeviceInventoryBatch,
  parseDeviceRunSummary,
} from "@talence/contracts";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import pg from "pg";

import { readLocalSupabaseStatus, repositoryRoot } from "../../../scripts/lib/local-supabase.mjs";

interface LiveFixture {
  collectionId: string;
  email: string;
  password: string;
  printingId: string;
  snapshotSha256: string;
  snapshotVersion: string;
}

type JsonRecord = Record<string, unknown>;
type OpenApiMethod = "get" | "post";

const localSupabase = readLocalSupabaseStatus();
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});
addFormats(ajv);

let fixture: LiveFixture;
let openApi: JsonRecord;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requiredRecord(value: unknown, message: string): JsonRecord {
  const candidate = record(value);
  invariant(candidate, message);
  return candidate;
}

function openApiOperation(pathname: string, method: OpenApiMethod): JsonRecord {
  const paths = requiredRecord(openApi.paths, "openapi_paths_missing");
  const pathItem = requiredRecord(paths[pathname], `openapi_path_missing:${pathname}`);
  return requiredRecord(pathItem[method], `openapi_operation_missing:${method}:${pathname}`);
}

function openApiResponseValidator(
  pathname: string,
  method: OpenApiMethod,
  status: number,
): ValidateFunction {
  const operation = openApiOperation(pathname, method);
  const responses = requiredRecord(operation.responses, "openapi_responses_missing");
  const response = requiredRecord(responses[String(status)], `openapi_response_missing:${status}`);
  const content = requiredRecord(response.content, "openapi_response_content_missing");
  const media = requiredRecord(content["application/json"], "openapi_json_response_missing");
  const schema = requiredRecord(media.schema, "openapi_response_schema_missing");
  return ajv.compile(schema);
}

function validateOpenApiRequest(pathname: string, method: OpenApiMethod, value: unknown): void {
  const operation = openApiOperation(pathname, method);
  const requestBody = requiredRecord(operation.requestBody, "openapi_request_body_missing");
  const content = requiredRecord(requestBody.content, "openapi_request_content_missing");
  const media = requiredRecord(content["application/json"], "openapi_json_request_missing");
  const schema = requiredRecord(media.schema, "openapi_request_schema_missing");
  const validate = ajv.compile(schema);
  expect(validate(value), ajv.errorsText(validate.errors, { separator: "\n" })).toBe(true);
}

async function expectOpenApiResponse(
  response: APIResponse,
  pathname: string,
  method: OpenApiMethod,
  expectedStatus: number,
): Promise<JsonRecord> {
  expect(response.status()).toBe(expectedStatus);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = requiredRecord(await response.json(), "device_api_response_not_an_object");
  const validate = openApiResponseValidator(pathname, method, expectedStatus);
  expect(validate(body), ajv.errorsText(validate.errors, { separator: "\n" })).toBe(true);
  const meta = requiredRecord(body.meta, "device_api_meta_missing");
  expect(response.headers()["x-request-id"]).toBe(meta.request_id);
  return body;
}

async function provisionLiveFixture(): Promise<LiveFixture> {
  const database = new pg.Client({ connectionString: localSupabase.databaseUrl });
  await database.connect();
  try {
    const catalog = await database.query<{
      printing_id: string;
      sha256: string;
      version: string;
    }>(
      `
        select
          printing.id::text as printing_id,
          snapshot.sha256,
          snapshot.version
        from public.catalog_state as state
        join public.catalog_snapshots as snapshot
          on snapshot.id = state.current_robot_snapshot_id
        cross join lateral (
          select candidate.id
          from public.catalog_printings as candidate
          where candidate.active
            and 'nonfoil'::public.card_finish = any(candidate.finishes)
          order by candidate.id
          limit 1
        ) as printing
        where state.singleton_id = 1
          and snapshot.status = 'succeeded'::public.job_status
      `,
    );
    invariant(
      catalog.rowCount === 1,
      "phase5_live_requires_a_published_snapshot_and_active_printing",
    );

    const inviteId = randomUUID();
    const email = `phase5-live-${randomUUID()}@example.test`;
    const password = "Talence-Phase5-Live-2026!";
    await database.query(
      `
        insert into app_private.invited_users (id, email, expires_at, note)
        values ($1, $2, statement_timestamp() + interval '1 day', 'Phase 5 live E2E')
      `,
      [inviteId, email],
    );

    const admin = createClient(localSupabase.apiUrl, localSupabase.secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        display_name: "Phase 5 Live Owner",
        invited_user_id: inviteId,
      },
    });
    invariant(!created.error && created.data.user, "phase5_live_auth_user_creation_failed");

    const admitted = createClient(localSupabase.apiUrl, localSupabase.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const signedIn = await admitted.auth.signInWithPassword({ email, password });
    invariant(!signedIn.error && signedIn.data.user, "phase5_live_auth_sign_in_failed");
    const finalized = await admitted.rpc("finalize_admitted_user");
    invariant(!finalized.error, "phase5_live_admission_finalization_failed");
    const profileUpdate = await admitted
      .from("profiles")
      .update({
        display_name: "Phase 5 Live Owner",
        handle: `phase5-live-${inviteId.slice(0, 8)}`,
      })
      .eq("user_id", created.data.user.id);
    invariant(!profileUpdate.error, "phase5_live_profile_completion_failed");
    await admitted.auth.signOut({ scope: "local" });

    const profile = await database.query<{ default_collection_id: string }>(
      `
        select default_collection_id::text
        from public.profiles
        where user_id = $1
      `,
      [created.data.user.id],
    );
    invariant(profile.rowCount === 1, "phase5_live_profile_missing");
    const row = catalog.rows[0]!;
    return {
      collectionId: profile.rows[0]!.default_collection_id,
      email,
      password,
      printingId: row.printing_id,
      snapshotSha256: row.sha256,
      snapshotVersion: row.version,
    };
  } finally {
    await database.end();
  }
}

test.beforeAll(async () => {
  const contractPath = path.join(
    repositoryRoot,
    "docs",
    "canonical",
    "Talence_Greenfield_Canon_v1.0.0",
    "contracts",
    "device-api.openapi.yaml",
  );
  openApi = (await SwaggerParser.dereference(contractPath)) as unknown as JsonRecord;
  fixture = await provisionLiveFixture();
});

test("real Auth, RLS, device admin, all v1 routes, contracts, and revocation fail closed", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/devices");
  await expect(page.getByRole("heading", { name: "Devices", exact: true })).toBeVisible();
  await expect(page.getByText("Deterministic preview data")).toHaveCount(0);
  await page.getByLabel("Device name").fill("Phase 5 Live Sorter");
  await page.getByLabel("Device type").selectOption("talence_sorter");
  await page.getByLabel("Manufacturer (optional)").fill("Talence");
  await page.getByLabel("Model (optional)").fill("Live Contract Fixture");
  await page.getByLabel("Serial number (optional)").fill(`LIVE-${randomUUID()}`);
  await page.getByRole("button", { name: "Register device and issue credential" }).click();

  const rawCredential = page.getByLabel("Raw device credential");
  await expect(rawCredential).toHaveText(/^tlc_dev_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  const credential = (await rawCredential.textContent())!;
  await page.getByLabel("I stored this credential in the device's secret storage.").check();
  await page.getByRole("button", { name: "I have stored it" }).click();
  await expect(rawCredential).toHaveCount(0);
  const deviceLink = page.getByRole("link", { name: "Open Phase 5 Live Sorter" });
  const deviceHref = await deviceLink.getAttribute("href");
  invariant(deviceHref, "phase5_live_device_link_missing");
  const deviceId = deviceHref.split("/").at(-1)!;
  await deviceLink.click();

  await expect(page.getByRole("heading", { name: "Phase 5 Live Sorter", level: 1 })).toBeVisible();
  await page.getByLabel("Inventory read").check();
  await page.getByLabel("Inventory write").check();
  await page.getByLabel("Run summaries").check();
  await page.getByRole("button", { name: "Save explicit grants" }).click();
  await expect(page.getByText("Collection grants updated")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /start motion|move robot|remote start/i }),
  ).toHaveCount(0);

  const authorization = { authorization: `Bearer ${credential}` };
  const identityResponse = await request.get("/api/v1/device/me", {
    headers: authorization,
  });
  const identity = await expectOpenApiResponse(identityResponse, "/device/me", "get", 200);
  expect(requiredRecord(identity.data, "device_identity_data_missing").device_id).toBe(deviceId);

  const heartbeat = {
    schema_version: 1,
    client_version: "0.1.0",
    firmware_version: "phase5-live",
    catalog_snapshot_version: null,
    health: { ready: true, fixture: "phase5-live" },
  };
  validateOpenApiRequest("/device/heartbeat", "post", heartbeat);
  const heartbeatResponse = await request.post("/api/v1/device/heartbeat", {
    data: heartbeat,
    headers: authorization,
  });
  await expectOpenApiResponse(heartbeatResponse, "/device/heartbeat", "post", 200);

  const manifestQuery = new URLSearchParams({
    client_version: "0.1.0",
    supported_schema_versions: "1",
  });
  const manifestResponse = await request.get(
    `/api/v1/device/catalog/manifest?${manifestQuery.toString()}`,
    { headers: authorization },
  );
  const manifestEnvelope = await expectOpenApiResponse(
    manifestResponse,
    "/device/catalog/manifest",
    "get",
    200,
  );
  const manifest = parseCatalogSnapshotManifest(manifestEnvelope.data);
  expect(manifest.up_to_date).toBe(false);
  expect(manifest.latest.version).toBe(fixture.snapshotVersion);
  expect(manifest.latest.sha256).toBe(fixture.snapshotSha256);
  invariant(manifest.latest.download, "phase5_live_snapshot_download_missing");
  const signedUrl = new URL(manifest.latest.download.url);
  expect(signedUrl.origin).toBe(localSupabase.apiUrl);
  expect(signedUrl.pathname).toBe(
    `/storage/v1/object/sign/catalog-snapshots/mtg/${fixture.snapshotVersion}/catalog.sqlite`,
  );
  expect(signedUrl.searchParams.has("token")).toBe(true);
  const download = await request.get(manifest.latest.download.url);
  expect(download.status()).toBe(200);
  const downloaded = await download.body();
  expect(createHash("sha256").update(downloaded).digest("hex")).toBe(fixture.snapshotSha256);

  manifestQuery.set("current_version", fixture.snapshotVersion);
  const currentManifestResponse = await request.get(
    `/api/v1/device/catalog/manifest?${manifestQuery.toString()}`,
    { headers: authorization },
  );
  const currentManifestEnvelope = await expectOpenApiResponse(
    currentManifestResponse,
    "/device/catalog/manifest",
    "get",
    200,
  );
  const currentManifest = parseCatalogSnapshotManifest(currentManifestEnvelope.data);
  expect(currentManifest.up_to_date).toBe(true);
  expect(currentManifest.latest.download).toBeNull();

  const occurredAt = new Date(Date.now() - 30_000).toISOString();
  const inventoryBody = {
    schema_version: 1,
    catalog_snapshot_version: fixture.snapshotVersion,
    occurred_at: occurredAt,
    external_run_id: "phase5-live-run",
    lines: [
      {
        line_id: "live-line-1",
        printing_id: fixture.printingId,
        finish: "nonfoil",
        condition: "near_mint",
        quantity_delta: 2,
      },
    ],
    metadata: { fixture: "phase5-live" },
  };
  parseDeviceInventoryBatch(inventoryBody);
  validateOpenApiRequest(
    "/device/collections/{collection_id}/inventory-batches",
    "post",
    inventoryBody,
  );
  const inventoryPath = `/api/v1/device/collections/${fixture.collectionId}/inventory-batches`;
  const batchHeaders = {
    ...authorization,
    "idempotency-key": `phase5-live-batch-${randomUUID()}`,
  };
  const createdBatchResponse = await request.post(inventoryPath, {
    data: inventoryBody,
    headers: batchHeaders,
  });
  const createdBatch = await expectOpenApiResponse(
    createdBatchResponse,
    "/device/collections/{collection_id}/inventory-batches",
    "post",
    201,
  );
  expect(requiredRecord(createdBatch.data, "inventory_batch_data_missing").replayed).toBe(false);

  const replayedBatchResponse = await request.post(inventoryPath, {
    data: inventoryBody,
    headers: batchHeaders,
  });
  const replayedBatch = await expectOpenApiResponse(
    replayedBatchResponse,
    "/device/collections/{collection_id}/inventory-batches",
    "post",
    200,
  );
  const createdBatchData = requiredRecord(createdBatch.data, "inventory_batch_data_missing");
  const replayedBatchData = requiredRecord(replayedBatch.data, "inventory_replay_data_missing");
  expect(replayedBatchData.replayed).toBe(true);
  expect(replayedBatchData.transaction_id).toBe(createdBatchData.transaction_id);

  const conflictingInventoryBody = {
    ...inventoryBody,
    lines: [{ ...inventoryBody.lines[0]!, quantity_delta: 3 }],
  };
  parseDeviceInventoryBatch(conflictingInventoryBody);
  const conflictingBatchResponse = await request.post(inventoryPath, {
    data: conflictingInventoryBody,
    headers: batchHeaders,
  });
  const conflictingBatch = await expectOpenApiResponse(
    conflictingBatchResponse,
    "/device/collections/{collection_id}/inventory-batches",
    "post",
    409,
  );
  expect(requiredRecord(conflictingBatch.error, "inventory_conflict_error_missing").code).toBe(
    "idempotency_conflict",
  );

  const unknownPrintingId = randomUUID();
  const unknownInventoryBody = {
    ...inventoryBody,
    external_run_id: "phase5-live-unknown",
    lines: [
      { ...inventoryBody.lines[0]!, line_id: "unknown-line", printing_id: unknownPrintingId },
    ],
  };
  parseDeviceInventoryBatch(unknownInventoryBody);
  const unknownBatchResponse = await request.post(inventoryPath, {
    data: unknownInventoryBody,
    headers: {
      ...authorization,
      "idempotency-key": `phase5-live-unknown-${randomUUID()}`,
    },
  });
  const unknownBatch = await expectOpenApiResponse(
    unknownBatchResponse,
    "/device/collections/{collection_id}/inventory-batches",
    "post",
    409,
  );
  const unknownError = requiredRecord(unknownBatch.error, "unknown_printing_error_missing");
  expect(unknownError.code).toBe("catalog_printing_unknown");
  const unknownDetails = requiredRecord(unknownError.details, "unknown_printing_details_missing");
  expect(unknownDetails.unknown_printing_ids).toEqual([unknownPrintingId]);
  expect(unknownDetails.latest_compatible_snapshot_version).toBe(fixture.snapshotVersion);

  const inventoryPageResponse = await request.get(
    `/api/v1/device/collections/${fixture.collectionId}/inventory?limit=25`,
    { headers: authorization },
  );
  const inventoryPage = await expectOpenApiResponse(
    inventoryPageResponse,
    "/device/collections/{collection_id}/inventory",
    "get",
    200,
  );
  expect(inventoryPage.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        condition: "near_mint",
        finish: "nonfoil",
        printing_id: fixture.printingId,
        quantity: 2,
      }),
    ]),
  );

  const completedAt = new Date(Date.now() - 10_000);
  const runBody = {
    schema_version: 1,
    external_run_id: `phase5-live-run-${randomUUID()}`,
    collection_id: fixture.collectionId,
    status: "completed",
    catalog_snapshot_version: fixture.snapshotVersion,
    started_at: new Date(completedAt.getTime() - 60_000).toISOString(),
    completed_at: completedAt.toISOString(),
    counts: { total: 2, recognized: 2, unrecognized: 0, posted: 2 },
    diagnostic_code: null,
    metadata: { fixture: "phase5-live" },
  };
  parseDeviceRunSummary(runBody);
  validateOpenApiRequest("/device/runs", "post", runBody);
  const runHeaders = {
    ...authorization,
    "idempotency-key": `phase5-live-summary-${randomUUID()}`,
  };
  const createdRunResponse = await request.post("/api/v1/device/runs", {
    data: runBody,
    headers: runHeaders,
  });
  const createdRun = await expectOpenApiResponse(createdRunResponse, "/device/runs", "post", 201);
  const replayedRunResponse = await request.post("/api/v1/device/runs", {
    data: runBody,
    headers: runHeaders,
  });
  const replayedRun = await expectOpenApiResponse(replayedRunResponse, "/device/runs", "post", 200);
  const createdRunData = requiredRecord(createdRun.data, "run_summary_data_missing");
  const replayedRunData = requiredRecord(replayedRun.data, "run_summary_replay_data_missing");
  expect(replayedRunData.replayed).toBe(true);
  expect(replayedRunData.run_summary_id).toBe(createdRunData.run_summary_id);

  const conflictingRunBody = {
    ...runBody,
    counts: { ...runBody.counts, posted: 1 },
  };
  parseDeviceRunSummary(conflictingRunBody);
  const conflictingRunResponse = await request.post("/api/v1/device/runs", {
    data: conflictingRunBody,
    headers: runHeaders,
  });
  const conflictingRun = await expectOpenApiResponse(
    conflictingRunResponse,
    "/device/runs",
    "post",
    409,
  );
  expect(requiredRecord(conflictingRun.error, "run_conflict_error_missing").code).toBe(
    "idempotency_conflict",
  );

  await page.getByRole("button", { name: "Revoke credential" }).first().click();
  const revokeDialog = page.getByRole("dialog", { name: /Revoke credential/ });
  await revokeDialog.getByRole("button", { name: "Revoke credential" }).click();
  await expect(page.getByText("Credential revoked")).toBeVisible();
  const revokedResponse = await request.get("/api/v1/device/me", {
    headers: authorization,
  });
  const revoked = await expectOpenApiResponse(revokedResponse, "/device/me", "get", 401);
  expect(requiredRecord(revoked.error, "revoked_error_missing").code).toBe(
    "device_credential_invalid",
  );

  await page.getByRole("button", { name: "Rotate credential" }).click();
  const rotatedCredential = page.getByLabel("Raw device credential");
  await expect(rotatedCredential).toHaveText(/^tlc_dev_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  const rotatedRaw = (await rotatedCredential.textContent())!;
  await page.getByLabel("I stored this credential in the device's secret storage.").check();
  await page.getByRole("button", { name: "I have stored it" }).click();
  await expect(rotatedCredential).toHaveCount(0);
  await page.reload();

  await page.getByRole("button", { name: "Suspend" }).click();
  const suspendDialog = page.getByRole("dialog", { name: "Suspend Phase 5 Live Sorter?" });
  await suspendDialog.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Device suspended")).toBeVisible();
  const suspendedResponse = await request.get("/api/v1/device/me", {
    headers: { authorization: `Bearer ${rotatedRaw}` },
  });
  const suspended = await expectOpenApiResponse(suspendedResponse, "/device/me", "get", 401);
  expect(requiredRecord(suspended.error, "suspended_error_missing").code).toBe(
    "device_credential_invalid",
  );
});
