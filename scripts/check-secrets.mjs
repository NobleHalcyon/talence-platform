import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ownPath = "scripts/check-secrets.mjs";
const candidates = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"));

const secretPatterns = [
  ["private key", /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[A-Z0-9]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{24,}\b/],
  ["signed JWT", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];
const sensitiveAssignment =
  /^(?:SUPABASE_SECRET_KEY|SUPABASE_DB_URL|TALENCE_DATABASE_URL|DEVICE_CREDENTIAL_PEPPER)\s*=\s*(\S.+)$/gm;
const findings = [];

for (const relative of candidates) {
  if (relative === ownPath) continue;
  if (
    /(?:^|\/)(?:node_modules|\.git|\.next|\.venv|test-results|playwright-report)\//.test(relative)
  ) {
    continue;
  }
  const absolute = path.join(root, relative);
  let contents;
  try {
    const bytes = await readFile(absolute);
    if (bytes.length > 5_000_000 || bytes.includes(0)) continue;
    contents = bytes.toString("utf8");
  } catch {
    continue;
  }

  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(contents)) findings.push(`${relative}: possible ${label}`);
  }

  if (!relative.endsWith(".example")) {
    for (const match of contents.matchAll(sensitiveAssignment)) {
      const value = match[1]?.trim() ?? "";
      if (
        value &&
        !/(?:example|placeholder|replace|localhost|127\.0\.0\.1|postgres:postgres)/i.test(value)
      ) {
        findings.push(`${relative}: non-placeholder sensitive configuration assignment`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const finding of [...new Set(findings)].sort()) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${candidates.length} repository files inspected).`);
}
