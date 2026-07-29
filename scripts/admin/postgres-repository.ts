import { Pool, type QueryResultRow } from "pg";

import type { AdminRepository } from "./contracts.js";
import { AdminOperationError, isAdminOperationError } from "./errors.js";
import { inviteStatuses } from "./types.js";
import type {
  AuthUserIdentity,
  InvitationRecord,
  InvitationSelector,
  InviteStatus,
  MarkInvitationFailedInput,
  MarkInvitationSentInput,
  PlatformAdminGrant,
  PrepareInvitationInput,
  RevokeInvitationInput,
} from "./types.js";

interface DatabaseClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
}

interface DatabasePool {
  connect(): Promise<DatabaseClient>;
  end(): Promise<void>;
}

interface JsonResultRow extends QueryResultRow {
  result: unknown;
}

export function createPostgresAdminRepository(connectionString: string): PostgresAdminRepository {
  const pool = new Pool({
    application_name: "talence-admin-cli",
    connectionString,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    max: 1,
  });
  return new PostgresAdminRepository(pool);
}

/**
 * Calls the database-owned admission functions over a trusted direct PostgreSQL
 * session. The private admission schema remains outside PostgREST, while the
 * functions retain transition, locking, and actor-authorization ownership.
 */
export class PostgresAdminRepository implements AdminRepository {
  readonly #pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.#pool = pool;
  }

  async prepareInvitation(input: PrepareInvitationInput): Promise<InvitationRecord> {
    const result = await this.#callJson(
      `
        select public.admin_prepare_invited_user(
          p_actor_user_id => $1::uuid,
          p_email => $2::text,
          p_expires_at => $3::timestamptz,
          p_note => $4::text
        ) as result
      `,
      [input.invitedByUserId, input.email, input.expiresAt, input.note],
    );
    return parseInvitation(result);
  }

  async markInvitationSent(input: MarkInvitationSentInput): Promise<InvitationRecord> {
    const result = await this.#callJson(
      `
        select public.admin_mark_invited_user_sent(
          p_actor_user_id => $1::uuid,
          p_invited_user_id => $2::uuid,
          p_auth_user_id => $3::uuid
        ) as result
      `,
      [input.actorUserId, input.invitationId, input.authUserId],
    );
    return parseInvitation(result);
  }

  async markInvitationFailed(input: MarkInvitationFailedInput): Promise<InvitationRecord> {
    const result = await this.#callJson(
      `
        select public.admin_mark_invited_user_failed(
          p_actor_user_id => $1::uuid,
          p_invited_user_id => $2::uuid,
          p_error_code => $3::text,
          p_auth_user_id => $4::uuid
        ) as result
      `,
      [input.actorUserId, input.invitationId, input.errorCode, input.authUserId],
    );
    return parseInvitation(result);
  }

  async revokeInvitation(input: RevokeInvitationInput): Promise<InvitationRecord> {
    const invitationId =
      "id" in input.selector
        ? input.selector.id
        : (await this.findInvitation(input.actorUserId, input.selector))?.id;
    if (!invitationId) {
      throw new AdminOperationError(
        "invitation_not_found",
        "No invitation matched the supplied selector.",
        "not_found",
      );
    }

    const result = await this.#callJson(
      `
        select public.admin_revoke_invited_user(
          p_actor_user_id => $1::uuid,
          p_invited_user_id => $2::uuid
        ) as result
      `,
      [input.actorUserId, invitationId],
    );
    return parseInvitation(result);
  }

  async recordInvitationError(
    actorUserId: string | null,
    invitationId: string,
    errorCode: string,
  ): Promise<void> {
    await this.#callJson(
      `
        select public.admin_record_invited_user_error(
          p_actor_user_id => $1::uuid,
          p_invited_user_id => $2::uuid,
          p_error_code => $3::text
        ) as result
      `,
      [actorUserId, invitationId, errorCode],
    );
  }

  async findInvitation(
    actorUserId: string | null,
    selector: InvitationSelector,
  ): Promise<InvitationRecord | null> {
    try {
      const result = await this.#callJson(
        `
          select public.admin_get_invited_user(
            p_actor_user_id => $1::uuid,
            p_invited_user_id => $2::uuid,
            p_email => $3::text
          ) as result
        `,
        [
          actorUserId,
          "id" in selector ? selector.id : null,
          "email" in selector ? selector.email : null,
        ],
      );
      return result === null ? null : parseInvitation(result);
    } catch (error) {
      if (
        error instanceof AdminOperationError &&
        (error.code === "talence_invitation_not_found" || error.code === "invitation_not_found")
      ) {
        return null;
      }
      throw error;
    }
  }

  async bootstrapPlatformAdmin(user: AuthUserIdentity): Promise<PlatformAdminGrant> {
    const result = await this.#callJson(
      `
        select public.admin_bootstrap_platform_admin(
          p_user_id => $1::uuid
        ) as result
      `,
      [user.id],
    );
    const object = requireJsonObject(result);
    if (requireJsonString(object, "role") !== "platform_admin") {
      throw databaseFieldError("role");
    }
    requireJsonInstant(object, "created_at");
    const returnedUserId = requireJsonUuid(object, "user_id");
    if (returnedUserId !== user.id) {
      throw databaseFieldError("user_id");
    }
    return {
      userId: returnedUserId,
      alreadyGranted: requireJsonBoolean(object, "already_granted"),
    };
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async #callJson(sql: string, values: readonly unknown[]): Promise<unknown> {
    return this.#databaseOperation(async () => {
      const client = await this.#pool.connect();
      try {
        const query = await client.query<JsonResultRow>(sql, values);
        if (query.rows.length !== 1 || !("result" in query.rows[0]!)) {
          throw new AdminOperationError(
            "database_contract_invalid",
            "The database administration function returned an invalid result.",
            "external",
          );
        }
        return parseJsonValue(query.rows[0]!.result);
      } finally {
        client.release();
      }
    });
  }

  async #databaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isAdminOperationError(error)) {
        throw error;
      }

      const postgresCode = postgresErrorField(error, "code");
      const postgresMessage = postgresErrorField(error, "message");
      if (postgresMessage?.match(/^talence_[a-z0-9_]+$/u)) {
        throw new AdminOperationError(
          postgresMessage,
          databaseRuleMessage(postgresMessage),
          databaseRuleKind(postgresMessage, postgresCode),
          error,
        );
      }
      if (postgresCode === "42501") {
        throw new AdminOperationError(
          "platform_admin_required",
          "A current platform administrator is required for this trusted operation.",
          "conflict",
          error,
        );
      }
      if (postgresCode === "23503") {
        throw new AdminOperationError(
          "database_reference_invalid",
          "A referenced Auth user or admission record does not exist.",
          "conflict",
          error,
        );
      }
      throw new AdminOperationError(
        "database_operation_failed",
        "The trusted database operation failed. No SQL, credentials, or raw database detail was printed.",
        "external",
        error,
      );
    }
  }
}

function parseInvitation(value: unknown): InvitationRecord {
  const object = requireJsonObject(value);
  return {
    id: requireJsonUuid(object, "id"),
    email: requireJsonString(object, "email"),
    status: requireInviteStatus(requireJsonString(object, "status")),
    effectiveStatus: requireInviteStatus(requireJsonString(object, "effective_status")),
    invitedByUserId: nullableJsonUuid(object, "invited_by_user_id"),
    authUserId: nullableJsonUuid(object, "auth_user_id"),
    expiresAt: requireJsonInstant(object, "expires_at"),
    sentAt: nullableJsonInstant(object, "sent_at"),
    acceptedAt: nullableJsonInstant(object, "accepted_at"),
    revokedAt: nullableJsonInstant(object, "revoked_at"),
    lastErrorCode: nullableJsonString(object, "last_error_code"),
    note: nullableJsonString(object, "note"),
    createdAt: requireJsonInstant(object, "created_at"),
    updatedAt: requireJsonInstant(object, "updated_at"),
  };
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new AdminOperationError(
      "database_contract_invalid",
      "The database administration function returned invalid JSON.",
      "external",
    );
  }
}

function requireJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AdminOperationError(
      "database_contract_invalid",
      "The database administration function returned an invalid object.",
      "external",
    );
  }
  return value as Record<string, unknown>;
}

function requireJsonString(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw databaseFieldError(key);
  }
  return value;
}

function requireJsonBoolean(object: Record<string, unknown>, key: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") {
    throw databaseFieldError(key);
  }
  return value;
}

function requireJsonUuid(object: Record<string, unknown>, key: string): string {
  const value = requireJsonString(object, key).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) {
    throw databaseFieldError(key);
  }
  return value;
}

function nullableJsonString(object: Record<string, unknown>, key: string): string | null {
  const value = object[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw databaseFieldError(key);
  }
  return value;
}

function nullableJsonUuid(object: Record<string, unknown>, key: string): string | null {
  const value = nullableJsonString(object, key);
  if (value === null) {
    return null;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw databaseFieldError(key);
  }
  return value.toLowerCase();
}

function requireJsonInstant(object: Record<string, unknown>, key: string): string {
  const value = requireJsonString(object, key);
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw databaseFieldError(key);
  }
  return instant.toISOString();
}

function nullableJsonInstant(object: Record<string, unknown>, key: string): string | null {
  const value = nullableJsonString(object, key);
  if (value === null) {
    return null;
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw databaseFieldError(key);
  }
  return instant.toISOString();
}

function requireInviteStatus(value: string): InviteStatus {
  if ((inviteStatuses as readonly string[]).includes(value)) {
    return value as InviteStatus;
  }
  throw databaseFieldError("status");
}

function databaseFieldError(key: string): AdminOperationError {
  return new AdminOperationError(
    "database_contract_invalid",
    `The database administration result has an invalid ${key} field.`,
    "external",
  );
}

function postgresErrorField(error: unknown, field: string): string | null {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return null;
  }
  const value = Reflect.get(error, field);
  return typeof value === "string" ? value : null;
}

function databaseRuleMessage(code: string): string {
  switch (code) {
    case "talence_platform_admin_required":
      return "A current platform administrator is required for this trusted operation.";
    case "talence_invitation_not_found":
    case "talence_invited_user_not_found":
      return "No invitation matched the supplied selector.";
    case "talence_invitation_email_already_accepted":
    case "talence_invitation_already_accepted":
      return "An accepted admission cannot be changed as a pending invitation.";
    case "talence_invitation_auth_user_still_linked":
      return "A prior Auth identity is still linked; revoke or reconcile it before inviting again.";
    case "talence_invitation_already_sent":
      return "A valid sent invitation already exists for this email.";
    case "talence_accepted_invitation_not_revocable":
      return "An accepted admission cannot be revoked as a pending invitation.";
    case "talence_platform_admin_already_bootstrapped":
    case "talence_bootstrap_already_completed":
      return "A different platform administrator already exists; the one-time bootstrap is closed.";
    case "talence_bootstrap_user_not_admitted":
      return "The bootstrap user must have an active profile and matching accepted admission.";
    default:
      return "The database rejected the operation under a Talence admission rule.";
  }
}

function databaseRuleKind(
  code: string,
  postgresCode: string | null,
): "configuration" | "validation" | "conflict" | "not_found" | "external" {
  if (code.endsWith("_not_found") || postgresCode === "P0002") {
    return "not_found";
  }
  return postgresCode === "22023" ? "validation" : "conflict";
}
