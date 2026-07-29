import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compile } from "json-schema-to-typescript";
import openapiTS, { astToString } from "openapi-typescript";

import { canonicalCopyRoot, generatedRoot, jsonSchemaFiles } from "./contract-paths.mjs";

const checkOnly = process.argv.includes("--check");
const generatedBanner =
  "/* This file is generated from canonical contracts. Do not edit directly. */\n";

const schemaTargets = Object.freeze({
  "catalog-snapshot-manifest.schema.json": {
    filename: "catalog-snapshot-manifest.ts",
    typeName: "CatalogSnapshotManifest",
    exportName: "catalogSnapshotManifestSchema",
  },
  "device-inventory-batch.schema.json": {
    filename: "device-inventory-batch.ts",
    typeName: "DeviceInventoryBatch",
    exportName: "deviceInventoryBatchSchema",
  },
  "device-run-summary.schema.json": {
    filename: "device-run-summary.ts",
    typeName: "DeviceRunSummary",
    exportName: "deviceRunSummarySchema",
  },
});

const outputs = new Map();

const openapiPath = path.join(canonicalCopyRoot, "device-api.openapi.yaml");
const openapiAst = await openapiTS(pathToFileURL(openapiPath));
outputs.set("device-api.ts", `${generatedBanner}${astToString(openapiAst)}`);

const schemaDocuments = [];

for (const schemaFilename of jsonSchemaFiles) {
  const target = schemaTargets[schemaFilename];
  if (!target) {
    throw new Error(`No generation target configured for ${schemaFilename}.`);
  }

  const source = await readFile(path.join(canonicalCopyRoot, schemaFilename), "utf8");
  const schema = JSON.parse(source);
  const typeSource = await compile(schema, target.typeName, {
    bannerComment: generatedBanner.trimEnd(),
    format: true,
    unreachableDefinitions: true,
  });

  outputs.set(target.filename, typeSource);
  schemaDocuments.push(
    `export const ${target.exportName} = ${JSON.stringify(schema, null, 2)} as const;`,
  );
}

outputs.set("schema-documents.ts", `${generatedBanner}\n${schemaDocuments.join("\n\n")}\n`);

await mkdir(generatedRoot, { recursive: true });

const drift = [];
for (const [filename, source] of outputs) {
  const outputPath = path.join(generatedRoot, filename);
  const normalizedSource = source.replaceAll("\r\n", "\n");

  if (checkOnly) {
    let current = "";
    try {
      current = await readFile(outputPath, "utf8");
    } catch {
      drift.push(filename);
      continue;
    }

    if (current.replaceAll("\r\n", "\n") !== normalizedSource) {
      drift.push(filename);
    }
    continue;
  }

  await writeFile(outputPath, normalizedSource, "utf8");
}

if (drift.length > 0) {
  throw new Error(
    `Generated contract types are stale: ${drift.join(", ")}. ` +
      "Run npm run generate --workspace @talence/contracts.",
  );
}

console.log(
  checkOnly
    ? `Generated contract types are current (${outputs.size} files).`
    : `Generated ${outputs.size} contract type files.`,
);
