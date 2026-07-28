"use server";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { statusHref } from "@/lib/auth/safe-status";
import {
  normalizeEmail,
  parseDateExpiration,
  readBoundedNote,
  validateUuid,
} from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS, type InvitedUserRecord } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getApplicationOrigin } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

import {
  issueAdmissionInvite,
  type InviteRepository,
  type ManagedAuthInviter,
  type PrepareInviteInput,
  type PreparedInvite,
} from "./invite-service";
import { invitationsEnabled } from "./config";

const ADMIN_INVITES_PATH = "/app/admin/invites";

type AttemptResult<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(operation: () => PromiseLike<T>): Promise<AttemptResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    return { ok: false };
  }
}

function warnAdminFailure(code: string, requestId: string, invitationId?: string): void {
  writeSecurityLog("warn", "invitation.administration.failed", {
    code,
    invitation_id: invitationId,
    request_id: requestId,
  });
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function redirectAdmin(status: string, requestId?: string): never {
  redirect(statusHref(ADMIN_INVITES_PATH, status, requestId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invitedUserId(value: unknown): PreparedInvite {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.email !== "string") {
    throw new Error("admin_rpc_invalid_result");
  }
  return { email: value.email, id: value.id };
}

function parseInvitedUser(value: unknown): InvitedUserRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    typeof value.status !== "string" ||
    typeof value.expires_at !== "string"
  ) {
    return null;
  }

  const nullable = (field: string): string | null =>
    typeof value[field] === "string" ? value[field] : null;

  return {
    accepted_at: nullable("accepted_at"),
    auth_user_id: nullable("auth_user_id"),
    created_at: nullable("created_at") ?? "",
    email: value.email,
    effective_status:
      typeof value.effective_status === "string"
        ? (value.effective_status as InvitedUserRecord["effective_status"])
        : (value.status as InvitedUserRecord["status"]),
    expires_at: value.expires_at,
    id: value.id,
    last_error_code: nullable("last_error_code"),
    note: nullable("note"),
    revoked_at: nullable("revoked_at"),
    sent_at: nullable("sent_at"),
    status: value.status as InvitedUserRecord["status"],
    updated_at: nullable("updated_at") ?? "",
  };
}

class SupabaseInviteRepository implements InviteRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async prepare(input: PrepareInviteInput): Promise<PreparedInvite> {
    const { data, error } = await this.client.rpc(DATABASE_FUNCTIONS.adminPrepareInvitedUser, {
      p_actor_user_id: input.actorUserId,
      p_email: input.email,
      p_expires_at: input.expiresAt,
      p_note: input.note ?? undefined,
    });
    if (error) {
      throw new Error("invite_prepare_failed");
    }
    return invitedUserId(data);
  }

  async markSent(input: {
    actorUserId: string;
    authUserId: string;
    invitationId: string;
  }): Promise<void> {
    const { error } = await this.client.rpc(DATABASE_FUNCTIONS.adminMarkInvitedUserSent, {
      p_actor_user_id: input.actorUserId,
      p_auth_user_id: input.authUserId,
      p_invited_user_id: input.invitationId,
    });
    if (error) {
      throw new Error("invite_mark_sent_failed");
    }
  }

  async markFailed(input: {
    actorUserId: string;
    authUserId: string | null;
    errorCode: string;
    invitationId: string;
  }): Promise<void> {
    const { error } = await this.client.rpc(DATABASE_FUNCTIONS.adminMarkInvitedUserFailed, {
      p_actor_user_id: input.actorUserId,
      p_auth_user_id: input.authUserId ?? undefined,
      p_error_code: input.errorCode,
      p_invited_user_id: input.invitationId,
    });
    if (error) {
      throw new Error("invite_mark_failed_failed");
    }
  }
}

function managedAuthInviter(client: SupabaseClient<Database>): ManagedAuthInviter {
  return {
    async remove(authUserId) {
      const { error } = await client.auth.admin.deleteUser(authUserId, false);
      if (error) {
        throw new Error("auth_cleanup_failed");
      }
    },
    async send({ email, invitedUserId, redirectTo }) {
      const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
        data: { invited_user_id: invitedUserId },
        redirectTo,
      });
      if (error || !data.user?.id) {
        throw new Error("auth_invite_failed");
      }
      return { authUserId: data.user.id };
    },
  };
}

function adminClient(requestId: string): SupabaseClient<Database> | null {
  try {
    return createAdminSupabaseClient();
  } catch {
    warnAdminFailure("admin_client_unavailable", requestId);
    return null;
  }
}

async function requirePlatformAdmin(requestId: string) {
  const contextAttempt = await attempt(() => getAppContextState());
  if (!contextAttempt.ok) {
    warnAdminFailure("admin_context_unavailable", requestId);
    return null;
  }

  const contextState = contextAttempt.value;
  if (contextState.status !== "ready" || !contextState.context.isPlatformAdmin) {
    return null;
  }
  return contextState.context;
}

async function sendInvite(
  input: Omit<PrepareInviteInput, "actorUserId">,
  actorUserId: string,
  workspaceId: string,
  requestId: string,
): Promise<never> {
  const trustedClient = adminClient(requestId);
  const origin = getApplicationOrigin();
  if (!trustedClient || !origin) {
    return redirectAdmin("configuration_required", requestId);
  }

  const quota = await attempt(() =>
    trustedClient.rpc(DATABASE_FUNCTIONS.consumeExternalServiceQuota, {
      p_service_key: "managed_auth_invitation",
      p_units: 1,
      p_user_id: actorUserId,
      p_workspace_id: workspaceId,
      p_correlation_id: requestId,
    }),
  );
  if (!quota.ok || quota.value.error) {
    const source = quota.ok
      ? `${quota.value.error?.code ?? ""} ${quota.value.error?.message ?? ""}`.toLowerCase()
      : "";
    const code = source.includes("quota_exceeded")
      ? "invite_rate_limited"
      : source.includes("service_disabled")
        ? "invite_disabled"
        : "invite_quota_unavailable";
    warnAdminFailure(code, requestId, input.invitationId);
    return redirectAdmin(
      code === "invite_rate_limited" || code === "invite_disabled" ? code : "invite_failed",
      requestId,
    );
  }

  const execution = await attempt(() =>
    issueAdmissionInvite(
      {
        ...input,
        actorUserId,
        redirectTo: `${origin}/auth/callback?type=invite&next=/invite/complete`,
      },
      new SupabaseInviteRepository(trustedClient),
      managedAuthInviter(trustedClient),
    ),
  );

  if (!execution.ok) {
    warnAdminFailure("invite_execution_failed", requestId, input.invitationId);
    return redirectAdmin("invite_failed", requestId);
  }

  const result = execution.value;
  if (!result.ok) {
    warnAdminFailure(result.code, requestId, result.invitationId);
    return redirectAdmin("invite_failed", requestId);
  }

  const audited = await attempt(() =>
    trustedClient.rpc(DATABASE_FUNCTIONS.recordServerAuditEvent, {
      p_actor_user_id: actorUserId,
      p_event_type: "invitation.issued",
      p_result_code: "succeeded",
      p_workspace_id: workspaceId,
      p_resource_type: "invited_user",
      p_resource_id: result.invitationId,
      p_correlation_id: requestId,
      p_metadata: {},
    }),
  );
  if (!audited.ok || audited.value.error) {
    warnAdminFailure("invite_audit_failed", requestId, result.invitationId);
  }

  revalidatePath(ADMIN_INVITES_PATH);
  redirectAdmin("invite_sent");
}

export async function issueInviteAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const context = await requirePlatformAdmin(requestId);
  if (!context) {
    return redirectAdmin("access_denied", requestId);
  }
  if (!invitationsEnabled()) {
    return redirectAdmin("invite_failed", requestId);
  }

  const email = normalizeEmail(formString(formData, "email"));
  const expiresAt = parseDateExpiration(formString(formData, "expiresAt"));
  const note = readBoundedNote(formData);
  if (!email.ok || !expiresAt.ok || !note.ok) {
    return redirectAdmin("invite_input_invalid", requestId);
  }

  return sendInvite(
    {
      email: email.value,
      expiresAt: expiresAt.value,
      note: note.value,
    },
    context.userId,
    context.workspace.id,
    requestId,
  );
}

export async function resendInviteAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const context = await requirePlatformAdmin(requestId);
  const invitationId = validateUuid(formString(formData, "invitationId"));
  if (!context || !invitationId.ok) {
    return redirectAdmin("access_denied", requestId);
  }
  if (!invitationsEnabled()) {
    return redirectAdmin("invite_failed", requestId);
  }

  const trustedClient = adminClient(requestId);
  if (!trustedClient) {
    return redirectAdmin("configuration_required", requestId);
  }

  const lookup = await attempt(() =>
    trustedClient.rpc(DATABASE_FUNCTIONS.adminGetInvitedUser, {
      p_actor_user_id: context.userId,
      p_invited_user_id: invitationId.value,
    }),
  );
  if (!lookup.ok) {
    warnAdminFailure("invite_lookup_failed", requestId, invitationId.value);
    return redirectAdmin("invite_failed", requestId);
  }

  const { data, error } = lookup.value;
  const invitation = parseInvitedUser(data);
  if (
    error ||
    !invitation ||
    !(
      (invitation.effective_status === "expired" && !invitation.auth_user_id) ||
      (["draft", "failed"].includes(invitation.status) && !invitation.auth_user_id)
    )
  ) {
    return redirectAdmin("invite_failed", requestId);
  }

  const ttlDays = Number(process.env.INVITATION_DEFAULT_TTL_DAYS ?? "7");
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + (Number.isFinite(ttlDays) ? ttlDays : 7));

  return sendInvite(
    {
      email: invitation.email,
      expiresAt: expiresAt.toISOString(),
      invitationId: invitation.id,
      note: invitation.note,
    },
    context.userId,
    context.workspace.id,
    requestId,
  );
}

export async function revokeInviteAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const context = await requirePlatformAdmin(requestId);
  const invitationId = validateUuid(formString(formData, "invitationId"));
  if (!context || !invitationId.ok) {
    return redirectAdmin("access_denied", requestId);
  }

  const trustedClient = adminClient(requestId);
  if (!trustedClient) {
    return redirectAdmin("configuration_required", requestId);
  }

  const lookup = await attempt(() =>
    trustedClient.rpc(DATABASE_FUNCTIONS.adminGetInvitedUser, {
      p_actor_user_id: context.userId,
      p_invited_user_id: invitationId.value,
    }),
  );
  if (!lookup.ok) {
    warnAdminFailure("invite_lookup_failed", requestId, invitationId.value);
    return redirectAdmin("invite_failed", requestId);
  }

  const invitation = parseInvitedUser(lookup.value.data);
  if (lookup.value.error || !invitation || invitation.status === "accepted") {
    return redirectAdmin("invite_failed", requestId);
  }

  if (invitation.status !== "revoked") {
    const revocation = await attempt(() =>
      trustedClient.rpc(DATABASE_FUNCTIONS.adminRevokeInvitedUser, {
        p_actor_user_id: context.userId,
        p_invited_user_id: invitationId.value,
      }),
    );
    if (!revocation.ok || revocation.value.error) {
      warnAdminFailure("invite_revoke_failed", requestId, invitation.id);
      return redirectAdmin("invite_failed", requestId);
    }
  }

  if (invitation.auth_user_id) {
    const cleanup = await attempt(() =>
      trustedClient.auth.admin.deleteUser(invitation.auth_user_id!, false),
    );
    if (!cleanup.ok || cleanup.value.error) {
      const recorded = await attempt(() =>
        trustedClient.rpc(DATABASE_FUNCTIONS.adminRecordInvitedUserError, {
          p_actor_user_id: context.userId,
          p_error_code: "auth_cleanup_failed",
          p_invited_user_id: invitation.id,
        }),
      );
      const auditFailed = !recorded.ok || Boolean(recorded.value.error);
      warnAdminFailure(
        auditFailed ? "cleanup_and_audit_failed" : "auth_cleanup_failed",
        requestId,
        invitation.id,
      );
      revalidatePath(ADMIN_INVITES_PATH);
      return redirectAdmin("invite_revoked_cleanup_pending", requestId);
    }
  }

  const audited = await attempt(() =>
    trustedClient.rpc(DATABASE_FUNCTIONS.recordServerAuditEvent, {
      p_actor_user_id: context.userId,
      p_event_type: "invitation.revoked",
      p_result_code: "succeeded",
      p_workspace_id: context.workspace.id,
      p_resource_type: "invited_user",
      p_resource_id: invitation.id,
      p_correlation_id: requestId,
      p_metadata: {},
    }),
  );
  if (!audited.ok || audited.value.error) {
    warnAdminFailure("invite_revoke_audit_failed", requestId, invitation.id);
  }

  revalidatePath(ADMIN_INVITES_PATH);
  redirectAdmin("invite_revoked");
}

export async function listInvitedUsers(): Promise<{
  error: boolean;
  invitations: InvitedUserRecord[];
}> {
  const requestId = randomUUID();
  const context = await requirePlatformAdmin(requestId);
  const trustedClient = adminClient(requestId);
  if (!context || !trustedClient) {
    return { error: true, invitations: [] };
  }

  const listing = await attempt(() =>
    trustedClient.rpc(DATABASE_FUNCTIONS.adminListInvitedUsers, {
      p_actor_user_id: context.userId,
      p_limit: 100,
    }),
  );
  if (!listing.ok) {
    warnAdminFailure("invite_list_failed", requestId);
    return { error: true, invitations: [] };
  }

  const { data, error } = listing.value;
  const values = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : [];
  return {
    error: Boolean(error),
    invitations: values
      .map(parseInvitedUser)
      .filter((value): value is InvitedUserRecord => value !== null),
  };
}
