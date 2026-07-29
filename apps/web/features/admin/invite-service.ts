export interface PrepareInviteInput {
  actorUserId: string;
  email: string;
  expiresAt: string;
  invitationId?: string;
  note: string | null;
}

export interface PreparedInvite {
  email: string;
  id: string;
}

export interface SentAuthInvitation {
  authUserId: string;
}

export interface InviteRepository {
  markFailed(input: {
    actorUserId: string;
    authUserId: string | null;
    errorCode: string;
    invitationId: string;
  }): Promise<void>;
  markSent(input: { actorUserId: string; authUserId: string; invitationId: string }): Promise<void>;
  prepare(input: PrepareInviteInput): Promise<PreparedInvite>;
}

export interface ManagedAuthInviter {
  remove(authUserId: string): Promise<void>;
  send(input: {
    email: string;
    invitedUserId: string;
    redirectTo: string;
  }): Promise<SentAuthInvitation>;
}

export type IssueInviteResult =
  | { ok: true; invitationId: string }
  | {
      ok: false;
      code: "auth_invite_failed" | "invite_prepare_failed" | "invite_state_failed";
      invitationId?: string;
    };

export async function issueAdmissionInvite(
  input: PrepareInviteInput & { redirectTo: string },
  repository: InviteRepository,
  authInviter: ManagedAuthInviter,
): Promise<IssueInviteResult> {
  let prepared: PreparedInvite;
  try {
    // Canonical ordering: the admission ledger row must commit before Auth is
    // allowed to create a human identity.
    prepared = await repository.prepare(input);
  } catch {
    return { ok: false, code: "invite_prepare_failed" };
  }

  let authUserId: string | null = null;
  try {
    const invitation = await authInviter.send({
      email: prepared.email,
      invitedUserId: prepared.id,
      redirectTo: input.redirectTo,
    });
    authUserId = invitation.authUserId;
  } catch {
    try {
      await repository.markFailed({
        actorUserId: input.actorUserId,
        authUserId,
        errorCode: "auth_invite_failed",
        invitationId: prepared.id,
      });
    } catch {
      // The caller receives the safe failure either way. Operational recovery
      // uses the invitation ID and database audit state, never a raw provider
      // error or secret.
    }
    return {
      ok: false,
      code: "auth_invite_failed",
      invitationId: prepared.id,
    };
  }

  try {
    await repository.markSent({
      actorUserId: input.actorUserId,
      authUserId,
      invitationId: prepared.id,
    });
  } catch {
    let failureCode = "invite_state_failed";
    let linkedAuthUserId: string | null = authUserId;
    try {
      await authInviter.remove(authUserId);
      linkedAuthUserId = null;
    } catch {
      failureCode = "auth_cleanup_failed";
    }

    try {
      await repository.markFailed({
        actorUserId: input.actorUserId,
        authUserId: linkedAuthUserId,
        errorCode: failureCode,
        invitationId: prepared.id,
      });
    } catch {
      // See the recovery note above. The provider identity is linked through
      // server-controlled metadata, and finalization still fails closed.
    }
    return {
      ok: false,
      code: "invite_state_failed",
      invitationId: prepared.id,
    };
  }

  return { ok: true, invitationId: prepared.id };
}
