import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { readLocalSupabaseStatus, repositoryRoot } from "./lib/local-supabase.mjs";

const status = readLocalSupabaseStatus();
const pythonLauncher = path.join(repositoryRoot, "scripts", "python.mjs");
const result = spawnSync(
  process.execPath,
  [
    pythonLauncher,
    "-m",
    "pytest",
    "services/catalog-worker/tests/test_snapshot_storage_integration.py",
    "-q",
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SUPABASE_SECRET_KEY: status.secretKey,
      SUPABASE_URL: status.apiUrl,
      TALENCE_DATABASE_URL: status.databaseUrl,
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
