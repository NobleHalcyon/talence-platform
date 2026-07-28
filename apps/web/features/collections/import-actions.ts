"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { validateUuid } from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticCollectionPreviewEnabled } from "./config";
import {
  INVENTORY_IMPORT_LIMITS,
  INVENTORY_IMPORT_PARSER_VERSION,
  parseInventoryCsvBytes,
} from "./csv";
import { loadInventoryImportPreviewWithClient } from "./data";
import { chunkInventoryImportStageRows } from "./import-stage";
import type { ImportActionState } from "./import-state";
import { parseInventoryImportCreate } from "./parse";
import { previewImport } from "./preview";
import type { CollectionRpcClient } from "./types";

const EDITOR_ROLES = new Set(["owner", "admin", "editor"]);
const MAX_FILENAME_LENGTH = 255;
const MAX_NOTE_LENGTH = 1_000;

type ServerClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): string | null {
  const parsed = validateUuid(value);
  return parsed.ok ? parsed.value : null;
}

function validInstant(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value ? value : null;
}

function importPath(collectionId: string, importJobId?: string, afterRowNumber = 0): string {
  const base = `/app/collections/${collectionId}/import`;
  if (!importJobId) return base;
  const parameters = new URLSearchParams({ job: importJobId });
  if (afterRowNumber > 0) {
    parameters.set("after_row", String(afterRowNumber));
  }
  return `${base}?${parameters}`;
}

function withStatus(pathname: string, status: string, requestId?: string): string {
  const parsed = new URL(pathname, "https://talence.invalid");
  parsed.searchParams.set("status", status);
  if (requestId) parsed.searchParams.set("request_id", requestId);
  return `${parsed.pathname}${parsed.search}`;
}

function safeFilename(value: string): string | null {
  const leaf = value
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return leaf && leaf.length <= MAX_FILENAME_LENGTH ? leaf : null;
}

function errorState(message: string, requestId = randomUUID()): ImportActionState {
  return {
    status: "error",
    message,
    requestId,
    preview: null,
    uploadAttemptId: randomUUID(),
  };
}

function retryState(
  message: string,
  requestId: string,
  uploadAttemptId: string,
): ImportActionState {
  return {
    status: "error",
    message,
    requestId,
    preview: null,
    uploadAttemptId,
  };
}

function warnImportFailure(code: string, requestId: string): void {
  writeSecurityLog("warn", "inventory_import.operation.failed", {
    code,
    request_id: requestId,
  });
}

function storageObjectExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  const combined = [candidate.code, candidate.message, candidate.status, candidate.statusCode]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
  return (
    combined.includes("duplicate") ||
    combined.includes("already exists") ||
    combined.includes("resource exists") ||
    combined.includes(" 409")
  );
}

function importSourceConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  const combined = `${candidate.code ?? ""} ${candidate.message ?? ""}`.toLowerCase();
  return (
    combined.includes("row_conflict") ||
    combined.includes("source_conflict") ||
    combined.includes("hash_mismatch") ||
    combined.includes("payload_mismatch")
  );
}

async function authorizedImport(
  requestId: string,
): Promise<{ preview: true; client: null } | { preview: false; client: ServerClient } | null> {
  try {
    const state = await getAppContextState();
    if (state.status === "unconfigured" && staticCollectionPreviewEnabled()) {
      return { preview: true, client: null };
    }
    if (state.status !== "ready" || !EDITOR_ROLES.has(state.context.workspace.role)) {
      return null;
    }
    const client = await createServerSupabaseClient();
    return client ? { preview: false, client } : null;
  } catch {
    warnImportFailure("authorization_unavailable", requestId);
    return null;
  }
}

async function cancelImportQuietly(
  client: CollectionRpcClient,
  importJobId: string,
): Promise<void> {
  try {
    await client.rpc(DATABASE_FUNCTIONS.inventoryImportCancel, {
      p_import_job_id: importJobId,
    });
  } catch {
    // The original safe failure is returned. Operations can inspect a job
    // that could not be transitioned to cancelled.
  }
}

export async function stageInventoryImportAction(
  _previousState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const requestId = randomUUID();
  const collectionId = validUuid(formString(formData, "collectionId"));
  const fileValue = formData.get("inventoryCsv");
  const file = typeof File !== "undefined" && fileValue instanceof File ? fileValue : null;
  const filename = file ? safeFilename(file.name) : null;
  const uploadAttemptId = validUuid(formString(formData, "uploadAttemptId"));
  const authorized = await authorizedImport(requestId);

  if (!collectionId || !file || !filename || !uploadAttemptId || !authorized) {
    return errorState(
      "The CSV could not be staged. Choose a valid file and reload before retrying.",
      requestId,
    );
  }
  if (file.size === 0) {
    return errorState("Choose a non-empty CSV file.", requestId);
  }
  if (file.size > INVENTORY_IMPORT_LIMITS.maximumBytes) {
    return errorState("CSV files are limited to 2 MiB.", requestId);
  }
  if (
    file.type &&
    file.type !== "text/csv" &&
    file.type !== "application/vnd.ms-excel" &&
    file.type !== "text/plain"
  ) {
    return errorState("Choose a UTF-8 CSV text file.", requestId);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return errorState("The selected file could not be read. Nothing was staged.", requestId);
  }
  const parsed = parseInventoryCsvBytes(bytes);
  if (!parsed.ok) {
    return errorState(parsed.error.message, requestId);
  }

  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  if (authorized.preview) {
    return {
      status: "preview",
      message: "Preview data was parsed without changing inventory.",
      requestId: null,
      preview: previewImport(collectionId, filename, sourceSha256, parsed.rows),
      uploadAttemptId,
    };
  }

  const stagedRows = chunkInventoryImportStageRows(parsed.rows);
  if (!stagedRows.ok) {
    warnImportFailure(stagedRows.reason, requestId);
    return errorState(
      "A CSV row is too large to import safely. Shorten that row and try again.",
      requestId,
    );
  }

  const client = authorized.client;
  const rpcClient = client as unknown as CollectionRpcClient;
  const createIdempotencyKey = `inventory-import:${uploadAttemptId}`;
  let importJobId: string | null = null;
  let cancelOnFailure = false;

  try {
    const createResult = await rpcClient.rpc(DATABASE_FUNCTIONS.inventoryImportCreate, {
      p_collection_id: collectionId,
      p_original_filename: filename,
      p_file_size: bytes.byteLength,
      p_file_sha256: sourceSha256,
      p_parser_version: INVENTORY_IMPORT_PARSER_VERSION,
      p_idempotency_key: createIdempotencyKey,
    });
    if (createResult.error) throw new Error("create_failed");
    const job = parseInventoryImportCreate(createResult.data);
    if (
      !job ||
      bytes.byteLength > job.maxFileBytes ||
      parsed.rows.length > job.maxRows ||
      job.maxFileBytes !== INVENTORY_IMPORT_LIMITS.maximumBytes ||
      job.maxRows !== INVENTORY_IMPORT_LIMITS.maximumRows
    ) {
      throw new Error("create_contract_invalid");
    }
    importJobId = job.importJobId;
    const terminalFailure = job.status === "failed" || job.status === "cancelled";

    if (terminalFailure) {
      return errorState(
        "The earlier upload attempt is terminal. Choose the file again to start a new attempt.",
        requestId,
      );
    }

    if (job.stagingCompletedAt && (job.status === "running" || job.status === "succeeded")) {
      const existingPreview = await loadInventoryImportPreviewWithClient(
        rpcClient,
        job.importJobId,
      );
      if (!existingPreview.ok) throw new Error("replayed_preview_failed");
      return {
        status: "preview",
        message: job.replayed
          ? "The original upload attempt was replayed without staging inventory twice."
          : "The completed staging result is ready for review.",
        requestId: null,
        preview: existingPreview.data,
        uploadAttemptId,
      };
    }
    if (job.status !== "queued" && job.status !== "running") {
      throw new Error("create_state_invalid");
    }

    const bucket = client.storage.from(job.storageBucket);
    const upload = await bucket.upload(job.storagePath, bytes, {
      contentType: "text/csv",
      metadata: {
        sha256: sourceSha256,
        import_job_id: job.importJobId,
        parser_version: INVENTORY_IMPORT_PARSER_VERSION,
      },
      upsert: false,
    });
    if (upload.error) {
      if (!storageObjectExists(upload.error)) {
        throw new Error("private_upload_failed");
      }
      const existing = await bucket.download(job.storagePath);
      if (existing.error || !existing.data) {
        throw new Error("private_upload_verify_failed");
      }
      if (existing.data.size > INVENTORY_IMPORT_LIMITS.maximumBytes) {
        cancelOnFailure = true;
        throw new Error("private_upload_mismatch");
      }
      const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
      const existingSha256 = createHash("sha256").update(existingBytes).digest("hex");
      if (existingBytes.byteLength !== bytes.byteLength || existingSha256 !== sourceSha256) {
        cancelOnFailure = true;
        throw new Error("private_upload_mismatch");
      }
    }

    for (const [index, rows] of stagedRows.chunks.entries()) {
      const staged = await rpcClient.rpc(DATABASE_FUNCTIONS.inventoryImportStageRows, {
        p_import_job_id: job.importJobId,
        p_rows: rows,
        p_complete: index === stagedRows.chunks.length - 1,
      });
      if (staged.error) {
        if (importSourceConflict(staged.error)) {
          cancelOnFailure = true;
          throw new Error("stage_source_conflict");
        }
        throw new Error("stage_rows_failed");
      }
    }

    const preview = await loadInventoryImportPreviewWithClient(rpcClient, job.importJobId);
    if (!preview.ok) throw new Error("preview_failed");
    return {
      status: "preview",
      message: "Review every matched, ambiguous, and rejected row before confirming.",
      requestId: null,
      preview: preview.data,
      uploadAttemptId,
    };
  } catch (error) {
    if (importJobId && cancelOnFailure) {
      await cancelImportQuietly(rpcClient, importJobId);
    }
    const code = error instanceof Error ? error.message : "stage_failed";
    warnImportFailure(code, requestId);
    return importJobId && !cancelOnFailure
      ? retryState(
          "The import is still resumable and no inventory changed. Retry the same file and upload attempt.",
          requestId,
          uploadAttemptId,
        )
      : errorState(
          "The import did not finish staging, so no inventory changed. Reload and retry.",
          requestId,
        );
  }
}

export async function resolveInventoryImportRowAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const collectionId = validUuid(formString(formData, "collectionId"));
  const importJobId = validUuid(formString(formData, "importJobId"));
  const afterValue = formString(formData, "afterRowNumber");
  const afterRowNumber =
    /^\d{1,4}$/.test(afterValue) && Number(afterValue) <= INVENTORY_IMPORT_LIMITS.maximumRows + 1
      ? Number(afterValue)
      : 0;
  const rowNumberValue = formString(formData, "rowNumber");
  const rowNumber = /^\d+$/.test(rowNumberValue) ? Number(rowNumberValue) : 0;
  const resolution = formString(formData, "resolution");
  const printingIdValue = formString(formData, "printingId");
  const printingId = printingIdValue ? validUuid(printingIdValue) : null;
  const authorized = await authorizedImport(requestId);
  const returnTo =
    collectionId && importJobId
      ? importPath(collectionId, importJobId, afterRowNumber)
      : "/app/collections";

  if (
    !collectionId ||
    !importJobId ||
    !Number.isSafeInteger(rowNumber) ||
    rowNumber < 1 ||
    (resolution !== "match" && resolution !== "exclude" && resolution !== "reset") ||
    (resolution === "match" && !printingId) ||
    !authorized
  ) {
    redirect(withStatus(returnTo, "import_row_invalid", requestId));
  }
  if (!authorized.preview) {
    const result = await (authorized.client as unknown as CollectionRpcClient).rpc(
      DATABASE_FUNCTIONS.inventoryImportResolveRow,
      {
        p_import_job_id: importJobId,
        p_row_number: rowNumber,
        p_resolution: resolution,
        p_printing_id: printingId,
      },
    );
    if (result.error) {
      redirect(withStatus(returnTo, "import_row_failed", requestId));
    }
  }
  revalidatePath(returnTo);
  redirect(withStatus(returnTo, "import_row_updated"));
}

export async function commitInventoryImportAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const collectionId = validUuid(formString(formData, "collectionId"));
  const importJobId = validUuid(formString(formData, "importJobId"));
  const operationOccurredAt = validInstant(formString(formData, "occurredAt"));
  const note = formString(formData, "note");
  const authorized = await authorizedImport(requestId);
  const returnTo =
    collectionId && importJobId ? importPath(collectionId, importJobId) : "/app/collections";
  if (
    !collectionId ||
    !importJobId ||
    !operationOccurredAt ||
    note.length > MAX_NOTE_LENGTH ||
    !authorized
  ) {
    redirect(withStatus(returnTo, "import_commit_invalid", requestId));
  }
  if (!authorized.preview) {
    const result = await (authorized.client as unknown as CollectionRpcClient).rpc(
      DATABASE_FUNCTIONS.inventoryImportCommit,
      {
        p_import_job_id: importJobId,
        p_idempotency_key: `inventory-import-commit:${importJobId}`,
        p_occurred_at: operationOccurredAt,
        p_note: note || null,
      },
    );
    if (result.error) {
      const code =
        result.error.code?.includes("ambiguous") || result.error.message?.includes("ambiguous")
          ? "import_ambiguity_unresolved"
          : "import_commit_failed";
      redirect(withStatus(returnTo, code, requestId));
    }
  }
  const collectionPath = `/app/collections/${collectionId}`;
  revalidatePath(collectionPath);
  revalidatePath(`${collectionPath}/history`);
  redirect(withStatus(collectionPath, "import_committed"));
}

export async function cancelInventoryImportAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const collectionId = validUuid(formString(formData, "collectionId"));
  const importJobId = validUuid(formString(formData, "importJobId"));
  const authorized = await authorizedImport(requestId);
  const returnTo = collectionId ? importPath(collectionId) : "/app/collections";
  if (!collectionId || !importJobId || !authorized) {
    redirect(withStatus(returnTo, "import_cancel_failed", requestId));
  }
  if (!authorized.preview) {
    const result = await (authorized.client as unknown as CollectionRpcClient).rpc(
      DATABASE_FUNCTIONS.inventoryImportCancel,
      { p_import_job_id: importJobId },
    );
    if (result.error) {
      redirect(withStatus(returnTo, "import_cancel_failed", requestId));
    }
  }
  revalidatePath(returnTo);
  redirect(withStatus(returnTo, "import_cancelled"));
}
