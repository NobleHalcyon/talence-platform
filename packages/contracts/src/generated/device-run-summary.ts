/* This file is generated from canonical contracts. Do not edit directly. */

export interface TalenceDeviceRunSummary {
  schema_version: 1;
  external_run_id: string;
  collection_id: string;
  status: "completed" | "failed" | "cancelled" | "partially_posted";
  catalog_snapshot_version: string;
  started_at: string;
  completed_at: string;
  counts: {
    total: number;
    recognized: number;
    unrecognized: number;
    posted: number;
  };
  diagnostic_code?: string | null;
  metadata?: {
    [k: string]: string | number | boolean | null;
  };
}
