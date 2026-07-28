"use server";

import { randomUUID } from "node:crypto";

import { DECK_ZONES, type DeckZone } from "@talence/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { validateUuid } from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticDeckPreviewEnabled } from "./config";
import {
  parseDeckDuplicateMutation,
  parseDeckEntriesReplacementMutation,
  parseDeckEntryMutation,
  parseDeckEntryRemovalMutation,
  parseDeckImportResolution,
  parseDeckMutation,
  parseDeckSourcesMutation,
} from "./parse";
import { PREVIEW_DECK_ID } from "./preview-constants";
import { previewDeckImportResolution } from "./preview";
import { safeDeckReturnPath } from "./query";
import {
  parseDeckTextImport,
  type DeckImportParseError,
  type DeckImportReviewLine,
  type DeckImportStageState,
} from "./text-import";
import type { DeckImportResolution, DeckMutationResult, DeckRpcClient } from "./types";

const DECKS_PATH = "/app/decks";
const EDITOR_ROLES = new Set(["owner", "admin", "editor"]);
const ZONES = new Set<string>(DECK_ZONES);
const FINISHES = new Set(["nonfoil", "foil", "etched"]);
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_NOTES_LENGTH = 8_000;
const MAX_ENTRY_NOTES_LENGTH = 2_000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_SOURCES = 20;
const MAX_REPLACEMENT_ENTRIES = 2_000;

type ServerClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

interface AuthorizedMutation {
  preview: boolean;
  workspaceId: string | null;
  client: ServerClient | null;
}

export interface DeckFields {
  name: string;
  formatCode: string;
  formatVersionId: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  coverPrintingId: string | null;
}

export interface ReplacementEntryInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
  preferredFinish: "nonfoil" | "foil" | "etched" | null;
  notes: string | null;
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: string): string | null {
  const result = validateUuid(value);
  return result.ok ? result.value : null;
}

function positiveInteger(value: string, maximum = 999): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function revision(value: string): number | null {
  return positiveInteger(value, Number.MAX_SAFE_INTEGER);
}

function parseTags(value: string): string[] | null {
  const tags = value
    .split(",")
    .map((tag) => tag.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const normalized = [...new Set(tags.map((tag) => tag.toLocaleLowerCase("en-US")))];
  return normalized.length <= MAX_TAGS &&
    normalized.every((tag) => tag.length <= MAX_TAG_LENGTH && !/[\r\n]/.test(tag))
    ? normalized
    : null;
}

function formatCode(value: string): string | null {
  return /^[a-z0-9][a-z0-9_-]{1,31}$/.test(value) ? value : null;
}

function parseDeckFields(formData: FormData, requireVersion: boolean): DeckFields | null {
  const name = formString(formData, "name").replace(/\s+/g, " ");
  const parsedFormatCode = formatCode(formString(formData, "formatCode"));
  const rawVersionId = formString(formData, "formatVersionId");
  const formatVersionId = rawVersionId ? uuid(rawVersionId) : null;
  const description = formString(formData, "description");
  const notes = formString(formData, "notes");
  const tags = parseTags(formString(formData, "tags"));
  const rawCoverPrintingId = formString(formData, "coverPrintingId");
  const coverPrintingId = rawCoverPrintingId ? uuid(rawCoverPrintingId) : null;
  if (
    !name ||
    name.length > MAX_NAME_LENGTH ||
    !parsedFormatCode ||
    (requireVersion && !formatVersionId) ||
    description.length > MAX_DESCRIPTION_LENGTH ||
    notes.length > MAX_NOTES_LENGTH ||
    !tags ||
    (rawCoverPrintingId && !coverPrintingId)
  ) {
    return null;
  }
  return {
    name,
    formatCode: parsedFormatCode,
    formatVersionId,
    description: description || null,
    notes: notes || null,
    tags,
    coverPrintingId,
  };
}

function collectionIds(formData: FormData): string[] | null {
  const ids = formData
    .getAll("collectionIds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => uuid(value.trim()));
  if (
    ids.length > MAX_SOURCES ||
    ids.some((value) => value === null) ||
    new Set(ids).size !== ids.length
  ) {
    return null;
  }
  return ids as string[];
}

function zone(value: string): DeckZone | null {
  return ZONES.has(value) ? (value as DeckZone) : null;
}

function preferredSelection(formData: FormData) {
  const rawPrintingId = formString(formData, "preferredPrintingId");
  const rawFinish = formString(formData, "preferredFinish");
  const preferredPrintingId = rawPrintingId ? uuid(rawPrintingId) : null;
  const preferredFinish = rawFinish && FINISHES.has(rawFinish) ? rawFinish : null;
  if (
    (rawPrintingId && !preferredPrintingId) ||
    Boolean(preferredPrintingId) !== Boolean(preferredFinish)
  ) {
    return null;
  }
  return {
    preferredPrintingId,
    preferredFinish: preferredFinish as "nonfoil" | "foil" | "etched" | null,
  };
}

function withStatus(pathname: string, status: string, requestId?: string): string {
  const parsed = new URL(pathname, "https://talence.invalid");
  parsed.searchParams.set("status", status);
  if (requestId) parsed.searchParams.set("request_id", requestId);
  return `${parsed.pathname}${parsed.search}`;
}

function deckPath(deckId: string): string {
  return `${DECKS_PATH}/${deckId}`;
}

function mutationFailure(
  error: { code?: string; message?: string } | null,
): DeckMutationResult<never> {
  const value = `${error?.code ?? ""} ${error?.message ?? ""}`.toLocaleLowerCase("en-US");
  const code =
    value.includes("permission") || value.includes("42501")
      ? "permission_denied"
      : value.includes("not_found")
        ? "not_found"
        : value.includes("stale") || value.includes("expected_updated")
          ? "stale_deck"
          : value.includes("duplicate")
            ? "duplicate_entry"
            : value.includes("preferred") || value.includes("finish")
              ? "preferred_printing_invalid"
              : value.includes("collection") || value.includes("source")
                ? "source_invalid"
                : value.includes("format")
                  ? "format_invalid"
                  : "mutation_failed";
  return { ok: false, code };
}

async function authorizedMutation(requestId: string): Promise<AuthorizedMutation | null> {
  try {
    const state = await getAppContextState();
    if (state.status === "unconfigured" && staticDeckPreviewEnabled()) {
      return { preview: true, workspaceId: null, client: null };
    }
    if (state.status !== "ready" || !EDITOR_ROLES.has(state.context.workspace.role)) return null;
    const client = await createServerSupabaseClient();
    if (!client) return null;
    return {
      preview: false,
      workspaceId: state.context.workspace.id,
      client,
    };
  } catch {
    writeSecurityLog("warn", "deck.mutation.authorization_failed", {
      request_id: requestId,
    });
    return null;
  }
}

async function rpcMutation<T>(
  client: DeckRpcClient,
  functionName: string,
  args: Record<string, unknown>,
  parse: (value: unknown) => T | null,
): Promise<DeckMutationResult<T>> {
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) return mutationFailure(result.error);
    const parsed = parse(result.data);
    return parsed === null ? { ok: false, code: "invalid_response" } : { ok: true, data: parsed };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}

export async function createDeckWithClient(
  client: DeckRpcClient,
  input: {
    workspaceId: string;
    fields: DeckFields;
    collectionIds: string[];
  },
): Promise<DeckMutationResult<{ deckId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckCreate,
    {
      p_workspace_id: input.workspaceId,
      p_name: input.fields.name,
      p_format_code: input.fields.formatCode,
      p_description: input.fields.description,
      p_notes: input.fields.notes,
      p_tags: input.fields.tags,
      p_collection_ids: input.collectionIds,
    },
    (value) => {
      const parsed = parseDeckMutation(value, {
        workspaceId: input.workspaceId,
        resultRevision: 1,
        status: "active",
        formatCode: input.fields.formatCode,
        formatVersionId: input.fields.formatVersionId,
        name: input.fields.name,
        description: input.fields.description,
        notes: input.fields.notes,
        tags: input.fields.tags,
        coverPrintingId: input.fields.coverPrintingId,
      });
      return parsed ? { deckId: parsed.deckId } : null;
    },
  );
}

export async function updateDeckWithClient(
  client: DeckRpcClient,
  deckId: string,
  fields: DeckFields,
  expectedRevision: number,
): Promise<DeckMutationResult<{ deckId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckUpdate,
    {
      p_deck_id: deckId,
      p_name: fields.name,
      p_description: fields.description,
      p_notes: fields.notes,
      p_tags: fields.tags,
      p_format_code: fields.formatCode,
      p_format_version_id: fields.formatVersionId,
      p_cover_printing_id: fields.coverPrintingId,
      p_expected_revision: expectedRevision,
    },
    (value) => {
      const parsed = parseDeckMutation(value, {
        deckId,
        expectedRevision,
        status: "active",
        formatCode: fields.formatCode,
        formatVersionId: fields.formatVersionId,
        name: fields.name,
        description: fields.description,
        notes: fields.notes,
        tags: fields.tags,
        coverPrintingId: fields.coverPrintingId,
      });
      return parsed ? { deckId: parsed.deckId } : null;
    },
  );
}

export async function duplicateDeckWithClient(
  client: DeckRpcClient,
  deckId: string,
  expectedRevision: number,
  name: string | null,
): Promise<DeckMutationResult<{ deckId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckDuplicate,
    { p_deck_id: deckId, p_expected_revision: expectedRevision, p_name: name },
    (value) => {
      const parsed = parseDeckDuplicateMutation(value, {
        sourceDeckId: deckId,
        name,
      });
      return parsed ? { deckId: parsed.deckId } : null;
    },
  );
}

export async function lifecycleDeckWithClient(
  client: DeckRpcClient,
  operation: "archive" | "restore" | "delete",
  deckId: string,
  expectedRevision: number,
): Promise<DeckMutationResult<{ deckId: string }>> {
  const functions = {
    archive: DATABASE_FUNCTIONS.deckArchive,
    restore: DATABASE_FUNCTIONS.deckRestore,
    delete: DATABASE_FUNCTIONS.deckDelete,
  };
  return rpcMutation(
    client,
    functions[operation],
    { p_deck_id: deckId, p_expected_revision: expectedRevision },
    (value) => {
      const parsed = parseDeckMutation(value, {
        deckId,
        expectedRevision,
        status:
          operation === "archive" ? "archived" : operation === "restore" ? "active" : "deleted",
      });
      return parsed ? { deckId: parsed.deckId } : null;
    },
  );
}

export async function replaceDeckSourcesWithClient(
  client: DeckRpcClient,
  deckId: string,
  ids: string[],
  expectedRevision: number,
): Promise<DeckMutationResult<{ deckId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckSourcesReplace,
    {
      p_deck_id: deckId,
      p_collection_ids: ids,
      p_expected_revision: expectedRevision,
    },
    (value) => {
      const parsed = parseDeckSourcesMutation(value, {
        deckId,
        expectedRevision,
        collectionIds: ids,
      });
      return parsed ? { deckId: parsed.deckId } : null;
    },
  );
}

export async function addDeckEntryWithClient(
  client: DeckRpcClient,
  input: {
    deckId: string;
    cardId: string;
    zone: DeckZone;
    quantity: number;
    expectedRevision: number;
    preferredPrintingId: string | null;
    preferredFinish: "nonfoil" | "foil" | "etched" | null;
    notes: string | null;
  },
): Promise<DeckMutationResult<{ entryId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckEntryAdd,
    {
      p_deck_id: input.deckId,
      p_card_id: input.cardId,
      p_zone: input.zone,
      p_quantity: input.quantity,
      p_expected_revision: input.expectedRevision,
      p_preferred_printing_id: input.preferredPrintingId,
      p_preferred_finish: input.preferredFinish,
      p_notes: input.notes,
    },
    (value) => {
      const parsed = parseDeckEntryMutation(value, {
        deckId: input.deckId,
        expectedRevision: input.expectedRevision,
        cardId: input.cardId,
        zone: input.zone,
        quantity: input.quantity,
        preferredPrintingId: input.preferredPrintingId,
        preferredFinish: input.preferredFinish,
        notes: input.notes,
      });
      return parsed ? { entryId: parsed.entryId } : null;
    },
  );
}

export async function updateDeckEntryWithClient(
  client: DeckRpcClient,
  input: {
    deckId: string;
    entryId: string;
    quantity: number;
    zone: DeckZone;
    preferredPrintingId: string | null;
    preferredFinish: "nonfoil" | "foil" | "etched" | null;
    notes: string | null;
    expectedRevision: number;
  },
): Promise<DeckMutationResult<{ entryId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckEntryUpdate,
    {
      p_entry_id: input.entryId,
      p_quantity: input.quantity,
      p_zone: input.zone,
      p_preferred_printing_id: input.preferredPrintingId,
      p_preferred_finish: input.preferredFinish,
      p_notes: input.notes,
      p_expected_revision: input.expectedRevision,
    },
    (value) => {
      const parsed = parseDeckEntryMutation(value, {
        deckId: input.deckId,
        entryId: input.entryId,
        expectedRevision: input.expectedRevision,
        zone: input.zone,
        quantity: input.quantity,
        preferredPrintingId: input.preferredPrintingId,
        preferredFinish: input.preferredFinish,
        notes: input.notes,
      });
      return parsed ? { entryId: parsed.entryId } : null;
    },
  );
}

export async function removeDeckEntryWithClient(
  client: DeckRpcClient,
  deckId: string,
  entryId: string,
  expectedRevision: number,
): Promise<DeckMutationResult<{ entryId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckEntryRemove,
    { p_entry_id: entryId, p_expected_revision: expectedRevision },
    (value) => {
      const parsed = parseDeckEntryRemovalMutation(value, {
        deckId,
        entryId,
        expectedRevision,
      });
      return parsed ? { entryId: parsed.entryId } : null;
    },
  );
}

export async function replaceDeckEntriesWithClient(
  client: DeckRpcClient,
  deckId: string,
  entries: ReplacementEntryInput[],
  expectedRevision: number,
): Promise<DeckMutationResult<{ deckId: string }>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckEntriesReplace,
    {
      p_deck_id: deckId,
      p_entries: entries.map((entry) => ({
        card_id: entry.cardId,
        zone: entry.zone,
        quantity: entry.quantity,
        preferred_printing_id: entry.preferredPrintingId,
        preferred_finish: entry.preferredFinish,
        notes: entry.notes,
      })),
      p_expected_revision: expectedRevision,
    },
    (value) => {
      const parsed = parseDeckEntriesReplacementMutation(value, {
        deckId,
        expectedRevision,
        entryCount: entries.length,
      });
      return parsed ? { deckId: parsed.deckId } : null;
    },
  );
}

export async function resolveDeckImportWithClient(
  client: DeckRpcClient,
  deckId: string,
  names: Array<{ lineId: string; name: string }>,
): Promise<DeckMutationResult<DeckImportResolution>> {
  return rpcMutation(
    client,
    DATABASE_FUNCTIONS.deckImportResolve,
    {
      p_deck_id: deckId,
      p_names: names.map((item) => ({
        line_id: item.lineId,
        name: item.name,
      })),
    },
    (value) => parseDeckImportResolution(value, deckId, names),
  );
}

function mutationReturnPath(formData: FormData, deckId: string): string {
  return safeDeckReturnPath(formString(formData, "returnTo"), deckPath(deckId));
}

export async function createDeckAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const fields = parseDeckFields(formData, false);
  const sources = collectionIds(formData);
  const authorized = await authorizedMutation(requestId);
  if (!fields || !sources || !authorized) {
    redirect(withStatus(DECKS_PATH, "deck_invalid", requestId));
  }
  if (authorized.preview) {
    redirect(withStatus(deckPath(PREVIEW_DECK_ID), "deck_created"));
  }
  const result = await createDeckWithClient(authorized.client as unknown as DeckRpcClient, {
    workspaceId: authorized.workspaceId!,
    fields,
    collectionIds: sources,
  });
  if (!result.ok) redirect(withStatus(DECKS_PATH, result.code, requestId));
  revalidatePath(DECKS_PATH);
  redirect(withStatus(deckPath(result.data.deckId), "deck_created"));
}

export async function updateDeckAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const fields = parseDeckFields(formData, true);
  const authorized = await authorizedMutation(requestId);
  if (!deckId || expectedRevision === null || !fields || !authorized) {
    redirect(withStatus(DECKS_PATH, "deck_invalid", requestId));
  }
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await updateDeckWithClient(
      authorized.client as unknown as DeckRpcClient,
      deckId,
      fields,
      expectedRevision,
    );
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  revalidatePath(DECKS_PATH);
  redirect(withStatus(returnTo, "deck_updated"));
}

export async function duplicateDeckAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const rawName = formString(formData, "name").replace(/\s+/g, " ");
  const name = rawName || null;
  const authorized = await authorizedMutation(requestId);
  if (
    !deckId ||
    expectedRevision === null ||
    (name && name.length > MAX_NAME_LENGTH) ||
    !authorized
  ) {
    redirect(withStatus(DECKS_PATH, "deck_invalid", requestId));
  }
  if (authorized.preview) {
    redirect(withStatus(deckPath(PREVIEW_DECK_ID), "deck_duplicated"));
  }
  const result = await duplicateDeckWithClient(
    authorized.client as unknown as DeckRpcClient,
    deckId,
    expectedRevision,
    name,
  );
  if (!result.ok) redirect(withStatus(DECKS_PATH, result.code, requestId));
  revalidatePath(DECKS_PATH);
  redirect(withStatus(deckPath(result.data.deckId), "deck_duplicated"));
}

export async function deckLifecycleAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const operation = formString(formData, "operation");
  const authorized = await authorizedMutation(requestId);
  if (
    !deckId ||
    expectedRevision === null ||
    (operation !== "archive" && operation !== "restore" && operation !== "delete") ||
    !authorized
  ) {
    redirect(withStatus(DECKS_PATH, "deck_invalid", requestId));
  }
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await lifecycleDeckWithClient(
      authorized.client as unknown as DeckRpcClient,
      operation,
      deckId,
      expectedRevision,
    );
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(DECKS_PATH);
  if (operation !== "delete") revalidatePath(deckPath(deckId));
  redirect(withStatus(operation === "delete" ? DECKS_PATH : returnTo, `deck_${operation}d`));
}

export async function replaceDeckSourcesAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const ids = collectionIds(formData);
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const authorized = await authorizedMutation(requestId);
  if (!deckId || !ids || expectedRevision === null || !authorized)
    redirect(withStatus(DECKS_PATH, "source_invalid", requestId));
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await replaceDeckSourcesWithClient(
      authorized.client as unknown as DeckRpcClient,
      deckId,
      ids,
      expectedRevision,
    );
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  redirect(withStatus(returnTo, "sources_updated"));
}

export async function addDeckEntryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const cardId = uuid(formString(formData, "cardId"));
  const parsedZone = zone(formString(formData, "zone"));
  const quantity = positiveInteger(formString(formData, "quantity"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const preferred = preferredSelection(formData);
  const notes = formString(formData, "notes");
  const authorized = await authorizedMutation(requestId);
  if (
    !deckId ||
    !cardId ||
    !parsedZone ||
    quantity === null ||
    expectedRevision === null ||
    !preferred ||
    notes.length > MAX_ENTRY_NOTES_LENGTH ||
    !authorized
  ) {
    redirect(withStatus(DECKS_PATH, "entry_invalid", requestId));
  }
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await addDeckEntryWithClient(authorized.client as unknown as DeckRpcClient, {
      deckId,
      cardId,
      zone: parsedZone,
      quantity,
      expectedRevision,
      ...preferred,
      notes: notes || null,
    });
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  redirect(withStatus(returnTo, "entry_added"));
}

export async function updateDeckEntryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const entryId = uuid(formString(formData, "entryId"));
  const parsedZone = zone(formString(formData, "zone"));
  const quantity = positiveInteger(formString(formData, "quantity"));
  const preferred = preferredSelection(formData);
  const notes = formString(formData, "notes");
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const authorized = await authorizedMutation(requestId);
  if (
    !deckId ||
    !entryId ||
    !parsedZone ||
    quantity === null ||
    !preferred ||
    notes.length > MAX_ENTRY_NOTES_LENGTH ||
    expectedRevision === null ||
    !authorized
  ) {
    redirect(withStatus(DECKS_PATH, "entry_invalid", requestId));
  }
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await updateDeckEntryWithClient(authorized.client as unknown as DeckRpcClient, {
      deckId,
      entryId,
      quantity,
      zone: parsedZone,
      ...preferred,
      notes: notes || null,
      expectedRevision,
    });
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  redirect(withStatus(returnTo, "entry_updated"));
}

export async function removeDeckEntryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const entryId = uuid(formString(formData, "entryId"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const authorized = await authorizedMutation(requestId);
  if (!deckId || !entryId || expectedRevision === null || !authorized) {
    redirect(withStatus(DECKS_PATH, "entry_invalid", requestId));
  }
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await removeDeckEntryWithClient(
      authorized.client as unknown as DeckRpcClient,
      deckId,
      entryId,
      expectedRevision,
    );
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  redirect(withStatus(returnTo, "entry_removed"));
}

function replacementEntry(value: unknown): value is ReplacementEntryInput {
  const item =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!item) return false;
  const parsedCardId = typeof item.cardId === "string" ? uuid(item.cardId) : null;
  const parsedZone = typeof item.zone === "string" ? zone(item.zone) : null;
  const parsedPrinting =
    typeof item.preferredPrintingId === "string" ? uuid(item.preferredPrintingId) : null;
  const parsedFinish =
    typeof item.preferredFinish === "string" && FINISHES.has(item.preferredFinish)
      ? item.preferredFinish
      : null;
  return Boolean(
    parsedCardId &&
    parsedZone &&
    typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= 999 &&
    (item.preferredPrintingId === null || parsedPrinting) &&
    Boolean(parsedPrinting) === Boolean(parsedFinish) &&
    (item.notes === null ||
      (typeof item.notes === "string" && item.notes.length <= MAX_ENTRY_NOTES_LENGTH)),
  );
}

export async function replaceDeckEntriesAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const payload = formString(formData, "entries");
  let entries: ReplacementEntryInput[] | null = null;
  try {
    const parsed: unknown = JSON.parse(payload);
    entries =
      Array.isArray(parsed) &&
      parsed.length <= MAX_REPLACEMENT_ENTRIES &&
      parsed.every(replacementEntry)
        ? parsed
        : null;
  } catch {
    entries = null;
  }
  const authorized = await authorizedMutation(requestId);
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  if (!deckId || !entries || expectedRevision === null || !authorized) {
    redirect(withStatus(DECKS_PATH, "import_invalid", requestId));
  }
  const returnTo = mutationReturnPath(formData, deckId);
  if (!authorized.preview) {
    const result = await replaceDeckEntriesWithClient(
      authorized.client as unknown as DeckRpcClient,
      deckId,
      entries,
      expectedRevision,
    );
    if (!result.ok) redirect(withStatus(returnTo, result.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  redirect(withStatus(returnTo, "deck_imported"));
}

function importStageError(
  requestId: string,
  message: string,
  errors: DeckImportParseError[],
): DeckImportStageState {
  return { status: "error", requestId, message, errors };
}

async function resolveImport(
  authorized: AuthorizedMutation,
  deckId: string,
  names: Array<{ lineId: string; name: string }>,
): Promise<DeckMutationResult<DeckImportResolution>> {
  return authorized.preview
    ? {
        ok: true,
        data: previewDeckImportResolution(deckId, names),
      }
    : resolveDeckImportWithClient(authorized.client as unknown as DeckRpcClient, deckId, names);
}

export async function stageDeckImportAction(
  _previousState: DeckImportStageState,
  formData: FormData,
): Promise<DeckImportStageState> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const sourceValue = formData.get("deckText");
  const fileValue = formData.get("deckFile");
  const source =
    fileValue instanceof File && fileValue.size > 0
      ? fileValue.size <= 256 * 1024
        ? await fileValue.text()
        : "x".repeat(256 * 1024 + 1)
      : typeof sourceValue === "string"
        ? sourceValue
        : "";
  const authorized = await authorizedMutation(requestId);
  if (!deckId || expectedRevision === null || !authorized) {
    return importStageError(requestId, "The import could not be staged.", [
      {
        lineNumber: null,
        code: "invalid_line",
        message: "Reload this private deck and try staging the decklist again.",
      },
    ]);
  }
  const parsed = parseDeckTextImport(source);
  if (!parsed.ok) {
    return importStageError(
      requestId,
      "Fix every parse error before oracle cards are resolved.",
      parsed.errors,
    );
  }
  const names = parsed.lines.map((line, index) => ({
    lineId: `line-${index + 1}`,
    name: line.name,
  }));
  const result = await resolveImport(authorized, deckId, names);
  if (!result.ok) {
    return importStageError(
      requestId,
      result.code === "permission_denied"
        ? "Permission denied. Nothing was staged."
        : "Oracle resolution is temporarily unavailable.",
      [
        {
          lineNumber: null,
          code: "invalid_line",
          message: `Nothing changed. Support reference: ${requestId}.`,
        },
      ],
    );
  }
  const resolvedById = new Map(result.data.items.map((item) => [item.lineId, item]));
  const rows: DeckImportReviewLine[] = [];
  for (let index = 0; index < parsed.lines.length; index += 1) {
    const line = parsed.lines[index]!;
    const lineId = names[index]!.lineId;
    const resolved = resolvedById.get(lineId);
    if (!resolved || resolved.inputName !== line.name) {
      return importStageError(requestId, "Oracle resolution returned an invalid response.", [
        {
          lineNumber: line.lineNumber,
          code: "invalid_line",
          message: `Line ${line.lineNumber} was not resolved safely. Nothing changed.`,
        },
      ]);
    }
    rows.push({
      ...line,
      lineId,
      status: resolved.status,
      candidateCount: resolved.candidateCount,
      candidates: resolved.candidates,
      candidatesTruncated: resolved.candidatesTruncated,
      suggestionsOmitted: resolved.suggestionsOmitted,
    });
  }
  return {
    status: "ready",
    requestId,
    byteCount: parsed.byteCount,
    physicalLineCount: parsed.physicalLineCount,
    rows,
    counts: result.data.counts,
  };
}

interface ImportCommitRow {
  lineId: string;
  name: string;
  zone: DeckZone;
  quantity: number;
}

function importCommitRows(value: string): ImportCommitRow[] | null {
  if (new TextEncoder().encode(value).byteLength > 1024 * 1024) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_REPLACEMENT_ENTRIES) {
    return null;
  }
  const rows: ImportCommitRow[] = [];
  const ids = new Set<string>();
  for (const raw of parsed) {
    const item =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    const lineId =
      typeof item?.lineId === "string" && /^line-[1-9]\d{0,3}$/.test(item.lineId)
        ? item.lineId
        : null;
    const name =
      typeof item?.name === "string" ? item.name.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
    const parsedZone = typeof item?.zone === "string" ? zone(item.zone) : null;
    const quantity =
      typeof item?.quantity === "number" &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity >= 1 &&
      item.quantity <= 999
        ? item.quantity
        : null;
    if (
      !lineId ||
      ids.has(lineId) ||
      !name ||
      name.length > 240 ||
      !parsedZone ||
      quantity === null
    ) {
      return null;
    }
    ids.add(lineId);
    rows.push({ lineId, name, zone: parsedZone, quantity });
  }
  return rows;
}

export async function commitDeckImportAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deckId = uuid(formString(formData, "deckId"));
  const expectedRevision = revision(formString(formData, "expectedRevision"));
  const rows = importCommitRows(formString(formData, "reviewRows"));
  const authorized = await authorizedMutation(requestId);
  if (!deckId || expectedRevision === null || !rows || !authorized) {
    redirect(withStatus(DECKS_PATH, "import_invalid", requestId));
  }
  const importPath = `${deckPath(deckId)}/import`;
  const result = await resolveImport(
    authorized,
    deckId,
    rows.map((row) => ({ lineId: row.lineId, name: row.name })),
  );
  if (!result.ok) redirect(withStatus(importPath, result.code, requestId));
  const byId = new Map(result.data.items.map((item) => [item.lineId, item]));
  const merged = new Map<string, ReplacementEntryInput>();
  for (const row of rows) {
    const resolved = byId.get(row.lineId);
    if (!resolved || resolved.inputName !== row.name || resolved.status === "unresolved") {
      redirect(withStatus(importPath, "import_unresolved", requestId));
    }
    const selectedId =
      resolved.status === "exact"
        ? resolved.candidates[0]?.cardId
        : uuid(formString(formData, `resolution_${row.lineId}`));
    if (!selectedId || !resolved.candidates.some((candidate) => candidate.cardId === selectedId)) {
      redirect(withStatus(importPath, "import_ambiguous", requestId));
    }
    const key = `${row.zone}\u0000${selectedId}`;
    const existing = merged.get(key);
    const quantity = (existing?.quantity ?? 0) + row.quantity;
    if (quantity > 999) redirect(withStatus(importPath, "import_invalid", requestId));
    merged.set(key, {
      cardId: selectedId,
      zone: row.zone,
      quantity,
      preferredPrintingId: null,
      preferredFinish: null,
      notes: null,
    });
  }
  if (!authorized.preview) {
    const committed = await replaceDeckEntriesWithClient(
      authorized.client as unknown as DeckRpcClient,
      deckId,
      [...merged.values()],
      expectedRevision,
    );
    if (!committed.ok) redirect(withStatus(importPath, committed.code, requestId));
  }
  revalidatePath(deckPath(deckId));
  redirect(withStatus(deckPath(deckId), "deck_imported"));
}
