import type { AdminRepository, AuthAdminGateway } from "./contracts.js";
import { AdminOperationError, safeAuthErrorCode } from "./errors.js";
import type {
  AuthUserIdentity,
  BootstrapPlatformAdminInput,
  InspectInviteInput,
  InvitationRecord,
  InviteUserInput,
  InviteUserResult,
  PlatformAdminGrant,
  RevokeInviteInput,
  RevokeInviteResult,
} from "./types.js";
import {
  normalizeEmail,
  normalizeOptionalNote,
  normalizeSelector,
  requireFutureInstant,
  requireInviteRedirect,
  requireUuid,
} from "./validation.js";

export interface AdminServiceDependencies {
  repository: AdminRepository;
  auth: AuthAdminGateway;
  now?: () => Date;
}

export class AdminService {
  readonly #repository: AdminRepository;
  readonly #auth: AuthAdminGateway;
  readonly #now: () => Date;

  constructor(dependencies: AdminServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#auth = dependencies.auth;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
    const now = this.#now();
    const email = normalizeEmail(input.email);
    const expiration = requireFutureInstant(input.expiresAt, now);
    const redirectTo = requireInviteRedirect(input.redirectTo);
    const invitedByUserId =
      input.invitedByUserId === undefined
        ? null
        : requireUuid(input.invitedByUserId, "Inviting user ID");

    const invitation = await this.#repository.prepareInvitation({
      email,
      invitedByUserId,
      expiresAt: expiration,
      note: normalizeOptionalNote(input.note),
    });
    if (invitation.status === "sent" && invitation.effectiveStatus === "sent") {
      throw new AdminOperationError(
        "invitation_already_sent",
        "A valid sent invitation already exists for this email.",
        "conflict",
      );
    }
    if (
      normalizeEmail(invitation.email) !== email ||
      invitation.status !== "draft" ||
      invitation.effectiveStatus !== "draft"
    ) {
      throw new AdminOperationError(
        "invitation_prepare_contract_invalid",
        "The prepared admission row did not match the requested email and draft state. Auth was not called.",
        "external",
      );
    }

    let authUser: AuthUserIdentity;
    try {
      authUser = await this.#auth.inviteUser({
        email,
        redirectTo,
        invitedUserId: invitation.id,
      });
    } catch (error) {
      const errorCode = safeAuthErrorCode("invite", error);
      await this.#recordFailedInvitation(invitedByUserId, invitation.id, errorCode, null, now);
      throw new AdminOperationError(
        errorCode,
        "Supabase Auth did not issue the invitation. The admission row was retained with a safe failure status.",
        "external",
        error,
      );
    }

    if (authUser.email === null || normalizeEmail(authUser.email) !== email) {
      await this.#rollbackIssuedAuthUser(
        invitedByUserId,
        invitation.id,
        authUser.id,
        "auth_email_mismatch",
        now,
      );
      throw new AdminOperationError(
        "auth_email_mismatch",
        "Supabase Auth returned an identity that did not match the invited email. The invitation was failed closed.",
        "external",
      );
    }

    try {
      const sentInvitation = await this.#repository.markInvitationSent({
        actorUserId: invitedByUserId,
        invitationId: invitation.id,
        authUserId: requireUuid(authUser.id, "Supabase Auth user ID"),
        sentAt: now.toISOString(),
      });
      return { invitation: sentInvitation, authUser };
    } catch (error) {
      await this.#rollbackIssuedAuthUser(
        invitedByUserId,
        invitation.id,
        authUser.id,
        "invite_state_persist_failed",
        now,
      );
      throw new AdminOperationError(
        "invite_state_persist_failed",
        "Auth issued the invitation, but Talence could not persist the sent state. The Auth identity was revoked when possible and the invitation was failed closed.",
        "external",
        error,
      );
    }
  }

  async revokeInvite(input: RevokeInviteInput): Promise<RevokeInviteResult> {
    const actorUserId = normalizeActorUserId(input.actorUserId);
    const invitation = await this.#repository.revokeInvitation({
      actorUserId,
      selector: normalizeSelector(input.selector),
      revokedAt: this.#now().toISOString(),
    });

    if (invitation.authUserId === null) {
      return { invitation, authUserDeleted: false };
    }

    try {
      const result = await this.#auth.deleteUser(invitation.authUserId);
      return {
        invitation: result === "deleted" ? { ...invitation, authUserId: null } : invitation,
        authUserDeleted: result === "deleted",
      };
    } catch (error) {
      const errorCode = safeAuthErrorCode("delete", error);
      try {
        await this.#repository.recordInvitationError(actorUserId, invitation.id, errorCode);
      } catch {
        // The revocation itself already committed and remains the fail-closed authority.
      }
      throw new AdminOperationError(
        "invite_revoked_auth_cleanup_failed",
        "The Talence invitation is revoked and application admission is blocked, but the pending Auth identity could not be removed.",
        "external",
        error,
      );
    }
  }

  async inspectInvite(input: InspectInviteInput): Promise<InvitationRecord> {
    const invitation = await this.#repository.findInvitation(
      normalizeActorUserId(input.actorUserId),
      normalizeSelector(input.selector),
    );
    if (invitation === null) {
      throw new AdminOperationError(
        "invitation_not_found",
        "No invitation matched the supplied selector.",
        "not_found",
      );
    }
    return invitation;
  }

  async bootstrapPlatformAdmin(input: BootstrapPlatformAdminInput): Promise<PlatformAdminGrant> {
    const hasEmail = input.email !== undefined;
    const hasUserId = input.userId !== undefined;
    if (hasEmail === hasUserId) {
      throw new AdminOperationError(
        "invalid_bootstrap_selector",
        "Provide exactly one of email or user ID.",
        "validation",
      );
    }

    const user =
      input.email !== undefined
        ? await this.#auth.findUserByEmail(normalizeEmail(input.email))
        : await this.#auth.getUserById(requireUuid(input.userId ?? "", "User ID"));

    if (user === null) {
      throw new AdminOperationError(
        "auth_user_not_found",
        "No Supabase Auth user matched the supplied selector.",
        "not_found",
      );
    }
    if (user.email === null) {
      throw new AdminOperationError(
        "auth_email_missing",
        "The Supabase Auth identity has no verified email and cannot be bootstrapped.",
        "conflict",
      );
    }

    return this.#repository.bootstrapPlatformAdmin({
      id: requireUuid(user.id, "Supabase Auth user ID"),
      email: normalizeEmail(user.email),
    });
  }

  async #recordFailedInvitation(
    actorUserId: string | null,
    invitationId: string,
    errorCode: string,
    authUserId: string | null,
    at: Date,
  ): Promise<void> {
    try {
      await this.#repository.markInvitationFailed({
        actorUserId,
        invitationId,
        errorCode,
        authUserId,
        failedAt: at.toISOString(),
      });
    } catch (recordingError) {
      throw new AdminOperationError(
        "invite_failure_recording_failed",
        "Invitation issuance failed and Talence could not record the safe failure status.",
        "external",
        recordingError,
      );
    }
  }

  async #rollbackIssuedAuthUser(
    actorUserId: string | null,
    invitationId: string,
    authUserId: string,
    errorCode: string,
    at: Date,
  ): Promise<void> {
    let stateFailedClosed = false;
    try {
      await this.#repository.markInvitationFailed({
        actorUserId,
        invitationId,
        errorCode,
        authUserId: requireUuid(authUserId, "Supabase Auth user ID"),
        failedAt: at.toISOString(),
      });
      stateFailedClosed = true;
    } catch {
      // Auth cleanup below provides the second independent fail-closed path.
    }

    let authIdentityRemoved = false;
    try {
      await this.#auth.deleteUser(authUserId);
      authIdentityRemoved = true;
    } catch {
      try {
        await this.#repository.recordInvitationError(
          actorUserId,
          invitationId,
          `${errorCode}_auth_cleanup_failed`,
        );
      } catch {
        // There is no safe additional recovery inside a cross-system operation.
      }
    }

    if (!stateFailedClosed && !authIdentityRemoved) {
      throw new AdminOperationError(
        "invite_reconciliation_required",
        "Auth issued an invitation, but neither the failed admission state nor Auth cleanup could be confirmed. Inspect the invitation and Auth identity before retrying.",
        "external",
      );
    }
  }
}

function normalizeActorUserId(input: string | undefined): string | null {
  return input === undefined ? null : requireUuid(input, "Acting platform administrator ID");
}
