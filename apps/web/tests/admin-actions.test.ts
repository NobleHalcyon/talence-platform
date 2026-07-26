import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  issueInviteAction,
  listInvitedUsers,
  resendInviteAction,
  revokeInviteAction,
} from "@/features/admin/actions";

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getAppContextState: vi.fn(),
  getApplicationOrigin: vi.fn(() => "https://talence.example"),
  invitationsEnabled: vi.fn(() => true),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth/app-context", () => ({
  getAppContextState: mocks.getAppContextState,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

vi.mock("@/lib/supabase/config", () => ({
  getApplicationOrigin: mocks.getApplicationOrigin,
}));

vi.mock("@/features/admin/config", () => ({
  invitationsEnabled: mocks.invitationsEnabled,
}));

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_USER_ID = "33333333-3333-4333-8333-333333333333";

function redirectError(href: string): Error {
  return new Error(`NEXT_REDIRECT:${href}`);
}

function expectRedirect(status: string): void {
  expect(mocks.redirect).toHaveBeenLastCalledWith(
    expect.stringMatching(
      new RegExp(`^\\/app\\/admin\\/invites\\?status=${status}(?:&request_id=[0-9a-f-]{36})?$`),
    ),
  );
}

function invitationForm(): FormData {
  const formData = new FormData();
  formData.set("invitationId", INVITATION_ID);
  return formData;
}

function issueForm(): FormData {
  const formData = new FormData();
  const expiration = new Date();
  expiration.setUTCDate(expiration.getUTCDate() + 1);
  formData.set("email", "invitee@example.test");
  formData.set("expiresAt", expiration.toISOString().slice(0, 10));
  formData.set("note", "Private beta");
  return formData;
}

function invitedUser(overrides: Record<string, unknown> = {}) {
  return {
    accepted_at: null,
    auth_user_id: AUTH_USER_ID,
    created_at: "2026-07-26T00:00:00.000Z",
    effective_status: "sent",
    email: "invitee@example.test",
    expires_at: "2026-08-02T00:00:00.000Z",
    id: INVITATION_ID,
    last_error_code: null,
    note: "Private beta",
    revoked_at: null,
    sent_at: "2026-07-26T00:00:00.000Z",
    status: "sent",
    updated_at: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("admin invitation server-action failure boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.redirect.mockImplementation((href: string) => {
      throw redirectError(href);
    });
    mocks.getAppContextState.mockResolvedValue({
      context: {
        collections: [],
        isPlatformAdmin: true,
        profile: {},
        userId: ADMIN_USER_ID,
        workspace: {},
        workspaces: [],
      },
      status: "ready",
    });
  });

  it("normalizes a rejected resend lookup into a safe redirect", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("raw database transport failure"));
    mocks.createAdminSupabaseClient.mockReturnValue({ rpc });

    await expect(resendInviteAction(invitationForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(rpc).toHaveBeenCalledWith("admin_get_invited_user", {
      p_actor_user_id: ADMIN_USER_ID,
      p_invited_user_id: INVITATION_ID,
    });
    expectRedirect("invite_failed");
  });

  it("normalizes a rejected revoke lookup into a safe redirect", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("raw database transport failure"));
    mocks.createAdminSupabaseClient.mockReturnValue({ rpc });

    await expect(revokeInviteAction(invitationForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("invite_failed");
  });

  it("normalizes a rejected revocation RPC instead of surfacing a server error", async () => {
    const rpc = vi.fn((functionName: string) => {
      if (functionName === "admin_get_invited_user") {
        return Promise.resolve({ data: invitedUser(), error: null });
      }
      return Promise.reject(new Error("raw revocation transport failure"));
    });
    mocks.createAdminSupabaseClient.mockReturnValue({
      auth: { admin: { deleteUser: vi.fn() } },
      rpc,
    });

    await expect(revokeInviteAction(invitationForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("invite_failed");
  });

  it("contains thrown Auth cleanup and audit failures after fail-closed revocation", async () => {
    const rpc = vi.fn((functionName: string) => {
      if (functionName === "admin_get_invited_user") {
        return Promise.resolve({ data: invitedUser(), error: null });
      }
      if (functionName === "admin_revoke_invited_user") {
        return Promise.resolve({ data: invitedUser({ status: "revoked" }), error: null });
      }
      return Promise.reject(new Error("raw audit transport failure"));
    });
    const deleteUser = vi.fn().mockRejectedValue(new Error("raw Auth transport failure"));
    mocks.createAdminSupabaseClient.mockReturnValue({
      auth: { admin: { deleteUser } },
      rpc,
    });

    await expect(revokeInviteAction(invitationForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(deleteUser).toHaveBeenCalledWith(AUTH_USER_ID, false);
    expect(rpc).toHaveBeenCalledWith("admin_record_invited_user_error", {
      p_actor_user_id: ADMIN_USER_ID,
      p_error_code: "auth_cleanup_failed",
      p_invited_user_id: INVITATION_ID,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/admin/invites");
    expectRedirect("invite_revoked_cleanup_pending");
  });

  it("returns a bounded error result when invitation listing rejects", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("raw database transport failure"));
    mocks.createAdminSupabaseClient.mockReturnValue({ rpc });

    await expect(listInvitedUsers()).resolves.toEqual({
      error: true,
      invitations: [],
    });
  });

  it("contains invitation execution rejection and preserves the invite callback type", async () => {
    const rpc = vi.fn((functionName: string) => {
      if (functionName === "admin_prepare_invited_user") {
        return Promise.resolve({
          data: { email: "invitee@example.test", id: INVITATION_ID },
          error: null,
        });
      }
      return Promise.resolve({ data: invitedUser(), error: null });
    });
    const inviteUserByEmail = vi
      .fn()
      .mockRejectedValue(new Error("raw managed-auth transport failure"));
    mocks.createAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn(),
          inviteUserByEmail,
        },
      },
      rpc,
    });

    await expect(issueInviteAction(issueForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(inviteUserByEmail).toHaveBeenCalledWith("invitee@example.test", {
      data: { invited_user_id: INVITATION_ID },
      redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
    });
    expectRedirect("invite_failed");
  });

  it("normalizes an exception while constructing the trusted client", async () => {
    mocks.createAdminSupabaseClient.mockImplementation(() => {
      throw new Error("raw client construction failure");
    });

    await expect(issueInviteAction(issueForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("configuration_required");
  });
});
