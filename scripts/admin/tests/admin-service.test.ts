import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryResultRow } from "pg";

import { AdminService } from "../admin-service.js";
import { runAdminCommand } from "../command.js";
import type { AdminRepository, AuthAdminGateway } from "../contracts.js";
import {
  readDatabaseUrl,
  readSupabaseAdminConfiguration,
  requireInvitationsEnabled,
  resolveInviteRedirect,
  resolveInvitationExpiration,
} from "../environment.js";
import { AdminOperationError } from "../errors.js";
import { PostgresAdminRepository } from "../postgres-repository.js";
import { SupabaseAuthAdminGateway } from "../supabase-auth-gateway.js";
import type {
  AuthUserIdentity,
  InvitationRecord,
  InvitationSelector,
  InviteAuthUserInput,
  MarkInvitationFailedInput,
  MarkInvitationSentInput,
  PlatformAdminGrant,
  PrepareInvitationInput,
  RevokeInvitationInput,
} from "../types.js";
import { normalizeEmail, requireInviteRedirect } from "../validation.js";

const invitationId = "10000000-0000-4000-8000-000000000001";
const authUserId = "20000000-0000-4000-8000-000000000002";
const actorUserId = "30000000-0000-4000-8000-000000000003";
const now = new Date("2026-07-26T20:00:00.000Z");

test("normalizes email deterministically and rejects malformed input", () => {
  assert.equal(normalizeEmail("  Collector@Example.COM  "), "collector@example.com");
  assert.throws(
    () => normalizeEmail("not an email"),
    (error: unknown) => error instanceof AdminOperationError && error.code === "invalid_email",
  );
});

test("accepts only the Talence callback and secure or local transports", () => {
  assert.equal(
    requireInviteRedirect(
      "https://talence.example/auth/callback?type=invite&next=/invite/complete",
    ),
    "https://talence.example/auth/callback?type=invite&next=/invite/complete",
  );
  assert.equal(
    requireInviteRedirect("http://localhost:3000/auth/callback?type=invite&next=/invite/complete"),
    "http://localhost:3000/auth/callback?type=invite&next=/invite/complete",
  );
  assert.equal(
    requireInviteRedirect("http://127.0.0.1:3000/auth/callback?type=invite&next=/invite/complete"),
    "http://127.0.0.1:3000/auth/callback?type=invite&next=/invite/complete",
  );
  assert.equal(
    requireInviteRedirect("http://[::1]:3000/auth/callback?type=invite&next=/invite/complete"),
    "http://[::1]:3000/auth/callback?type=invite&next=/invite/complete",
  );
  assert.throws(() => requireInviteRedirect("https://talence.example/app"));
  assert.throws(() =>
    requireInviteRedirect("http://talence.example/auth/callback?type=invite&next=/invite/complete"),
  );
  assert.throws(() =>
    requireInviteRedirect("http://203.0.113.10/auth/callback?type=invite&next=/invite/complete"),
  );
  assert.throws(() =>
    requireInviteRedirect("https://talence.example/auth/callback?next=/invite/complete"),
  );
});

test("prepares the private ledger before calling Auth Admin and persists sent state", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  const auth = new FakeAuthGateway(calls);
  const service = createService(repository, auth);

  const result = await service.inviteUser({
    email: " Collector@Example.COM ",
    expiresAt: "2026-08-02T20:00:00.000Z",
    invitedByUserId: actorUserId,
    note: "Private beta",
    redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
  });

  assert.deepEqual(calls, ["repository.prepare", "auth.invite", "repository.sent"]);
  assert.equal(repository.prepared?.email, "collector@example.com");
  assert.equal(repository.prepared?.invitedByUserId, actorUserId);
  assert.deepEqual(auth.inviteInput, {
    email: "collector@example.com",
    redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
    invitedUserId: invitationId,
  });
  assert.equal(repository.sent?.actorUserId, actorUserId);
  assert.equal(repository.sent?.authUserId, authUserId);
  assert.equal(result.invitation.status, "sent");
});

test("Auth gateway sends only the server-controlled invitation linkage metadata", async () => {
  let capturedEmail: string | null = null;
  let capturedOptions: unknown = null;
  const client = {
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, options: unknown) => {
          capturedEmail = email;
          capturedOptions = options;
          return {
            data: { user: { id: authUserId, email } },
            error: null,
          };
        },
      },
    },
  } as unknown as SupabaseClient;

  const gateway = new SupabaseAuthAdminGateway(client);
  await gateway.inviteUser({
    email: "collector@example.com",
    invitedUserId: invitationId,
    redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
  });

  assert.equal(capturedEmail, "collector@example.com");
  assert.deepEqual(capturedOptions, {
    data: { invited_user_id: invitationId },
    redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
  });
});

test("records only a safe code when Auth invitation issuance fails", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  const auth = new FakeAuthGateway(calls);
  auth.inviteError = Object.assign(new Error("provider detail with token SECRET_VALUE"), {
    status: 429,
  });
  const service = createService(repository, auth);

  await assert.rejects(
    service.inviteUser(validInviteInput()),
    (error: unknown) =>
      error instanceof AdminOperationError &&
      error.code === "auth_rate_limited" &&
      !error.message.includes("SECRET_VALUE"),
  );

  assert.deepEqual(calls, ["repository.prepare", "auth.invite", "repository.failed"]);
  assert.equal(repository.failed?.errorCode, "auth_rate_limited");
  assert.equal(repository.failed?.authUserId, null);
});

test("fails closed and removes the pending Auth user when sent-state persistence fails", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  repository.sentError = new Error("database unavailable");
  const auth = new FakeAuthGateway(calls);
  const service = createService(repository, auth);

  await assert.rejects(
    service.inviteUser(validInviteInput()),
    (error: unknown) =>
      error instanceof AdminOperationError && error.code === "invite_state_persist_failed",
  );

  assert.deepEqual(calls, [
    "repository.prepare",
    "auth.invite",
    "repository.sent",
    "repository.failed",
    "auth.delete",
  ]);
  assert.equal(repository.failed?.errorCode, "invite_state_persist_failed");
  assert.equal(repository.failed?.authUserId, authUserId);
  assert.equal(auth.deletedUserId, authUserId);
});

test("reports reconciliation when neither cross-system fail-closed path can be confirmed", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  repository.sentError = new Error("database unavailable");
  repository.failedError = new Error("database still unavailable");
  const auth = new FakeAuthGateway(calls);
  auth.deleteError = new Error("Auth unavailable");
  const service = createService(repository, auth);

  await assert.rejects(
    service.inviteUser(validInviteInput()),
    (error: unknown) =>
      error instanceof AdminOperationError && error.code === "invite_reconciliation_required",
  );
  assert.deepEqual(calls, [
    "repository.prepare",
    "auth.invite",
    "repository.sent",
    "repository.failed",
    "auth.delete",
    "repository.recordError",
  ]);
});

test("revokes the database admission before deleting a pending Auth identity", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  const auth = new FakeAuthGateway(calls);
  const service = createService(repository, auth);

  const result = await service.revokeInvite({
    actorUserId,
    selector: { email: "COLLECTOR@example.com" },
  });

  assert.deepEqual(calls, ["repository.revoke", "auth.delete"]);
  assert.equal(repository.revoked?.actorUserId, actorUserId);
  assert.deepEqual(repository.revoked?.selector, { email: "collector@example.com" });
  assert.equal(result.authUserDeleted, true);
  assert.equal(result.invitation.authUserId, null);
});

test("keeps admission revoked and records a safe error when Auth cleanup fails", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  const auth = new FakeAuthGateway(calls);
  auth.deleteError = Object.assign(new Error("provider secret detail"), { status: 503 });
  const service = createService(repository, auth);

  await assert.rejects(
    service.revokeInvite({ actorUserId, selector: { id: invitationId } }),
    (error: unknown) =>
      error instanceof AdminOperationError &&
      error.code === "invite_revoked_auth_cleanup_failed" &&
      !error.message.includes("secret detail"),
  );

  assert.deepEqual(calls, ["repository.revoke", "auth.delete", "repository.recordError"]);
  assert.equal(repository.recordedError?.errorCode, "auth_service_unavailable");
});

test("inspection passes an exact normalized selector and actor to the repository", async () => {
  const repository = new FakeRepository([]);
  const service = createService(repository, new FakeAuthGateway([]));

  const result = await service.inspectInvite({
    actorUserId,
    selector: { email: " Collector@Example.com " },
  });

  assert.deepEqual(repository.findInput, {
    actorUserId,
    selector: { email: "collector@example.com" },
  });
  assert.equal(result.effectiveStatus, "draft");
});

test("bootstraps only an exact Auth identity and delegates admitted-user verification", async () => {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  const auth = new FakeAuthGateway(calls);
  const service = createService(repository, auth);

  const result = await service.bootstrapPlatformAdmin({
    email: "COLLECTOR@example.com",
  });

  assert.deepEqual(calls, ["auth.findByEmail", "repository.bootstrap"]);
  assert.deepEqual(repository.bootstrapUser, {
    id: authUserId,
    email: "collector@example.com",
  });
  assert.deepEqual(result, { userId: authUserId, alreadyGranted: false });
});

test("rejects ambiguous bootstrap selectors before accessing Auth", async () => {
  const calls: string[] = [];
  const service = createService(new FakeRepository(calls), new FakeAuthGateway(calls));

  await assert.rejects(
    service.bootstrapPlatformAdmin({}),
    (error: unknown) =>
      error instanceof AdminOperationError && error.code === "invalid_bootstrap_selector",
  );
  await assert.rejects(
    service.bootstrapPlatformAdmin({
      email: "collector@example.com",
      userId: authUserId,
    }),
    (error: unknown) =>
      error instanceof AdminOperationError && error.code === "invalid_bootstrap_selector",
  );
  assert.deepEqual(calls, []);
});

test("command output omits raw unexpected errors and causes", async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runAdminCommand(
    async () => {
      throw new Error("provider diagnostic SENSITIVE_VALUE");
    },
    {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(stdout, []);
  assert.equal(stderr.length, 1);
  assert.match(stderr[0] ?? "", /admin_command_failed/u);
  assert.doesNotMatch(stderr[0] ?? "", /SENSITIVE_VALUE/u);
});

test("environment parsing requires distinct trusted credentials and matching database aliases", () => {
  const configuration = readSupabaseAdminConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: "sb_secret_test-only",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-only",
  });
  assert.equal(configuration.url, "http://127.0.0.1:54321");

  assert.throws(() =>
    readSupabaseAdminConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "sb_publishable_wrong",
    }),
  );
  assert.throws(() =>
    readDatabaseUrl({
      TALENCE_DATABASE_URL: "postgresql://postgres:one@localhost:5432/postgres",
      SUPABASE_DB_URL: "postgresql://postgres:two@localhost:5432/postgres",
    }),
  );
  assert.equal(
    readDatabaseUrl({
      TALENCE_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
    }),
    "postgresql://postgres:postgres@localhost:5432/postgres",
  );
});

test("invitation feature guard and TTL are explicit and bounded", () => {
  assert.throws(
    () => requireInvitationsEnabled({ FEATURE_INVITATIONS_ENABLED: "false" }),
    (error: unknown) =>
      error instanceof AdminOperationError && error.code === "invitations_disabled",
  );
  assert.doesNotThrow(() => requireInvitationsEnabled({ FEATURE_INVITATIONS_ENABLED: "true" }));
  assert.equal(
    resolveInviteRedirect({ NEXT_PUBLIC_APP_ORIGIN: "https://talence.example" }),
    "https://talence.example/auth/callback?type=invite&next=/invite/complete",
  );
  assert.equal(
    resolveInvitationExpiration({ INVITATION_DEFAULT_TTL_DAYS: "7" }, now),
    "2026-08-02T20:00:00.000Z",
  );
  assert.throws(() => resolveInvitationExpiration({}, now, "2026-08-01", "7"));
});

test("Postgres adapter invokes the locked prepare RPC with actor-first named parameters", async () => {
  let capturedSql = "";
  let capturedValues: readonly unknown[] = [];
  let released = false;
  const repository = new PostgresAdminRepository({
    connect: async () => ({
      query: async <Row extends QueryResultRow>(sql: string, values: readonly unknown[] = []) => {
        capturedSql = sql;
        capturedValues = values;
        return {
          rows: [{ result: invitationJson() }] as unknown as Row[],
          rowCount: 1,
        };
      },
      release: () => {
        released = true;
      },
    }),
    end: async () => {},
  });

  const result = await repository.prepareInvitation({
    email: "collector@example.com",
    invitedByUserId: actorUserId,
    expiresAt: "2026-08-02T20:00:00.000Z",
    note: "Private beta",
  });

  assert.match(capturedSql, /public\.admin_prepare_invited_user/u);
  assert.match(capturedSql, /p_actor_user_id/u);
  assert.match(capturedSql, /p_email/u);
  assert.deepEqual(capturedValues, [
    actorUserId,
    "collector@example.com",
    "2026-08-02T20:00:00.000Z",
    "Private beta",
  ]);
  assert.equal(result.id, invitationId);
  assert.equal(released, true);
});

test("Postgres adapter maps stable database rule codes without exposing raw detail", async () => {
  const repository = new PostgresAdminRepository({
    connect: async () => ({
      query: async <Row extends QueryResultRow>() => {
        throw Object.assign(new Error("talence_platform_admin_required"), {
          code: "P0001",
          detail: "connection secret",
        });
      },
      release: () => {},
    }),
    end: async () => {},
  });

  await assert.rejects(
    repository.findInvitation(null, { id: invitationId }),
    (error: unknown) =>
      error instanceof AdminOperationError &&
      error.code === "talence_platform_admin_required" &&
      !error.message.includes("connection secret"),
  );
});

test("Postgres adapter recognizes stable Talence errors across database SQLSTATEs", async () => {
  const repository = new PostgresAdminRepository({
    connect: async () => ({
      query: async <Row extends QueryResultRow>() => {
        throw Object.assign(new Error("talence_invitation_not_found"), {
          code: "P0002",
          detail: "private table detail",
        });
      },
      release: () => {},
    }),
    end: async () => {},
  });

  assert.equal(await repository.findInvitation(actorUserId, { id: invitationId }), null);
});

function createService(repository: FakeRepository, auth: FakeAuthGateway): AdminService {
  return new AdminService({
    repository,
    auth,
    now: () => now,
  });
}

function invitationJson(): Record<string, unknown> {
  return {
    id: invitationId,
    email: "collector@example.com",
    status: "draft",
    effective_status: "draft",
    invited_by_user_id: actorUserId,
    auth_user_id: null,
    expires_at: "2026-08-02T20:00:00.000Z",
    sent_at: null,
    accepted_at: null,
    revoked_at: null,
    last_error_code: null,
    note: "Private beta",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

function validInviteInput() {
  return {
    email: "collector@example.com",
    expiresAt: "2026-08-02T20:00:00.000Z",
    invitedByUserId: actorUserId,
    redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
  };
}

function invitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: invitationId,
    email: "collector@example.com",
    status: "draft",
    effectiveStatus: "draft",
    invitedByUserId: actorUserId,
    authUserId: null,
    expiresAt: "2026-08-02T20:00:00.000Z",
    sentAt: null,
    acceptedAt: null,
    revokedAt: null,
    lastErrorCode: null,
    note: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

class FakeRepository implements AdminRepository {
  readonly calls: string[];
  prepared: PrepareInvitationInput | null = null;
  sent: MarkInvitationSentInput | null = null;
  failed: MarkInvitationFailedInput | null = null;
  revoked: RevokeInvitationInput | null = null;
  recordedError: { actorUserId: string | null; invitationId: string; errorCode: string } | null =
    null;
  findInput: { actorUserId: string | null; selector: InvitationSelector } | null = null;
  bootstrapUser: AuthUserIdentity | null = null;
  sentError: unknown = null;
  failedError: unknown = null;

  constructor(calls: string[]) {
    this.calls = calls;
  }

  async prepareInvitation(input: PrepareInvitationInput): Promise<InvitationRecord> {
    this.calls.push("repository.prepare");
    this.prepared = input;
    return invitation({ invitedByUserId: input.invitedByUserId });
  }

  async markInvitationSent(input: MarkInvitationSentInput): Promise<InvitationRecord> {
    this.calls.push("repository.sent");
    this.sent = input;
    if (this.sentError) {
      throw this.sentError;
    }
    return invitation({
      status: "sent",
      effectiveStatus: "sent",
      authUserId: input.authUserId,
      sentAt: input.sentAt,
    });
  }

  async markInvitationFailed(input: MarkInvitationFailedInput): Promise<InvitationRecord> {
    this.calls.push("repository.failed");
    this.failed = input;
    if (this.failedError) {
      throw this.failedError;
    }
    return invitation({
      status: "failed",
      effectiveStatus: "failed",
      authUserId: input.authUserId,
      lastErrorCode: input.errorCode,
    });
  }

  async revokeInvitation(input: RevokeInvitationInput): Promise<InvitationRecord> {
    this.calls.push("repository.revoke");
    this.revoked = input;
    return invitation({
      status: "revoked",
      effectiveStatus: "revoked",
      authUserId,
      revokedAt: input.revokedAt,
    });
  }

  async recordInvitationError(
    actorUserId: string | null,
    invitationId_: string,
    errorCode: string,
  ): Promise<void> {
    this.calls.push("repository.recordError");
    this.recordedError = { actorUserId, invitationId: invitationId_, errorCode };
  }

  async findInvitation(
    actorUserId: string | null,
    selector: InvitationSelector,
  ): Promise<InvitationRecord | null> {
    this.calls.push("repository.find");
    this.findInput = { actorUserId, selector };
    return invitation();
  }

  async bootstrapPlatformAdmin(user: AuthUserIdentity): Promise<PlatformAdminGrant> {
    this.calls.push("repository.bootstrap");
    this.bootstrapUser = user;
    return { userId: user.id, alreadyGranted: false };
  }

  async close(): Promise<void> {}
}

class FakeAuthGateway implements AuthAdminGateway {
  readonly calls: string[];
  inviteInput: InviteAuthUserInput | null = null;
  deletedUserId: string | null = null;
  inviteError: unknown = null;
  deleteError: unknown = null;

  constructor(calls: string[]) {
    this.calls = calls;
  }

  async inviteUser(input: InviteAuthUserInput): Promise<AuthUserIdentity> {
    this.calls.push("auth.invite");
    this.inviteInput = input;
    if (this.inviteError) {
      throw this.inviteError;
    }
    return { id: authUserId, email: input.email };
  }

  async findUserByEmail(email: string): Promise<AuthUserIdentity | null> {
    this.calls.push("auth.findByEmail");
    return { id: authUserId, email };
  }

  async getUserById(userId: string): Promise<AuthUserIdentity | null> {
    this.calls.push("auth.getById");
    return { id: userId, email: "collector@example.com" };
  }

  async deleteUser(userId: string): Promise<"deleted" | "not_found"> {
    this.calls.push("auth.delete");
    this.deletedUserId = userId;
    if (this.deleteError) {
      throw this.deleteError;
    }
    return "deleted";
  }
}
