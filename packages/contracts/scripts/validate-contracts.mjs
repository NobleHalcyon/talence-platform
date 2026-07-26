import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { canonicalCopyRoot, jsonSchemaFiles } from "./contract-paths.mjs";

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);

const schemaIds = new Set();
for (const filename of jsonSchemaFiles) {
  const schema = JSON.parse(await readFile(path.join(canonicalCopyRoot, filename), "utf8"));
  if (typeof schema.$id !== "string" || schema.$id.length === 0) {
    throw new Error(`${filename} does not declare a non-empty $id.`);
  }
  if (schemaIds.has(schema.$id)) {
    throw new Error(`Duplicate JSON Schema $id: ${schema.$id}`);
  }
  schemaIds.add(schema.$id);
  ajv.compile(schema);
}

const openapiPath = path.join(canonicalCopyRoot, "device-api.openapi.yaml");
const api = await SwaggerParser.validate(openapiPath);

if (api.openapi !== "3.1.0") {
  throw new Error(`Expected OpenAPI 3.1.0, received ${api.openapi}.`);
}

const expectedOperations = new Map([
  ["/device/me", ["get"]],
  ["/device/heartbeat", ["post"]],
  ["/device/catalog/manifest", ["get"]],
  ["/device/collections/{collection_id}/inventory-batches", ["post"]],
  ["/device/collections/{collection_id}/inventory", ["get"]],
  ["/device/runs", ["post"]],
]);

for (const [route, methods] of expectedOperations) {
  const pathItem = api.paths?.[route];
  if (!pathItem) {
    throw new Error(`Missing canonical device path: ${route}`);
  }
  for (const method of methods) {
    if (!(method in pathItem)) {
      throw new Error(`Missing canonical operation: ${method.toUpperCase()} ${route}`);
    }
  }
}

const sql = await readFile(path.join(canonicalCopyRoot, "edge-catalog-schema.sql"), "utf8");
const database = new DatabaseSync(":memory:");
try {
  database.exec(sql);
  const quickCheck = database.prepare("PRAGMA quick_check").get();
  if (quickCheck?.quick_check !== "ok") {
    throw new Error(`SQLite quick_check failed: ${JSON.stringify(quickCheck)}`);
  }
  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyFailures.length !== 0) {
    throw new Error("Canonical SQLite schema has foreign-key failures.");
  }
  const userVersion = database.prepare("PRAGMA user_version").get();
  if (userVersion?.user_version !== 1) {
    throw new Error(`Expected SQLite user_version 1: ${JSON.stringify(userVersion)}`);
  }
} finally {
  database.close();
}

console.log(
  `Validated ${jsonSchemaFiles.length} JSON Schemas, OpenAPI ${api.info.version}, ` +
    "and SQLite schema version 1.",
);
