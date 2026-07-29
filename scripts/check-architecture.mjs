import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const excluded = new Set([
  ".git",
  ".next",
  ".pytest_cache",
  ".test-tmp",
  ".venv",
  "coverage",
  "docs",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const findings = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (excluded.has(entry.name) || entry.name.startsWith("pytest-cache-files-")) {
      continue;
    }

    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }

    if (!/(?:^\.env|\.css|\.js|\.jsx|\.json|\.mjs|\.toml|\.ts|\.tsx|\.ya?ml)$/.test(entry.name)) {
      continue;
    }

    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (relative === "scripts/check-architecture.mjs") {
      continue;
    }
    const contents = await readFile(absolute, "utf8");

    if (/\bsignUp\s*\(/.test(contents)) {
      findings.push(`${relative}: public Supabase signUp call is prohibited`);
    }
    if (/(?:^|\/)(?:register|sign-?up)(?:\/|$)/i.test(relative)) {
      findings.push(`${relative}: public registration route is prohibited`);
    }
    if (
      /(?:tailwindcss|@tailwind|className=["'][^"']*(?:\b(?:p|m)[trblxy]?-\d|\bgrid-cols-))/i.test(
        contents,
      )
    ) {
      findings.push(`${relative}: Tailwind or utility-wall styling is prohibited`);
    }
    if (
      /NEXT_PUBLIC_(?:SUPABASE_(?:SECRET|SERVICE_ROLE)|SERVICE_ROLE|DEVICE_CREDENTIAL_PEPPER|DATABASE_URL)/.test(
        contents,
      )
    ) {
      findings.push(`${relative}: privileged secret is exposed through NEXT_PUBLIC_`);
    }
    if (/api\.scryfall\.com/.test(contents) && /["']use client["']/.test(contents)) {
      findings.push(`${relative}: client-side live Scryfall calls are prohibited`);
    }
    if (/(?:remote[_ -]?start|start[_ -]?motion|motor[_ -]?command)/i.test(relative)) {
      findings.push(`${relative}: remote robot motion surfaces are prohibited`);
    }
  }
}

await walk(root);

if (findings.length > 0) {
  console.error("Architecture guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Architecture guard passed.");
}
