import "server-only";

export function invitationsEnabled(): boolean {
  return process.env.FEATURE_INVITATIONS_ENABLED === "true";
}
