/* This file is generated from canonical contracts. Do not edit directly. */

export interface TalenceDeviceInventoryBatch {
  schema_version: 1;
  catalog_snapshot_version: string;
  occurred_at: string;
  external_run_id?: string | null;
  /**
   * @minItems 1
   * @maxItems 500
   */
  lines: [Line, ...Line[]];
  metadata?: {
    [k: string]: string | number | boolean | null;
  };
}
/**
 * This interface was referenced by `TalenceDeviceInventoryBatch`'s JSON-Schema
 * via the `definition` "line".
 */
export interface Line {
  line_id: string;
  printing_id: string;
  finish: "unknown" | "nonfoil" | "foil" | "etched";
  condition: "unknown" | "near_mint" | "lightly_played" | "moderately_played" | "heavily_played" | "damaged";
  quantity_delta: number;
}
