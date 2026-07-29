import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { readLocalSupabaseStatus, repositoryRoot } from "./lib/local-supabase.mjs";

readLocalSupabaseStatus();

function run(command, args, environment = process.env, stdio = "inherit") {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const supabaseCli = path.join(repositoryRoot, "node_modules", "supabase", "dist", "supabase.js");
run(process.execPath, [supabaseCli, "db", "reset", "--local", "--no-seed"]);
// The reset recreates PostgreSQL. Recreate local Auth afterward so its hook
// connection and committed email-template configuration cannot remain stale.
run(process.execPath, [supabaseCli, "stop"], process.env, "ignore");
run(process.execPath, [supabaseCli, "start"], process.env, "ignore");
run(process.execPath, [path.join(repositoryRoot, "scripts", "check-seed-repeatability.mjs")]);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_cli_path_missing");
run(process.execPath, [npmCli, "run", "test:e2e:phase6-live", "--workspace", "@talence/web"]);
