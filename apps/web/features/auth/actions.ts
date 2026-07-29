"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { statusHref } from "@/lib/auth/safe-status";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizeHandle,
  parseCredentials,
  parseProfileCompletion,
  readCaptchaToken,
  validatePassword,
} from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS, DATABASE_TABLES } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import {
  getApplicationOrigin,
  getCaptchaSiteKey,
  isProductionCaptchaRequired,
} from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

function redirectWithStatus(pathname: string, status: string, requestId?: string): never {
  redirect(statusHref(pathname, status, requestId));
}

function safeFailure(action: string, requestId: string, code: string): void {
  writeSecurityLog("warn", "auth.action.failed", {
    action,
    code,
    request_id: requestId,
  });
}

function captchaFailure(
  captchaToken: string | undefined,
): "captcha_required" | "configuration_required" | null {
  const siteKey = getCaptchaSiteKey();
  if (isProductionCaptchaRequired() && !siteKey) {
    return "configuration_required";
  }
  if (siteKey && !captchaToken) {
    return "captcha_required";
  }
  return null;
}

export async function signInAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const credentials = parseCredentials(formData);
  if (!credentials.ok) {
    return redirectWithStatus("/login", "sign_in_failed", requestId);
  }

  const captchaError = captchaFailure(credentials.value.captchaToken);
  if (captchaError) {
    return redirectWithStatus("/login", captchaError, requestId);
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    safeFailure("sign_in", requestId, "client_unavailable");
    return redirectWithStatus("/login", "configuration_required", requestId);
  }
  if (!supabase) {
    return redirectWithStatus("/login", "configuration_required", requestId);
  }

  let signInResult;
  try {
    signInResult = await supabase.auth.signInWithPassword({
      email: credentials.value.email,
      password: credentials.value.password,
      options: {
        captchaToken: credentials.value.captchaToken,
      },
    });
  } catch {
    safeFailure("sign_in", requestId, "provider_unavailable");
    return redirectWithStatus("/login", "sign_in_failed", requestId);
  }
  if (signInResult.error) {
    safeFailure("sign_in", requestId, "provider_rejected");
    return redirectWithStatus("/login", "sign_in_failed", requestId);
  }

  redirect("/app");
}

export async function requestPasswordRecoveryAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const captchaToken = readCaptchaToken(formData);
  const captchaError = captchaFailure(captchaToken);

  if (captchaError) {
    return redirectWithStatus("/forgot-password", captchaError, requestId);
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    safeFailure("password_recovery", requestId, "client_unavailable");
    return redirectWithStatus("/forgot-password", "configuration_required", requestId);
  }
  const appOrigin = getApplicationOrigin();
  if (!supabase || !appOrigin) {
    return redirectWithStatus("/forgot-password", "configuration_required", requestId);
  }

  if (email.ok) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
        captchaToken,
        redirectTo: `${appOrigin}/auth/callback?type=recovery&next=/reset-password`,
      });
      if (error) {
        safeFailure("password_recovery", requestId, "provider_rejected");
      }
    } catch {
      safeFailure("password_recovery", requestId, "provider_unavailable");
    }
  }

  // Deliberately generic for valid, unknown, malformed, and provider-rejected
  // addresses so this endpoint cannot be used for account enumeration.
  redirectWithStatus("/forgot-password", "recovery_sent");
}

export async function resetPasswordAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const passwordValue = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const password = validatePassword(passwordValue);

  if (!password.ok) {
    return redirectWithStatus("/reset-password", "password_invalid", requestId);
  }
  if (passwordValue !== confirmation) {
    return redirectWithStatus("/reset-password", "password_mismatch", requestId);
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    safeFailure("password_reset", requestId, "client_unavailable");
    return redirectWithStatus("/reset-password", "configuration_required", requestId);
  }
  if (!supabase) {
    return redirectWithStatus("/reset-password", "configuration_required", requestId);
  }

  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    safeFailure("password_reset", requestId, "provider_unavailable");
    return redirectWithStatus("/login", "session_unverified", requestId);
  }
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return redirectWithStatus("/login", "session_unverified", requestId);
  }

  let error;
  try {
    ({ error } = await supabase.auth.updateUser({ password: password.value }));
  } catch {
    safeFailure("password_reset", requestId, "provider_unavailable");
    return redirectWithStatus("/reset-password", "password_invalid", requestId);
  }
  if (error) {
    safeFailure("password_reset", requestId, "provider_rejected");
    return redirectWithStatus("/reset-password", "password_invalid", requestId);
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    safeFailure("password_reset_sign_out", requestId, "provider_unavailable");
  }
  redirectWithStatus("/login", "password_updated");
}

export async function completeInvitationAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const profile = parseProfileCompletion(formData);
  if (!profile.ok) {
    const status =
      profile.code === "password_mismatch"
        ? "password_mismatch"
        : profile.code === "password_invalid"
          ? "password_invalid"
          : "profile_invalid";
    return redirectWithStatus("/invite/complete", status, requestId);
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    safeFailure("invitation_completion", requestId, "client_unavailable");
    return redirectWithStatus("/invite/complete", "configuration_required", requestId);
  }
  if (!supabase) {
    return redirectWithStatus("/invite/complete", "configuration_required", requestId);
  }

  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    safeFailure("invitation_session", requestId, "provider_unavailable");
    return redirectWithStatus("/login", "session_unverified", requestId);
  }
  const userId = claimsResult.data?.claims?.sub;
  if (claimsResult.error || !userId) {
    return redirectWithStatus("/login", "session_unverified", requestId);
  }

  let passwordResult;
  try {
    passwordResult = await supabase.auth.updateUser({ password: profile.value.password });
  } catch {
    safeFailure("invitation_password", requestId, "provider_unavailable");
    return redirectWithStatus("/invite/complete", "password_invalid", requestId);
  }
  if (passwordResult.error) {
    safeFailure("invitation_password", requestId, "provider_rejected");
    return redirectWithStatus("/invite/complete", "password_invalid", requestId);
  }

  let finalizationResult;
  try {
    finalizationResult = await supabase.rpc(DATABASE_FUNCTIONS.finalizeAdmittedUser);
  } catch {
    safeFailure("invitation_finalization", requestId, "database_unavailable");
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      safeFailure("invitation_sign_out", requestId, "provider_unavailable");
    }
    return redirectWithStatus("/login", "invitation_failed", requestId);
  }
  if (finalizationResult.error) {
    safeFailure("invitation_finalization", requestId, "admission_denied");
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      safeFailure("invitation_sign_out", requestId, "provider_unavailable");
    }
    return redirectWithStatus("/login", "invitation_failed", requestId);
  }

  let profileUpdate;
  try {
    profileUpdate = await supabase
      .from(DATABASE_TABLES.profiles)
      .update({
        display_name: profile.value.displayName,
        handle: profile.value.handle,
      })
      .eq("user_id", userId);
  } catch {
    safeFailure("invitation_profile", requestId, "database_unavailable");
    return redirectWithStatus("/invite/complete", "profile_invalid", requestId);
  }

  if (profileUpdate.error) {
    safeFailure("invitation_profile", requestId, "profile_rejected");
    return redirectWithStatus("/invite/complete", "profile_invalid", requestId);
  }

  redirect(statusHref("/app", "invitation_complete"));
}

export async function signOutAction(): Promise<never> {
  const requestId = randomUUID();
  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    safeFailure("sign_out", requestId, "client_unavailable");
    return redirectWithStatus("/login", "configuration_required", requestId);
  }
  if (!supabase) {
    return redirectWithStatus("/login", "configuration_required", requestId);
  }

  let signOutResult;
  try {
    signOutResult = await supabase.auth.signOut({ scope: "local" });
  } catch {
    safeFailure("sign_out", requestId, "provider_unavailable");
    return redirectWithStatus("/login", "sign_out_failed", requestId);
  }
  if (signOutResult.error) {
    safeFailure("sign_out", requestId, "provider_rejected");
    return redirectWithStatus("/login", "sign_out_failed", requestId);
  }

  redirect(statusHref("/login", "signed_out"));
}

export async function updateMinimalProfileAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const displayName = normalizeDisplayName(String(formData.get("displayName") ?? ""));
  const handle = normalizeHandle(String(formData.get("handle") ?? ""));
  if (!displayName.ok || !handle.ok) {
    return redirectWithStatus("/app/settings", "profile_invalid", requestId);
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    safeFailure("minimal_profile", requestId, "client_unavailable");
    return redirectWithStatus("/login", "configuration_required", requestId);
  }
  if (!supabase) {
    return redirectWithStatus("/login", "configuration_required", requestId);
  }

  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    safeFailure("minimal_profile", requestId, "provider_unavailable");
    return redirectWithStatus("/login", "session_unverified", requestId);
  }
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return redirectWithStatus("/login", "session_unverified", requestId);
  }

  let update;
  try {
    update = await supabase
      .from(DATABASE_TABLES.profiles)
      .update({ display_name: displayName.value, handle: handle.value })
      .eq("user_id", claimsResult.data.claims.sub);
  } catch {
    safeFailure("minimal_profile", requestId, "database_unavailable");
    return redirectWithStatus("/app/settings", "profile_invalid", requestId);
  }
  if (update.error) {
    return redirectWithStatus("/app/settings", "profile_invalid", requestId);
  }

  redirect(statusHref("/app/settings", "profile_updated"));
}
