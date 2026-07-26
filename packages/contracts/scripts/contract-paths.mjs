import { fileURLToPath } from "node:url";
import path from "node:path";

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const repositoryRoot = path.resolve(packageRoot, "..", "..");

export const canonicalSourceRoot = path.join(
  repositoryRoot,
  "docs",
  "canonical",
  "Talence_Greenfield_Canon_v1.0.0",
  "contracts",
);

export const canonicalCopyRoot = path.join(packageRoot, "canonical");

export const generatedRoot = path.join(packageRoot, "src", "generated");

export const contractFiles = Object.freeze([
  "catalog-snapshot-manifest.schema.json",
  "device-api.openapi.yaml",
  "device-inventory-batch.schema.json",
  "device-run-summary.schema.json",
  "edge-catalog-schema.sql",
]);

export const jsonSchemaFiles = Object.freeze([
  "catalog-snapshot-manifest.schema.json",
  "device-inventory-batch.schema.json",
  "device-run-summary.schema.json",
]);
