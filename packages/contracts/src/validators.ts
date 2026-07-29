import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type { TalenceCatalogSnapshotManifest as CatalogSnapshotManifest } from "./generated/catalog-snapshot-manifest.js";
import type { TalenceDeviceInventoryBatch as DeviceInventoryBatch } from "./generated/device-inventory-batch.js";
import type { TalenceDeviceRunSummary as DeviceRunSummary } from "./generated/device-run-summary.js";
import {
  catalogSnapshotManifestSchema,
  deviceInventoryBatchSchema,
  deviceRunSummarySchema,
} from "./generated/schema-documents.js";

export class ContractValidationError extends Error {
  readonly issues: readonly ErrorObject[];

  constructor(contract: string, issues: readonly ErrorObject[]) {
    super(`${contract} failed canonical contract validation.`);
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);

const compile = <T>(schema: object): ValidateFunction<T> => ajv.compile<T>(schema);

const inventoryBatchValidator = compile<DeviceInventoryBatch>(deviceInventoryBatchSchema);
const runSummaryValidator = compile<DeviceRunSummary>(deviceRunSummarySchema);
const manifestValidator = compile<CatalogSnapshotManifest>(catalogSnapshotManifestSchema);

const requireValid = <T>(contract: string, validator: ValidateFunction<T>, value: unknown): T => {
  if (!validator(value)) {
    throw new ContractValidationError(contract, validator.errors ?? []);
  }
  return value;
};

export const parseDeviceInventoryBatch = (value: unknown): DeviceInventoryBatch => {
  const batch = requireValid("device inventory batch", inventoryBatchValidator, value);

  const lineIds = new Set<string>();
  for (const line of batch.lines) {
    if (lineIds.has(line.line_id)) {
      throw new ContractValidationError("device inventory batch", [
        {
          instancePath: "/lines",
          schemaPath: "#/semantic/uniqueLineIds",
          keyword: "uniqueLineIds",
          params: { duplicate: line.line_id },
          message: "line_id must be unique within a batch",
        },
      ]);
    }
    lineIds.add(line.line_id);
  }

  return batch;
};

export const parseDeviceRunSummary = (value: unknown): DeviceRunSummary =>
  requireValid("device run summary", runSummaryValidator, value);

export const parseCatalogSnapshotManifest = (value: unknown): CatalogSnapshotManifest => {
  const manifest = requireValid("catalog snapshot manifest", manifestValidator, value);

  const download = manifest.latest.download;
  const invalidDownloadState =
    (manifest.up_to_date && download != null) || (!manifest.up_to_date && download == null);

  if (invalidDownloadState) {
    throw new ContractValidationError("catalog snapshot manifest", [
      {
        instancePath: "/latest/download",
        schemaPath: "#/semantic/downloadState",
        keyword: "downloadState",
        params: { up_to_date: manifest.up_to_date },
        message:
          "download must be absent or null when current and present when an update is available",
      },
    ]);
  }

  return manifest;
};
