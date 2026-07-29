export const inviteStatuses = [
  "draft",
  "sent",
  "accepted",
  "revoked",
  "expired",
  "failed",
] as const;

export type InviteStatus = (typeof inviteStatuses)[number];

export interface InvitationRecord {
  id: string;
  email: string;
  status: InviteStatus;
  effectiveStatus: InviteStatus;
  invitedByUserId: string | null;
  authUserId: string | null;
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastErrorCode: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InvitationSelector = { id: string } | { email: string };

export interface PrepareInvitationInput {
  email: string;
  invitedByUserId: string | null;
  expiresAt: string;
  note: string | null;
}

export interface MarkInvitationSentInput {
  actorUserId: string | null;
  invitationId: string;
  authUserId: string;
  sentAt: string;
}

export interface MarkInvitationFailedInput {
  actorUserId: string | null;
  invitationId: string;
  errorCode: string;
  authUserId: string | null;
  failedAt: string;
}

export interface RevokeInvitationInput {
  actorUserId: string | null;
  selector: InvitationSelector;
  revokedAt: string;
}

export interface PlatformAdminGrant {
  userId: string;
  alreadyGranted: boolean;
}

export interface AuthUserIdentity {
  id: string;
  email: string | null;
}

export interface InviteAuthUserInput {
  email: string;
  redirectTo: string;
  invitedUserId: string;
}

export interface InviteUserInput {
  email: string;
  expiresAt: string;
  note?: string;
  invitedByUserId?: string;
  redirectTo: string;
}

export interface InviteUserResult {
  invitation: InvitationRecord;
  authUser: AuthUserIdentity;
}

export interface RevokeInviteResult {
  invitation: InvitationRecord;
  authUserDeleted: boolean;
}

export interface RevokeInviteInput {
  selector: InvitationSelector;
  actorUserId?: string;
}

export interface InspectInviteInput {
  selector: InvitationSelector;
  actorUserId?: string;
}

export interface BootstrapPlatformAdminInput {
  email?: string;
  userId?: string;
}
