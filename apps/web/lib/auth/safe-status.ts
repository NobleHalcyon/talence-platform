export type StatusTone = "danger" | "information" | "success" | "warning";

export interface SafeStatus {
  title: string;
  message: string;
  tone: StatusTone;
}

const STATUS_MESSAGES: Readonly<Record<string, SafeStatus>> = {
  authentication_required: {
    title: "Sign-in required",
    message: "Sign in with the admitted email address for this Talence account.",
    tone: "information",
  },
  account_unavailable: {
    title: "Account unavailable",
    message:
      "This account cannot enter Talence. Ask a platform administrator to review its admission status.",
    tone: "danger",
  },
  access_denied: {
    title: "Permission denied",
    message: "Your account does not have permission to perform that operation.",
    tone: "danger",
  },
  callback_code_missing: {
    title: "Link incomplete",
    message: "This authentication link is incomplete. Request a fresh email and try again.",
    tone: "danger",
  },
  callback_failed: {
    title: "Link could not be verified",
    message: "This link may be invalid or expired. Request a fresh email and try again.",
    tone: "danger",
  },
  captcha_required: {
    title: "Verification required",
    message: "Complete the bot-protection check and submit the form again.",
    tone: "warning",
  },
  configuration_required: {
    title: "Authentication is not configured",
    message: "This environment cannot contact its managed authentication service.",
    tone: "warning",
  },
  invitation_complete: {
    title: "Welcome to Talence",
    message: "Your private workspace is ready.",
    tone: "success",
  },
  invite_failed: {
    title: "Invitation not sent",
    message:
      "No account access was granted. Retry or inspect the admission ledger before continuing.",
    tone: "danger",
  },
  invite_disabled: {
    title: "Invitations are paused",
    message:
      "No account access was granted. The external invitation control is closed for incident response.",
    tone: "warning",
  },
  invite_rate_limited: {
    title: "Invitation limit reached",
    message:
      "No account access was granted. Retry after the configured external-service quota window.",
    tone: "warning",
  },
  invite_input_invalid: {
    title: "Invitation needs attention",
    message: "Enter a valid email, an expiration within thirty-one days, and a shorter note.",
    tone: "danger",
  },
  invite_revoked: {
    title: "Invitation revoked",
    message: "The unaccepted invitation can no longer finalize admission.",
    tone: "success",
  },
  invite_revoked_cleanup_pending: {
    title: "Invitation revoked; cleanup pending",
    message:
      "Admission is blocked, but the unaccepted managed-auth identity could not be removed. Retry cleanup before reissuing this email.",
    tone: "warning",
  },
  invite_sent: {
    title: "Invitation sent",
    message: "The admission record was committed before managed authentication sent the email.",
    tone: "success",
  },
  invitation_failed: {
    title: "Invitation could not be completed",
    message: "Nothing was added to your workspace. Request a fresh invitation and try again.",
    tone: "danger",
  },
  password_invalid: {
    title: "Password not accepted",
    message: "Use a password of at least eight characters that meets the managed provider policy.",
    tone: "danger",
  },
  password_mismatch: {
    title: "Passwords do not match",
    message: "Enter the same new password in both fields.",
    tone: "danger",
  },
  password_updated: {
    title: "Password updated",
    message: "Your managed authentication password has been changed. You can now sign in.",
    tone: "success",
  },
  profile_invalid: {
    title: "Profile needs attention",
    message: "Check the display name and handle, then submit again.",
    tone: "danger",
  },
  profile_updated: {
    title: "Profile updated",
    message: "Your display name and handle are current.",
    tone: "success",
  },
  recovery_sent: {
    title: "Check your email",
    message:
      "If this address belongs to an admitted account, recovery instructions have been sent.",
    tone: "success",
  },
  session_unverified: {
    title: "Session could not be verified",
    message: "Sign in again before continuing.",
    tone: "danger",
  },
  sign_in_failed: {
    title: "Sign-in failed",
    message: "The credentials could not be verified for an admitted account.",
    tone: "danger",
  },
  sign_out_failed: {
    title: "Sign-out failed",
    message: "This browser session may still be active. Retry before leaving this device.",
    tone: "danger",
  },
  signed_out: {
    title: "Signed out",
    message: "Your Talence session has ended on this browser.",
    tone: "success",
  },
  settings_failed: {
    title: "Settings were not saved",
    message: "The complete update did not finish. Reload to review current values before retrying.",
    tone: "danger",
  },
  settings_updated: {
    title: "Settings saved",
    message: "Your account and presentation preferences are current.",
    tone: "success",
  },
  workspace_changed: {
    title: "Workspace changed",
    message: "Resource routes now use the selected workspace.",
    tone: "success",
  },
};

export function getSafeStatus(status: string | string[] | undefined): SafeStatus | null {
  const key = Array.isArray(status) ? status[0] : status;
  return key ? (STATUS_MESSAGES[key] ?? null) : null;
}

export function safeRequestId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null;
}

export function statusHref(pathname: string, status: string, requestId?: string): string {
  const search = new URLSearchParams({ status });
  if (requestId) {
    search.set("request_id", requestId);
  }
  return `${pathname}?${search.toString()}`;
}
