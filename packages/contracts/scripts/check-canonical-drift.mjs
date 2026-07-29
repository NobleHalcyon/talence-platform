import { readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalCopyRoot, canonicalSourceRoot, contractFiles } from "./contract-paths.mjs";

const differences = [];

for (const filename of contractFiles) {
  const [source, copy] = await Promise.all([
    readFile(path.join(canonicalSourceRoot, filename)),
    readFile(path.join(canonicalCopyRoot, filename)),
  ]);

  if (!source.equals(copy)) {
    differences.push(filename);
  }
}

if (differences.length > 0) {
  throw new Error(
    `Canonical contract drift detected: ${differences.join(", ")}. ` +
      "Run node packages/contracts/scripts/sync-canonical-contracts.mjs.",
  );
}

console.log(`Canonical contract copies match (${contractFiles.length} files).`);
