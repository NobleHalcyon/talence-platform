import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const staticRoot = path.join(root, "apps", "web", ".next", "static");
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
    } else {
      files.push(absolute);
    }
  }
}

try {
  await walk(staticRoot);
} catch {
  console.error("Browser bundle scan failed: build apps/web before running this check.");
  process.exit(1);
}

const prohibitedMarkers = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "TALENCE_DATABASE_URL",
  "DEVICE_CREDENTIAL_PEPPER",
];
const configuredSecrets = [
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_DB_URL,
  process.env.TALENCE_DATABASE_URL,
  process.env.DEVICE_CREDENTIAL_PEPPER,
].filter((value) => typeof value === "string" && value.length >= 8);
const findings = [];

for (const absolute of files) {
  if (!/\.(?:css|html|js|json|map|txt)$/.test(absolute)) continue;
  const contents = await readFile(absolute, "utf8");
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  for (const marker of prohibitedMarkers) {
    if (contents.includes(marker))
      findings.push(`${relative}: contains server-only marker ${marker}`);
  }
  for (const secret of configuredSecrets) {
    if (contents.includes(secret))
      findings.push(`${relative}: contains a configured server secret`);
  }
}

if (findings.length > 0) {
  console.error("Browser bundle secret scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Browser bundle secret scan passed (${files.length} static assets inspected).`);
}
