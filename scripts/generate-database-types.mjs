import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
const outputPath = path.join(root, "apps", "web", "lib", "supabase", "database.types.ts");
const checkOnly = process.argv.includes("--check");
const databaseUrl = process.env.TALENCE_DATABASE_URL?.trim();
const sourceArguments = databaseUrl ? ["--db-url", databaseUrl] : ["--local"];

const result = spawnSync(
  process.execPath,
  [cli, "gen", "types", "typescript", ...sourceArguments, "--schema", "public"],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} else {
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const generated = normalize(
    await format(result.stdout, { ...prettierConfig, filepath: outputPath }),
  );

  if (checkOnly) {
    let existing;
    try {
      existing = normalize(await readFile(outputPath, "utf8"));
    } catch {
      console.error("Generated database types are missing. Run `npm run db:types`.");
      process.exitCode = 1;
    }

    if (existing !== undefined && existing !== generated) {
      console.error("Generated database types are stale. Run `npm run db:types`.");
      process.exitCode = 1;
    } else if (existing !== undefined) {
      console.log("Generated database types are current.");
    }
  } else {
    await writeFile(outputPath, generated, "utf8");
    console.log(
      `Generated ${path.relative(root, outputPath).replaceAll("\\", "/")} from the local database.`,
    );
  }
}

function normalize(value) {
  return `${value.replaceAll("\r\n", "\n").trimEnd()}\n`;
}
