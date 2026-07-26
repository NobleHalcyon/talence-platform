import { describe, expect, it } from "vitest";

import { decideAppAccess, isProfileComplete } from "@/lib/auth/access";
import type { CurrentUserDatabaseContext } from "@/lib/database/contracts";

const activeContext: CurrentUserDatabaseContext = {
  is_platform_admin: false,
  profile: {
    avatar_path: null,
    default_collection_id: "33333333-3333-4333-8333-333333333333",
    default_workspace_id: "22222222-2222-4222-8222-222222222222",
    display_name: "Admitted Collector",
    handle: "admitted_collector",
    preferred_currency: "USD",
    status: "active",
    user_id: "11111111-1111-4111-8111-111111111111",
  },
  user_id: "11111111-1111-4111-8111-111111111111",
  workspace: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Admitted Collector",
    role: "owner",
    slug: "admitted-collector",
    status: "active",
    type: "personal",
  },
};

describe("application admission guard", () => {
  it("fails closed without a current admitted-user context", () => {
    expect(decideAppAccess(null)).toEqual({ allowed: false, reason: "admission" });
  });

  it("denies an inactive profile even when a verified context exists", () => {
    expect(
      decideAppAccess({
        ...activeContext,
        profile: { ...activeContext.profile, status: "suspended" },
      }),
    ).toEqual({ allowed: false, reason: "profile" });
  });

  it("requires an active workspace and complete profile before app entry", () => {
    expect(
      decideAppAccess({
        ...activeContext,
        workspace: { ...activeContext.workspace, status: "archived" },
      }),
    ).toEqual({ allowed: false, reason: "workspace" });
    expect(decideAppAccess(activeContext)).toEqual({ allowed: true });
    expect(isProfileComplete(activeContext.profile)).toBe(true);
    expect(isProfileComplete({ ...activeContext.profile, handle: null })).toBe(false);
  });
});
