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
} from "./types.js";

export interface AdminRepository {
  prepareInvitation(input: PrepareInvitationInput): Promise<InvitationRecord>;
  markInvitationSent(input: MarkInvitationSentInput): Promise<InvitationRecord>;
  markInvitationFailed(input: MarkInvitationFailedInput): Promise<InvitationRecord>;
  revokeInvitation(input: RevokeInvitationInput): Promise<InvitationRecord>;
  recordInvitationError(
    actorUserId: string | null,
    invitationId: string,
    errorCode: string,
  ): Promise<void>;
  findInvitation(
    actorUserId: string | null,
    selector: InvitationSelector,
  ): Promise<InvitationRecord | null>;
  bootstrapPlatformAdmin(user: AuthUserIdentity): Promise<PlatformAdminGrant>;
  close(): Promise<void>;
}

export interface AuthAdminGateway {
  inviteUser(input: InviteAuthUserInput): Promise<AuthUserIdentity>;
  findUserByEmail(email: string): Promise<AuthUserIdentity | null>;
  getUserById(userId: string): Promise<AuthUserIdentity | null>;
  deleteUser(userId: string): Promise<"deleted" | "not_found">;
}
