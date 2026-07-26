import { existsSync, mkdirSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const pythonPath =
  process.platform === "win32"
    ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
    : path.join(process.cwd(), ".venv", "bin", "python");

if (!existsSync(pythonPath)) {
  console.error(
    "Local Python environment is missing. Run scripts/setup-python.ps1 on Windows or scripts/setup-python.sh on macOS/Linux.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const runsPytest = args[0] === "-m" && args[1] === "pytest";

let pytestTempRoot;
let pytestBaseTemp;
if (runsPytest) {
  pytestTempRoot = path.join(process.cwd(), ".test-tmp");
  mkdirSync(pytestTempRoot, { recursive: true });
  pytestBaseTemp = mkdtempSync(path.join(pytestTempRoot, "pytest-"));
}

let result;
let cleanupError;
try {
  result = spawnSync(pythonPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(pytestBaseTemp ? { TALENCE_PYTEST_TEMP_ROOT: pytestBaseTemp } : {}),
    },
    stdio: "inherit",
  });
} finally {
  if (pytestBaseTemp) {
    try {
      rmSync(pytestBaseTemp, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (pytestTempRoot) {
    try {
      rmdirSync(pytestTempRoot);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTEMPTY")
      ) {
        // Another concurrent pytest run may still own a sibling directory.
      } else {
        cleanupError ??= error;
      }
    }
  }
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (cleanupError) {
  console.error(`Failed to clean the pytest base temp directory: ${cleanupError}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
