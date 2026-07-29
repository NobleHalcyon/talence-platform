import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function loopbackHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
}

function requireLocalApiUrl(value) {
  const parsed = new URL(value);
  invariant(
    parsed.protocol === "http:" &&
      loopbackHostname(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash,
    "local_supabase_api_url_required",
  );
}

function requireDisposableDatabaseUrl(value) {
  const parsed = new URL(value);
  invariant(
    ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      loopbackHostname(parsed.hostname) &&
      parsed.port === "54322" &&
      parsed.pathname === "/postgres" &&
      !parsed.search &&
      !parsed.hash,
    "disposable_local_supabase_database_required",
  );
}

function requiredString(value, message) {
  invariant(typeof value === "string" && value.length > 0, message);
  return value;
}

export function readLocalSupabaseStatus() {
  const cli = path.join(repositoryRoot, "node_modules", "supabase", "dist", "supabase.js");
  const result = spawnSync(process.execPath, [cli, "status", "-o", "json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("local_supabase_status_unavailable");
  }

  const firstBrace = result.stdout.indexOf("{");
  const lastBrace = result.stdout.lastIndexOf("}");
  invariant(firstBrace >= 0 && lastBrace > firstBrace, "local_supabase_status_json_missing");
  const parsed = JSON.parse(result.stdout.slice(firstBrace, lastBrace + 1));
  const status = {
    apiUrl: requiredString(parsed.API_URL, "local_supabase_api_url_missing"),
    databaseUrl: requiredString(parsed.DB_URL, "local_supabase_database_url_missing"),
    publishableKey: requiredString(
      parsed.PUBLISHABLE_KEY ?? parsed.ANON_KEY,
      "local_supabase_publishable_key_missing",
    ),
    secretKey: requiredString(
      parsed.SECRET_KEY ?? parsed.SERVICE_ROLE_KEY,
      "local_supabase_secret_key_missing",
    ),
  };
  requireLocalApiUrl(status.apiUrl);
  requireDisposableDatabaseUrl(status.databaseUrl);
  return Object.freeze(status);
}
