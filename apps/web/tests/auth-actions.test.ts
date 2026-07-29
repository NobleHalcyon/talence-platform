import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeInvitationAction,
  requestPasswordRecoveryAction,
  resetPasswordAction,
  signInAction,
  signOutAction,
  updateMinimalProfileAction,
} from "@/features/auth/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mocks = vi.hoisted(() => ({
  getApplicationOrigin: vi.fn(() => "https://talence.example"),
  getCaptchaSiteKey: vi.fn(() => null),
  isProductionCaptchaRequired: vi.fn(() => false),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/config", () => ({
  getApplicationOrigin: mocks.getApplicationOrigin,
  getCaptchaSiteKey: mocks.getCaptchaSiteKey,
  isProductionCaptchaRequired: mocks.isProductionCaptchaRequired,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

function redirectError(href: string): Error {
  return new Error(`NEXT_REDIRECT:${href}`);
}

function expectRedirect(pathname: string, status: string): void {
  expect(mocks.redirect).toHaveBeenLastCalledWith(
    expect.stringMatching(
      new RegExp(
        `^${pathname.replaceAll("/", "\\/")}\\?status=${status}&request_id=[0-9a-f-]{36}$`,
      ),
    ),
  );
}

function validPasswordForm(): FormData {
  const formData = new FormData();
  formData.set("password", "  password with intentional spaces  ");
  formData.set("passwordConfirmation", "  password with intentional spaces  ");
  return formData;
}

function validInvitationForm(): FormData {
  const formData = validPasswordForm();
  formData.set("displayName", "Invited Collector");
  formData.set("handle", "invited_collector");
  return formData;
}

function validSignInForm(): FormData {
  const formData = new FormData();
  formData.set("email", "invited@example.com");
  formData.set("password", "  password with intentional spaces  ");
  return formData;
}

function validProfileForm(): FormData {
  const formData = new FormData();
  formData.set("displayName", "Updated Collector");
  formData.set("handle", "updated_collector");
  return formData;
}

describe("managed-auth server action failure boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((href: string) => {
      throw redirectError(href);
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("normalizes sign-in client initialization failures", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("raw cookie-store failure"));

    await expect(signInAction(validSignInForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/login", "configuration_required");
  });

  it("uses a typed recovery callback and keeps provider failures enumeration-safe", async () => {
    const resetPasswordForEmail = vi.fn().mockRejectedValue(new Error("raw provider failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);
    const formData = new FormData();
    formData.set("email", "invited@example.com");

    await expect(requestPasswordRecoveryAction(formData)).rejects.toThrow("NEXT_REDIRECT:");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("invited@example.com", {
      captchaToken: undefined,
      redirectTo: "https://talence.example/auth/callback?type=recovery&next=/reset-password",
    });
    expect(mocks.redirect).toHaveBeenLastCalledWith("/forgot-password?status=recovery_sent");
  });

  it("normalizes recovery client initialization failures", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("raw cookie-store failure"));
    const formData = new FormData();
    formData.set("email", "invited@example.com");

    await expect(requestPasswordRecoveryAction(formData)).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/forgot-password", "configuration_required");
  });

  it("normalizes a thrown password-update failure and preserves secret whitespace", async () => {
    const updateUser = vi.fn().mockRejectedValue(new Error("raw provider failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
          error: null,
        }),
        updateUser,
      },
    } as never);

    await expect(resetPasswordAction(validPasswordForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(updateUser).toHaveBeenCalledWith({
      password: "  password with intentional spaces  ",
    });
    expectRedirect("/reset-password", "password_invalid");
  });

  it("normalizes server-client initialization failures during password reset", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("raw cookie-store failure"));

    await expect(resetPasswordAction(validPasswordForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/reset-password", "configuration_required");
  });

  it("fails invitation completion closed when finalization and cleanup both throw", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("raw cleanup failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
          error: null,
        }),
        signOut,
        updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
      rpc: vi.fn().mockRejectedValue(new Error("raw database failure")),
    } as never);

    await expect(completeInvitationAction(validInvitationForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expectRedirect("/login", "invitation_failed");
  });

  it("does not claim sign-out succeeded when the provider throws", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("raw provider failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { signOut },
    } as never);

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:");

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expectRedirect("/login", "sign_out_failed");
  });

  it("normalizes thrown profile database failures after verifying the session", async () => {
    const eq = vi.fn().mockRejectedValue(new Error("raw database failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq })),
      })),
    } as never);

    await expect(updateMinimalProfileAction(validProfileForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(eq).toHaveBeenCalledWith("user_id", "11111111-1111-4111-8111-111111111111");
    expectRedirect("/app/settings", "profile_invalid");
  });
});
