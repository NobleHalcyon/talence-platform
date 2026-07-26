import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { canonicalCopyRoot, canonicalSourceRoot, contractFiles } from "./contract-paths.mjs";

await mkdir(canonicalCopyRoot, { recursive: true });

for (const filename of contractFiles) {
  await copyFile(path.join(canonicalSourceRoot, filename), path.join(canonicalCopyRoot, filename));
}

console.log(`Synchronized ${contractFiles.length} canonical contract files.`);
