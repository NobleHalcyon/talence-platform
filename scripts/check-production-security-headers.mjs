import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import nextEnvironment from "@next/env";

import { repositoryRoot } from "./lib/local-supabase.mjs";

const port = 3117;
const origin = `http://127.0.0.1:${port}`;
const webRoot = path.join(repositoryRoot, "apps", "web");
// Match `next build` environment-file resolution so a developer's ignored
// `.env.local` cannot make the smoke test expect a different public origin
// from the one compiled into the production Proxy.
nextEnvironment.loadEnvConfig(webRoot, false);
const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
const supabaseOrigin = new URL(configuredSupabaseUrl).origin;
const nextCli = path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: webRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_ORIGIN: origin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_phase6_header_check",
      NEXT_PUBLIC_SUPABASE_URL: configuredSupabaseUrl,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

function invariant(value, message) {
  if (!value) throw new Error(message);
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`production_server_exited:${child.exitCode}:${output.slice(-2_000)}`);
    }
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual" });
      if (response.status === 200) return response;
    } catch {
      // The bounded readiness loop retries until the server accepts connections.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`production_server_timeout:${output.slice(-2_000)}`);
}

try {
  const response = await waitForServer();
  const policy = response.headers.get("content-security-policy") ?? "";
  invariant(policy.includes("default-src 'self'"), "production_csp_default_source_missing");
  invariant(policy.includes("https://cards.scryfall.io"), "production_csp_scryfall_missing");
  invariant(policy.includes(supabaseOrigin), "production_csp_supabase_origin_missing");
  invariant(
    policy.includes(supabaseOrigin.replace(/^http/, "ws")),
    "production_csp_supabase_websocket_missing",
  );
  invariant(
    policy.includes("https://challenges.cloudflare.com"),
    "production_csp_turnstile_missing",
  );
  invariant(policy.includes("frame-ancestors 'none'"), "production_csp_frame_guard_missing");
  invariant(policy.includes("upgrade-insecure-requests"), "production_csp_upgrade_missing");
  invariant(!policy.includes("'unsafe-eval'"), "production_csp_allows_unsafe_eval");
  invariant(!/script-src [^;]*'unsafe-inline'/.test(policy), "production_csp_allows_inline_script");
  invariant(/script-src [^;]*'nonce-[A-Za-z0-9]+'/.test(policy), "production_csp_nonce_missing");
  invariant(
    response.headers.get("strict-transport-security") === "max-age=31536000; includeSubDomains",
    "production_hsts_invalid",
  );
  invariant(
    response.headers.get("permissions-policy") ===
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "production_permissions_policy_invalid",
  );
  invariant(
    response.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
    "production_referrer_policy_invalid",
  );
  invariant(
    response.headers.get("x-content-type-options") === "nosniff",
    "production_content_type_guard_missing",
  );
  invariant(response.headers.get("x-frame-options") === "DENY", "production_frame_guard_missing");
  invariant(
    /^[0-9a-f-]{36}$/.test(response.headers.get("x-request-id") ?? ""),
    "production_correlation_header_missing",
  );
  process.stdout.write("Production security header smoke test: PASS\n");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
