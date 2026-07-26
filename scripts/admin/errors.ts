export type AdminErrorKind = "configuration" | "validation" | "conflict" | "not_found" | "external";

export class AdminOperationError extends Error {
  readonly code: string;
  readonly kind: AdminErrorKind;
  override readonly cause?: unknown;

  constructor(code: string, message: string, kind: AdminErrorKind, cause?: unknown) {
    super(message);
    this.name = "AdminOperationError";
    this.code = code;
    this.kind = kind;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function isAdminOperationError(error: unknown): error is AdminOperationError {
  return error instanceof AdminOperationError;
}

export function safeAuthErrorCode(
  operation: "invite" | "lookup" | "delete",
  error: unknown,
): string {
  const status = extractNumericField(error, "status");
  const providerCode = extractStringField(error, "code");

  if (status === 429 || providerCode === "over_email_send_rate_limit") {
    return "auth_rate_limited";
  }

  if (status !== null && status >= 500) {
    return "auth_service_unavailable";
  }

  if (status === 404 && operation !== "invite") {
    return "auth_user_not_found";
  }

  if (status === 400 || status === 422) {
    return operation === "invite" ? "auth_invite_rejected" : `auth_${operation}_rejected`;
  }

  return `auth_${operation}_failed`;
}

function extractNumericField(value: unknown, field: string): number | null {
  if (typeof value !== "object" || value === null || !(field in value)) {
    return null;
  }

  const candidate = Reflect.get(value, field);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function extractStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) {
    return null;
  }

  const candidate = Reflect.get(value, field);
  return typeof candidate === "string" ? candidate : null;
}
