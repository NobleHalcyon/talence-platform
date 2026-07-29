import type { EmailOtpType } from "@supabase/supabase-js";

type TalenceEmailOtpType = Extract<EmailOtpType, "invite" | "recovery">;

const ALLOWED_EMAIL_TYPES = new Set<TalenceEmailOtpType>(["invite", "recovery"]);
const DESTINATIONS_BY_TYPE: Readonly<Record<TalenceEmailOtpType, ReadonlySet<string>>> = {
  invite: new Set(["/invite/complete", "/app"]),
  recovery: new Set(["/reset-password"]),
};
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,512}$/u;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{16,2048}$/u;

export interface CallbackIntent {
  code: string | null;
  destination: string;
  tokenHash: string | null;
  type: TalenceEmailOtpType | null;
}

export function parseCallbackIntent(searchParams: URLSearchParams): CallbackIntent {
  const requestedDestination = searchParams.get("next");
  const requestedType = searchParams.get("type");
  const type =
    requestedType && ALLOWED_EMAIL_TYPES.has(requestedType as TalenceEmailOtpType)
      ? (requestedType as TalenceEmailOtpType)
      : null;

  const defaultDestination = type === "recovery" ? "/reset-password" : "/invite/complete";
  const requestedCode = searchParams.get("code");
  const requestedTokenHash = searchParams.get("token_hash");
  const code = requestedCode && CODE_PATTERN.test(requestedCode) ? requestedCode : null;
  const tokenHash =
    requestedTokenHash && TOKEN_HASH_PATTERN.test(requestedTokenHash) ? requestedTokenHash : null;
  const ambiguousCredential = Boolean(code && tokenHash);
  const allowedDestinations = type ? DESTINATIONS_BY_TYPE[type] : new Set([defaultDestination]);

  return {
    code: ambiguousCredential ? null : code,
    destination:
      requestedDestination && allowedDestinations.has(requestedDestination)
        ? requestedDestination
        : defaultDestination,
    tokenHash: ambiguousCredential ? null : tokenHash,
    type,
  };
}
