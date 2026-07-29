import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const canonicalRoot = path.join(
  process.cwd(),
  "docs",
  "canonical",
  "Talence_Greenfield_Canon_v1.0.0",
);
const manifestPath = path.join(canonicalRoot, "MANIFEST.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else if (entry.name !== "MANIFEST.json") {
      files.push(relative);
    }
  }

  return files;
}

if (manifest.file_count !== manifest.files.length) {
  failures.push(
    `manifest file_count is ${manifest.file_count}, but ${manifest.files.length} entries exist`,
  );
}

for (const entry of manifest.files) {
  const filePath = path.join(canonicalRoot, ...entry.path.split("/"));

  try {
    const [contents, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
    const digest = createHash("sha256").update(contents).digest("hex");

    if (metadata.size !== entry.bytes) {
      failures.push(`${entry.path}: expected ${entry.bytes} bytes, found ${metadata.size}`);
    }
    if (digest !== entry.sha256) {
      failures.push(`${entry.path}: SHA-256 does not match the canonical manifest`);
    }
  } catch (error) {
    failures.push(`${entry.path}: ${error instanceof Error ? error.message : "unreadable"}`);
  }
}

const actualFiles = (await listFiles(canonicalRoot)).sort();
const manifestedFiles = manifest.files.map((entry) => entry.path).sort();
const extraFiles = actualFiles.filter((entry) => !manifestedFiles.includes(entry));
const missingEntries = manifestedFiles.filter((entry) => !actualFiles.includes(entry));

for (const extraFile of extraFiles) {
  failures.push(`${extraFile}: file is not declared in MANIFEST.json`);
}
for (const missingEntry of missingEntries) {
  failures.push(`${missingEntry}: manifest entry has no corresponding file`);
}

if (failures.length > 0) {
  console.error("Canonical package validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Canonical package validated (${manifest.files.length} files).`);
}
