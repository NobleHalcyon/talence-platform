import type { EmailOtpType } from "@supabase/supabase-js";

const ALLOWED_DESTINATIONS = new Set(["/invite/complete", "/reset-password", "/app"]);
const ALLOWED_EMAIL_TYPES = new Set<EmailOtpType>(["invite", "recovery"]);

export interface CallbackIntent {
  code: string | null;
  destination: string;
  tokenHash: string | null;
  type: EmailOtpType | null;
}

export function parseCallbackIntent(searchParams: URLSearchParams): CallbackIntent {
  const requestedDestination = searchParams.get("next");
  const requestedType = searchParams.get("type");
  const type =
    requestedType && ALLOWED_EMAIL_TYPES.has(requestedType as EmailOtpType)
      ? (requestedType as EmailOtpType)
      : null;

  const defaultDestination = type === "recovery" ? "/reset-password" : "/invite/complete";

  return {
    code: searchParams.get("code"),
    destination:
      requestedDestination && ALLOWED_DESTINATIONS.has(requestedDestination)
        ? requestedDestination
        : defaultDestination,
    tokenHash: searchParams.get("token_hash"),
    type,
  };
}
