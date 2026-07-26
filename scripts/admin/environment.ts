import { AdminOperationError } from "./errors.js";

export type AdminEnvironment = Readonly<Record<string, string | undefined>>;

export interface SupabaseAdminConfiguration {
  url: string;
  secretKey: string;
}

export function readDatabaseUrl(environment: AdminEnvironment): string {
  const talenceUrl = optionalEnvironmentValue(environment, "TALENCE_DATABASE_URL");
  const supabaseUrl = optionalEnvironmentValue(environment, "SUPABASE_DB_URL");
  if (talenceUrl && supabaseUrl && talenceUrl !== supabaseUrl) {
    throw configurationError(
      "database_url_conflict",
      "TALENCE_DATABASE_URL and SUPABASE_DB_URL point to different databases.",
    );
  }

  const value = talenceUrl ?? supabaseUrl;
  if (!value) {
    throw configurationError(
      "database_url_missing",
      "Set TALENCE_DATABASE_URL or SUPABASE_DB_URL for trusted administration.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw configurationError(
      "database_url_invalid",
      "The trusted PostgreSQL connection URL is invalid.",
    );
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username) {
    throw configurationError(
      "database_url_invalid",
      "The trusted database URL must be a PostgreSQL URL with a host and user.",
    );
  }
  return value;
}

export function readSupabaseAdminConfiguration(
  environment: AdminEnvironment,
): SupabaseAdminConfiguration {
  const rawUrl =
    optionalEnvironmentValue(environment, "SUPABASE_URL") ??
    optionalEnvironmentValue(environment, "NEXT_PUBLIC_SUPABASE_URL");
  if (!rawUrl) {
    throw configurationError(
      "supabase_url_missing",
      "Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.",
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw configurationError("supabase_url_invalid", "The Supabase project URL is invalid.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHostname(url.hostname))) {
    throw configurationError(
      "supabase_url_invalid",
      "The Supabase project URL must use HTTPS except for local development.",
    );
  }

  const secretKey = requireEnvironmentValue(environment, "SUPABASE_SECRET_KEY");
  const publishableKey = optionalEnvironmentValue(
    environment,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  if (publishableKey && secretKey === publishableKey) {
    throw configurationError(
      "supabase_secret_invalid",
      "SUPABASE_SECRET_KEY cannot equal the browser publishable key.",
    );
  }
  assertSecretKey(secretKey);

  return { url: url.toString().replace(/\/$/u, ""), secretKey };
}

export function requireInvitationsEnabled(environment: AdminEnvironment): void {
  if (optionalEnvironmentValue(environment, "FEATURE_INVITATIONS_ENABLED") !== "true") {
    throw configurationError(
      "invitations_disabled",
      "Invitation issuance is disabled. Set FEATURE_INVITATIONS_ENABLED=true deliberately.",
    );
  }
}

export function resolveInviteRedirect(
  environment: AdminEnvironment,
  explicitValue?: string,
): string {
  if (explicitValue?.trim()) {
    return explicitValue.trim();
  }

  const configured = optionalEnvironmentValue(environment, "TALENCE_AUTH_INVITE_REDIRECT_URL");
  if (configured) {
    return configured;
  }

  const origin = optionalEnvironmentValue(environment, "NEXT_PUBLIC_APP_ORIGIN");
  if (!origin) {
    throw configurationError(
      "invite_redirect_missing",
      "Set TALENCE_AUTH_INVITE_REDIRECT_URL or NEXT_PUBLIC_APP_ORIGIN.",
    );
  }
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    throw configurationError("invite_redirect_invalid", "NEXT_PUBLIC_APP_ORIGIN is invalid.");
  }
  return new URL("/auth/callback?type=invite&next=/invite/complete", base).toString();
}

export function resolveInvitationExpiration(
  environment: AdminEnvironment,
  now: Date,
  expiresAt?: string,
  ttlDays?: string,
): string {
  if (expiresAt && ttlDays) {
    throw new AdminOperationError(
      "expiration_conflict",
      "Provide --expires-at or --ttl-days, not both.",
      "validation",
    );
  }
  if (expiresAt) {
    return expiresAt;
  }

  const rawDays =
    ttlDays ?? optionalEnvironmentValue(environment, "INVITATION_DEFAULT_TTL_DAYS") ?? "7";
  if (!/^[1-9]\d*$/u.test(rawDays)) {
    throw new AdminOperationError(
      "invalid_ttl",
      "Invitation TTL must be a positive whole number of days.",
      "validation",
    );
  }
  const days = Number(rawDays);
  if (!Number.isSafeInteger(days) || days > 3_650) {
    throw new AdminOperationError(
      "invalid_ttl",
      "Invitation TTL must be between 1 and 3650 days.",
      "validation",
    );
  }
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function assertSecretKey(secretKey: string): void {
  if (secretKey.startsWith("sb_publishable_")) {
    throw configurationError(
      "supabase_secret_invalid",
      "SUPABASE_SECRET_KEY contains a publishable key.",
    );
  }
  if (secretKey.startsWith("sb_secret_")) {
    return;
  }

  const parts = secretKey.split(".");
  if (parts.length !== 3) {
    throw configurationError(
      "supabase_secret_invalid",
      "SUPABASE_SECRET_KEY is neither a secret key nor a legacy service-role JWT.",
    );
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as {
      role?: unknown;
    };
    if (payload.role !== "service_role") {
      throw new Error("not service role");
    }
  } catch {
    throw configurationError(
      "supabase_secret_invalid",
      "The legacy Supabase JWT is not a service-role key.",
    );
  }
}

function optionalEnvironmentValue(environment: AdminEnvironment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value ? value : undefined;
}

function requireEnvironmentValue(environment: AdminEnvironment, name: string): string {
  const value = optionalEnvironmentValue(environment, name);
  if (!value) {
    throw configurationError("environment_missing", `Set trusted server variable ${name}.`);
  }
  return value;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function configurationError(code: string, message: string): AdminOperationError {
  return new AdminOperationError(code, message, "configuration");
}
