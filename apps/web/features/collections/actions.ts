"use server";

import { randomUUID } from "node:crypto";

import type { CardCondition, CardFinish } from "@talence/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { validateUuid } from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS, DATABASE_TABLES } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticCollectionPreviewEnabled } from "./config";
import { parseInventoryMutationResult } from "./parse";
import { safeCollectionReturnPath } from "./query";
import type { CollectionRpcClient, CollectionView, InventoryMutationResult } from "./types";

const COLLECTIONS_PATH = "/app/collections";
const EDITOR_ROLES = new Set(["owner", "admin", "editor"]);
const KNOWN_FINISHES = new Set(["nonfoil", "foil", "etched"]);
const KNOWN_CONDITIONS = new Set([
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
]);
const MAX_TRANSACTION_LINES = 500;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_NOTE_LENGTH = 1_000;

type ServerClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

interface AuthorizedMutation {
  preview: boolean;
  workspaceId: string | null;
  client: ServerClient | null;
}

export interface InventoryLineInput {
  lineId: string;
  printingId: string;
  finish: Exclude<CardFinish, "unknown">;
  condition: Exclude<CardCondition, "unknown">;
  quantityDelta: number;
  expectedQuantityBefore?: number;
}

export interface TransferLineInput {
  lineId: string;
  printingId: string;
  finish: Exclude<CardFinish, "unknown">;
  condition: Exclude<CardCondition, "unknown">;
  quantity: number;
  expectedSourceQuantityBefore?: number;
  expectedDestinationQuantityBefore?: number;
}

type RpcMutationResult<T> =
  { ok: true; data: T } | { ok: false; code: string; currentQuantity?: number };

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalInteger(value: string): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function uuid(value: string): string | null {
  const parsed = validateUuid(value);
  return parsed.ok ? parsed.value : null;
}

function idempotencyKey(value: string): string | null {
  return /^[A-Za-z0-9:_-]{8,200}$/.test(value) ? value : null;
}

function lineId(value: string): string | null {
  return /^[A-Za-z0-9:_-]{1,128}$/.test(value) ? value : null;
}

function occurredAt(value: string): string | null {
  if (value.length > 40) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) || instant.toISOString() !== value ? null : value;
}

function withStatus(pathname: string, status: string, requestId?: string): string {
  const parsed = new URL(pathname, "https://talence.invalid");
  parsed.searchParams.set("status", status);
  if (requestId) parsed.searchParams.set("request_id", requestId);
  return `${parsed.pathname}${parsed.search}`;
}

function collectionPath(collectionId: string): string {
  return `${COLLECTIONS_PATH}/${collectionId}`;
}

function warnCollectionMutation(code: string, requestId: string): void {
  writeSecurityLog("warn", "collection.mutation.failed", {
    code,
    request_id: requestId,
  });
}

function rpcFailure(error: { code?: string; message?: string } | null): RpcMutationResult<never> {
  const code = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  const normalized =
    code.includes("quantity_conflict") ||
    code.includes("stale") ||
    code.includes("expected_quantity")
      ? "stale_quantity"
      : code.includes("positive_inventory") || code.includes("delete_requires_empty_inventory")
        ? "collection_not_empty"
        : code.includes("profile_default") || code.includes("default_collection")
          ? "default_collection_locked"
          : code.includes("idempotency_conflict")
            ? "idempotency_conflict"
            : code.includes("negative")
              ? "negative_quantity"
              : code.includes("finish")
                ? "unsupported_finish"
                : code.includes("permission") || code.includes("42501")
                  ? "access_denied"
                  : "mutation_failed";
  return { ok: false, code: normalized };
}

async function authorizedMutation(requestId: string): Promise<AuthorizedMutation | null> {
  try {
    const state = await getAppContextState();
    if (state.status === "unconfigured" && staticCollectionPreviewEnabled()) {
      return { preview: true, workspaceId: null, client: null };
    }
    if (state.status !== "ready" || !EDITOR_ROLES.has(state.context.workspace.role)) {
      return null;
    }
    const client = await createServerSupabaseClient();
    if (!client) return null;
    return {
      preview: false,
      workspaceId: state.context.workspace.id,
      client,
    };
  } catch {
    warnCollectionMutation("authorization_unavailable", requestId);
    return null;
  }
}

function normalizeCollectionFields(formData: FormData) {
  const name = formString(formData, "name").replace(/\s+/g, " ");
  const description = formString(formData, "description");
  const rawCoverPrintingId = formString(formData, "coverPrintingId");
  const coverPrintingId = rawCoverPrintingId ? uuid(rawCoverPrintingId) : null;
  if (
    !name ||
    name.length > MAX_NAME_LENGTH ||
    description.length > MAX_DESCRIPTION_LENGTH ||
    (rawCoverPrintingId && !coverPrintingId)
  ) {
    return null;
  }
  return { name, description: description || null, coverPrintingId };
}

function isInventoryLine(value: unknown): value is InventoryLineInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.lineId === "string" &&
    lineId(item.lineId) !== null &&
    typeof item.printingId === "string" &&
    uuid(item.printingId) !== null &&
    typeof item.finish === "string" &&
    KNOWN_FINISHES.has(item.finish) &&
    typeof item.condition === "string" &&
    KNOWN_CONDITIONS.has(item.condition) &&
    typeof item.quantityDelta === "number" &&
    Number.isSafeInteger(item.quantityDelta) &&
    item.quantityDelta !== 0 &&
    Math.abs(item.quantityDelta) <= 10_000 &&
    (item.expectedQuantityBefore === undefined ||
      (typeof item.expectedQuantityBefore === "number" &&
        Number.isSafeInteger(item.expectedQuantityBefore) &&
        item.expectedQuantityBefore >= 0))
  );
}

function isTransferLine(value: unknown): value is TransferLineInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.lineId === "string" &&
    lineId(item.lineId) !== null &&
    typeof item.printingId === "string" &&
    uuid(item.printingId) !== null &&
    typeof item.finish === "string" &&
    KNOWN_FINISHES.has(item.finish) &&
    typeof item.condition === "string" &&
    KNOWN_CONDITIONS.has(item.condition) &&
    typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= 10_000 &&
    (item.expectedSourceQuantityBefore === undefined ||
      (typeof item.expectedSourceQuantityBefore === "number" &&
        Number.isSafeInteger(item.expectedSourceQuantityBefore) &&
        item.expectedSourceQuantityBefore >= 0)) &&
    (item.expectedDestinationQuantityBefore === undefined ||
      (typeof item.expectedDestinationQuantityBefore === "number" &&
        Number.isSafeInteger(item.expectedDestinationQuantityBefore) &&
        item.expectedDestinationQuantityBefore >= 0))
  );
}

function parseJsonLines<T>(value: string, validator: (item: unknown) => item is T): T[] | null {
  if (!value || value.length > 250_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.length >= 1 &&
      parsed.length <= MAX_TRANSACTION_LINES &&
      parsed.every(validator)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function createCollectionWithClient(
  client: CollectionRpcClient,
  input: {
    workspaceId: string;
    name: string;
    description: string | null;
    coverPrintingId: string | null;
  },
): Promise<RpcMutationResult<{ collectionId: string }>> {
  try {
    const result = await client.rpc(DATABASE_FUNCTIONS.collectionCreate, {
      p_workspace_id: input.workspaceId,
      p_name: input.name,
      p_description: input.description,
      p_cover_printing_id: input.coverPrintingId,
    });
    if (result.error) return rpcFailure(result.error);
    const data =
      typeof result.data === "object" && result.data !== null
        ? (result.data as Record<string, unknown>)
        : null;
    const collection =
      typeof data?.collection === "object" &&
      data.collection !== null &&
      !Array.isArray(data.collection)
        ? (data.collection as Record<string, unknown>)
        : null;
    const collectionId =
      typeof data?.collection_id === "string"
        ? data.collection_id
        : typeof data?.id === "string"
          ? data.id
          : typeof collection?.collection_id === "string"
            ? collection.collection_id
            : typeof collection?.id === "string"
              ? collection.id
              : null;
    return collectionId
      ? { ok: true, data: { collectionId } }
      : { ok: false, code: "invalid_response" };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function updateCollectionWithClient(
  client: CollectionRpcClient,
  input: {
    collectionId: string;
    name: string;
    description: string | null;
    coverPrintingId: string | null;
    expectedUpdatedAt: string;
  },
): Promise<RpcMutationResult<{ collectionId: string }>> {
  try {
    const result = await client.rpc(DATABASE_FUNCTIONS.collectionUpdate, {
      p_collection_id: input.collectionId,
      p_name: input.name,
      p_description: input.description,
      p_cover_printing_id: input.coverPrintingId,
      p_expected_updated_at: input.expectedUpdatedAt,
    });
    if (result.error) return rpcFailure(result.error);
    return { ok: true, data: { collectionId: input.collectionId } };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function changeCollectionLifecycleWithClient(
  client: CollectionRpcClient,
  operation: "archive" | "restore" | "delete",
  collectionId: string,
  expectedUpdatedAt: string,
): Promise<RpcMutationResult<{ collectionId: string }>> {
  const functions = {
    archive: DATABASE_FUNCTIONS.collectionArchive,
    restore: DATABASE_FUNCTIONS.collectionRestore,
    delete: DATABASE_FUNCTIONS.collectionDelete,
  };
  try {
    const result = await client.rpc(functions[operation], {
      p_collection_id: collectionId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    return result.error ? rpcFailure(result.error) : { ok: true, data: { collectionId } };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function applyInventoryWithClient(
  client: CollectionRpcClient,
  input: {
    collectionId: string;
    idempotencyKey: string;
    occurredAt: string;
    lines: InventoryLineInput[];
    note: string | null;
    externalReference?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<RpcMutationResult<InventoryMutationResult>> {
  try {
    const result = await client.rpc(DATABASE_FUNCTIONS.applyInventoryTransaction, {
      p_collection_id: input.collectionId,
      p_idempotency_key: input.idempotencyKey,
      p_occurred_at: input.occurredAt,
      p_lines: input.lines.map((line) => ({
        line_id: line.lineId,
        printing_id: line.printingId,
        finish: line.finish,
        condition: line.condition,
        quantity_delta: line.quantityDelta,
        ...(line.expectedQuantityBefore === undefined
          ? {}
          : { expected_quantity_before: line.expectedQuantityBefore }),
      })),
      p_note: input.note,
      p_external_reference: input.externalReference ?? null,
      p_metadata: input.metadata ?? {},
    });
    if (result.error) return rpcFailure(result.error);
    const parsed = parseInventoryMutationResult(result.data);
    return parsed ? { ok: true, data: parsed } : { ok: false, code: "invalid_response" };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function transferInventoryWithClient(
  client: CollectionRpcClient,
  input: {
    sourceCollectionId: string;
    destinationCollectionId: string;
    idempotencyKey: string;
    occurredAt: string;
    lines: TransferLineInput[];
    note: string | null;
  },
): Promise<RpcMutationResult<{ transferGroupId: string; replayed: boolean }>> {
  try {
    const result = await client.rpc(DATABASE_FUNCTIONS.transferInventory, {
      p_source_collection_id: input.sourceCollectionId,
      p_destination_collection_id: input.destinationCollectionId,
      p_idempotency_key: input.idempotencyKey,
      p_occurred_at: input.occurredAt,
      p_lines: input.lines.map((line) => ({
        line_id: line.lineId,
        printing_id: line.printingId,
        finish: line.finish,
        condition: line.condition,
        quantity: line.quantity,
        ...(line.expectedSourceQuantityBefore === undefined
          ? {}
          : { expected_source_quantity_before: line.expectedSourceQuantityBefore }),
        ...(line.expectedDestinationQuantityBefore === undefined
          ? {}
          : {
              expected_destination_quantity_before: line.expectedDestinationQuantityBefore,
            }),
      })),
      p_note: input.note,
      p_metadata: {},
    });
    if (result.error) return rpcFailure(result.error);
    const data =
      typeof result.data === "object" && result.data !== null
        ? (result.data as Record<string, unknown>)
        : null;
    return typeof data?.transfer_group_id === "string" && typeof data.replayed === "boolean"
      ? {
          ok: true,
          data: { transferGroupId: data.transfer_group_id, replayed: data.replayed },
        }
      : { ok: false, code: "invalid_response" };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function reverseInventoryWithClient(
  client: CollectionRpcClient,
  input: {
    transactionId: string;
    idempotencyKey: string;
    occurredAt: string;
    note: string | null;
  },
): Promise<RpcMutationResult<{ reversedTransactionIds: string[] }>> {
  try {
    const result = await client.rpc(DATABASE_FUNCTIONS.reverseInventoryTransaction, {
      p_transaction_id: input.transactionId,
      p_idempotency_key: input.idempotencyKey,
      p_occurred_at: input.occurredAt,
      p_note: input.note,
    });
    if (result.error) return rpcFailure(result.error);
    const data =
      typeof result.data === "object" && result.data !== null
        ? (result.data as Record<string, unknown>)
        : null;
    const ids = Array.isArray(data?.reversed_transaction_ids)
      ? data.reversed_transaction_ids.filter((value): value is string => typeof value === "string")
      : [];
    return ids.length
      ? { ok: true, data: { reversedTransactionIds: ids } }
      : { ok: false, code: "invalid_response" };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function createCollectionAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const fields = normalizeCollectionFields(formData);
  const authorized = await authorizedMutation(requestId);
  if (!fields || !authorized) {
    redirect(withStatus(COLLECTIONS_PATH, "collection_invalid", requestId));
  }
  if (authorized.preview) {
    redirect(
      withStatus(collectionPath("00000000-0000-4000-8000-000000002001"), "collection_created"),
    );
  }
  const result = await createCollectionWithClient(
    authorized.client as unknown as CollectionRpcClient,
    {
      workspaceId: authorized.workspaceId!,
      name: fields.name,
      description: fields.description,
      coverPrintingId: fields.coverPrintingId,
    },
  );
  if (!result.ok) {
    warnCollectionMutation(result.code, requestId);
    redirect(withStatus(COLLECTIONS_PATH, result.code, requestId));
  }
  revalidatePath(COLLECTIONS_PATH);
  redirect(withStatus(collectionPath(result.data.collectionId), "collection_created"));
}

export async function updateCollectionAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const collectionId = uuid(formString(formData, "collectionId"));
  const expectedUpdatedAt = formString(formData, "expectedUpdatedAt");
  const fields = normalizeCollectionFields(formData);
  const authorized = await authorizedMutation(requestId);
  if (!collectionId || !expectedUpdatedAt || !fields || !authorized) {
    redirect(withStatus(COLLECTIONS_PATH, "collection_invalid", requestId));
  }
  const returnTo = safeCollectionReturnPath(
    formString(formData, "returnTo"),
    collectionPath(collectionId),
  );
  if (!authorized.preview) {
    const result = await updateCollectionWithClient(
      authorized.client as unknown as CollectionRpcClient,
      {
        collectionId,
        name: fields.name,
        description: fields.description,
        coverPrintingId: fields.coverPrintingId,
        expectedUpdatedAt,
      },
    );
    if (!result.ok) {
      warnCollectionMutation(result.code, requestId);
      redirect(withStatus(returnTo, result.code, requestId));
    }
  }
  revalidatePath(collectionPath(collectionId));
  revalidatePath(COLLECTIONS_PATH);
  redirect(withStatus(returnTo, "collection_updated"));
}

export async function collectionLifecycleAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const collectionId = uuid(formString(formData, "collectionId"));
  const expectedUpdatedAt = formString(formData, "expectedUpdatedAt");
  const operation = formString(formData, "operation");
  const authorized = await authorizedMutation(requestId);
  if (
    !collectionId ||
    !expectedUpdatedAt ||
    (operation !== "archive" && operation !== "restore" && operation !== "delete") ||
    !authorized
  ) {
    redirect(withStatus(COLLECTIONS_PATH, "collection_invalid", requestId));
  }
  if (!authorized.preview) {
    const result = await changeCollectionLifecycleWithClient(
      authorized.client as unknown as CollectionRpcClient,
      operation,
      collectionId,
      expectedUpdatedAt,
    );
    if (!result.ok) {
      warnCollectionMutation(result.code, requestId);
      redirect(withStatus(collectionPath(collectionId), result.code, requestId));
    }
  }
  revalidatePath(COLLECTIONS_PATH);
  revalidatePath(collectionPath(collectionId));
  const statuses = {
    archive: "collection_archived",
    restore: "collection_restored",
    delete: "collection_deleted",
  } as const;
  redirect(
    withStatus(
      operation === "restore" ? collectionPath(collectionId) : COLLECTIONS_PATH,
      statuses[operation],
    ),
  );
}

export async function applyInventoryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const collectionId = uuid(formString(formData, "collectionId"));
  const printingId = uuid(formString(formData, "printingId"));
  const finish = formString(formData, "finish");
  const condition = formString(formData, "condition");
  const rawDelta = formString(formData, "quantityDelta");
  const quantityDelta = /^-?\d+$/.test(rawDelta) ? Number(rawDelta) : 0;
  const expectedQuantityBefore = optionalInteger(formString(formData, "expectedQuantityBefore"));
  const note = formString(formData, "note");
  const operationLineId = lineId(formString(formData, "lineId"));
  const operationIdempotencyKey = idempotencyKey(formString(formData, "idempotencyKey"));
  const operationOccurredAt = occurredAt(formString(formData, "occurredAt"));
  const authorized = await authorizedMutation(requestId);
  const returnTo = safeCollectionReturnPath(
    formString(formData, "returnTo"),
    collectionId ? collectionPath(collectionId) : COLLECTIONS_PATH,
  );
  if (
    !collectionId ||
    !printingId ||
    !KNOWN_FINISHES.has(finish) ||
    !KNOWN_CONDITIONS.has(condition) ||
    !Number.isSafeInteger(quantityDelta) ||
    quantityDelta === 0 ||
    Math.abs(quantityDelta) > 10_000 ||
    note.length > MAX_NOTE_LENGTH ||
    !operationLineId ||
    !operationIdempotencyKey ||
    !operationOccurredAt ||
    !authorized
  ) {
    redirect(withStatus(returnTo, "inventory_invalid", requestId));
  }
  if (!authorized.preview) {
    const result = await applyInventoryWithClient(
      authorized.client as unknown as CollectionRpcClient,
      {
        collectionId,
        idempotencyKey: operationIdempotencyKey,
        occurredAt: operationOccurredAt,
        lines: [
          {
            lineId: operationLineId,
            printingId,
            finish: finish as InventoryLineInput["finish"],
            condition: condition as InventoryLineInput["condition"],
            quantityDelta,
            ...(expectedQuantityBefore === undefined ? {} : { expectedQuantityBefore }),
          },
        ],
        note: note || null,
        externalReference: formString(formData, "externalReference") || null,
        metadata: { surface: formString(formData, "surface") || "collection" },
      },
    );
    if (!result.ok) {
      warnCollectionMutation(result.code, requestId);
      redirect(withStatus(returnTo, result.code, requestId));
    }
  }
  revalidatePath(collectionPath(collectionId));
  revalidatePath(`${collectionPath(collectionId)}/history`);
  redirect(withStatus(returnTo, quantityDelta > 0 ? "inventory_added" : "inventory_updated"));
}

export async function bulkInventoryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const sourceCollectionId = uuid(formString(formData, "collectionId"));
  const destinationCollectionId = uuid(formString(formData, "destinationCollectionId"));
  const operation = formString(formData, "operation");
  const note = formString(formData, "note");
  const operationIdempotencyKey = idempotencyKey(formString(formData, "idempotencyKey"));
  const operationOccurredAt = occurredAt(formString(formData, "occurredAt"));
  const returnTo = safeCollectionReturnPath(
    formString(formData, "returnTo"),
    sourceCollectionId ? collectionPath(sourceCollectionId) : COLLECTIONS_PATH,
  );
  const authorized = await authorizedMutation(requestId);
  if (
    !sourceCollectionId ||
    !["condition", "finish", "move", "remove"].includes(operation) ||
    note.length > MAX_NOTE_LENGTH ||
    !operationIdempotencyKey ||
    !operationOccurredAt ||
    !authorized
  ) {
    redirect(withStatus(returnTo, "inventory_invalid", requestId));
  }

  if (operation === "move") {
    const lines = parseJsonLines(formString(formData, "lines"), isTransferLine);
    if (!destinationCollectionId || destinationCollectionId === sourceCollectionId || !lines) {
      redirect(withStatus(returnTo, "inventory_invalid", requestId));
    }
    if (!authorized.preview) {
      const result = await transferInventoryWithClient(
        authorized.client as unknown as CollectionRpcClient,
        {
          sourceCollectionId,
          destinationCollectionId,
          idempotencyKey: operationIdempotencyKey,
          occurredAt: operationOccurredAt,
          lines,
          note: note || null,
        },
      );
      if (!result.ok) {
        redirect(withStatus(returnTo, result.code, requestId));
      }
    }
    revalidatePath(collectionPath(destinationCollectionId));
  } else {
    const lines = parseJsonLines(formString(formData, "lines"), isInventoryLine);
    if (!lines) redirect(withStatus(returnTo, "inventory_invalid", requestId));
    if (!authorized.preview) {
      const result = await applyInventoryWithClient(
        authorized.client as unknown as CollectionRpcClient,
        {
          collectionId: sourceCollectionId,
          idempotencyKey: operationIdempotencyKey,
          occurredAt: operationOccurredAt,
          lines,
          note: note || null,
          metadata: { surface: "bulk_collection" },
        },
      );
      if (!result.ok) {
        redirect(withStatus(returnTo, result.code, requestId));
      }
    }
  }
  revalidatePath(collectionPath(sourceCollectionId));
  revalidatePath(`${collectionPath(sourceCollectionId)}/history`);
  redirect(withStatus(returnTo, operation === "move" ? "inventory_moved" : "inventory_updated"));
}

export async function reverseInventoryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const transactionId = uuid(formString(formData, "transactionId"));
  const collectionId = uuid(formString(formData, "collectionId"));
  const note = formString(formData, "note");
  const operationIdempotencyKey = idempotencyKey(formString(formData, "idempotencyKey"));
  const operationOccurredAt = occurredAt(formString(formData, "occurredAt"));
  const authorized = await authorizedMutation(requestId);
  const returnTo = collectionId ? `${collectionPath(collectionId)}/history` : COLLECTIONS_PATH;
  if (
    !transactionId ||
    !collectionId ||
    note.length > MAX_NOTE_LENGTH ||
    !operationIdempotencyKey ||
    !operationOccurredAt ||
    !authorized
  ) {
    redirect(withStatus(returnTo, "inventory_invalid", requestId));
  }
  if (!authorized.preview) {
    const result = await reverseInventoryWithClient(
      authorized.client as unknown as CollectionRpcClient,
      {
        transactionId,
        idempotencyKey: operationIdempotencyKey,
        occurredAt: operationOccurredAt,
        note: note || null,
      },
    );
    if (!result.ok) {
      redirect(withStatus(returnTo, result.code, requestId));
    }
  }
  revalidatePath(collectionPath(collectionId));
  revalidatePath(returnTo);
  redirect(withStatus(returnTo, "inventory_reversed"));
}

export async function persistCollectionViewAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const view = formString(formData, "view");
  const returnTo = safeCollectionReturnPath(formString(formData, "returnTo"));
  const authorized = await authorizedMutation(requestId);
  if ((view !== "structured" && view !== "gallery" && view !== "analytical") || !authorized) {
    redirect(returnTo);
  }
  if (!authorized.preview) {
    const result = await authorized
      .client!.from(DATABASE_TABLES.userPreferences)
      .update({ collection_view: view as CollectionView })
      .select("user_id")
      .maybeSingle();
    if (result.error || !result.data) {
      warnCollectionMutation("collection_view_update_failed", requestId);
    }
  }
  revalidatePath(returnTo);
  redirect(returnTo);
}
