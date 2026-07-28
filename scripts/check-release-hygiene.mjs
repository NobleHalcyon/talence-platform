import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"));
const findings = [];

const prohibitedArtifactPatterns = [
  [/(?:^|\/)\.env(?:\..+)?$/, "local environment file"],
  [/\.(?:db|dump|sqlite|sqlite3)$/i, "database or generated snapshot artifact"],
  [/(?:^|\/)(?:bulk-downloads?|catalog-bulk|local-db)(?:\/|$)/i, "local bulk/database artifact"],
  [/(?:^|\/)(?:legacy|old-app|previous-app)(?:\/|$)/i, "historical application code"],
];

for (const file of files) {
  for (const [pattern, label] of prohibitedArtifactPatterns) {
    if (pattern.test(file) && !file.endsWith(".env.example") && file !== ".env.example") {
      findings.push(`${file}: prohibited ${label}`);
    }
  }
  if (
    /^apps\/web\/app\/.*\/(?:marketplace|billing|storefront|subscriptions|ai)(?:\/|$)/i.test(file)
  ) {
    findings.push(`${file}: deferred product route is outside private-beta scope`);
  }
  if (/(?:^|\/)tailwind\.config\.[^/]+$/i.test(file)) {
    findings.push(`${file}: Tailwind configuration is prohibited`);
  }
}

for (const file of files.filter((candidate) => candidate.endsWith(".sql"))) {
  const contents = await readFile(path.join(root, file), "utf8");
  if (
    /create\s+table\s+(?:public\.)?(?:marketplace|billing|storefront|subscription|ai_)/i.test(
      contents,
    )
  ) {
    findings.push(`${file}: deferred product database system is outside private-beta scope`);
  }
}

const requiredFiles = [
  ".env.example",
  "apps/web/.env.example",
  "services/catalog-worker/.env.example",
  "docs/dev-logs/phase-0.md",
  "docs/dev-logs/phase-1.md",
  "docs/dev-logs/phase-2.md",
  "docs/dev-logs/phase-3.md",
  "docs/dev-logs/phase-4.md",
  "docs/dev-logs/phase-5.md",
  "docs/dev-logs/phase-6.md",
  "docs/operations/backup-and-restore.md",
  "docs/operations/incident-response.md",
  "docs/operations/private-beta-checklist.md",
  "docs/operations/production-setup.md",
];
for (const required of requiredFiles) {
  if (!files.includes(required))
    findings.push(`${required}: required release deliverable is missing`);
}

if (findings.length > 0) {
  console.error("Release hygiene guard failed:");
  for (const finding of findings.sort()) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Release hygiene guard passed (${files.length} repository files checked).`);
}
