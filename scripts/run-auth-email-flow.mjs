import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { readLocalSupabaseStatus, repositoryRoot } from "./lib/local-supabase.mjs";

// Refuse a hosted target before any reset or Auth operation.
readLocalSupabaseStatus();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: options.quiet ? "ignore" : "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(options.errorCode ?? "auth_email_flow_command_failed");
  }
}

const supabaseCli = path.join(repositoryRoot, "node_modules", "supabase", "dist", "supabase.js");

run(process.execPath, [supabaseCli, "db", "reset", "--local", "--no-seed"]);

// Recreate Auth after the database reset so it loads both the committed
// templates and a fresh connection to the recreated local database.
run(process.execPath, [supabaseCli, "stop"], {
  errorCode: "local_supabase_stop_failed",
  quiet: true,
});
run(process.execPath, [supabaseCli, "start"], {
  errorCode: "local_supabase_start_failed",
  quiet: true,
});

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_cli_path_missing");
run(process.execPath, [npmCli, "run", "test:e2e:auth-email-live", "--workspace", "@talence/web"]);
