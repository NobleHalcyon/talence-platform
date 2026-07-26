import type { CurrentUserDatabaseContext, DatabaseProfile } from "@/lib/database/contracts";

export type AppAccessDecision =
  { allowed: true } | { allowed: false; reason: "admission" | "profile" | "workspace" };

export function decideAppAccess(context: CurrentUserDatabaseContext | null): AppAccessDecision {
  if (!context) {
    return { allowed: false, reason: "admission" };
  }
  if (context.profile.status !== "active") {
    return { allowed: false, reason: "profile" };
  }
  if (context.workspace.status !== "active") {
    return { allowed: false, reason: "workspace" };
  }
  return { allowed: true };
}

export function isProfileComplete(profile: DatabaseProfile): boolean {
  return Boolean(profile.display_name?.trim() && profile.handle?.trim());
}
