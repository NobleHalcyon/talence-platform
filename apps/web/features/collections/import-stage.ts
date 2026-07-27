import type { InventoryImportInputRow } from "./types";

export const INVENTORY_IMPORT_STAGE_LIMITS = Object.freeze({
  maximumRowsPerChunk: 500,
  maximumChunkBytes: 512 * 1024,
  maximumRowBytes: 128 * 1024,
});

export type InventoryImportStageRow = Record<string, unknown>;

export type InventoryImportStageChunks =
  | {
      ok: true;
      chunks: InventoryImportStageRow[][];
    }
  | {
      ok: false;
      reason: "row_too_large";
      rowNumber: number;
    };

const utf8Encoder = new TextEncoder();

function jsonUtf8Bytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength;
}

function rawStageRow(row: InventoryImportInputRow): InventoryImportStageRow {
  return {
    row_number: row.rowNumber,
    scryfall_id: row.raw?.scryfallId ?? row.scryfallId,
    set_code: row.raw?.setCode ?? row.setCode,
    collector_number: row.raw?.collectorNumber ?? row.collectorNumber,
    language: row.raw?.language ?? row.language,
    name: row.raw?.name ?? row.name,
    finish: row.raw?.finish ?? row.finish,
    condition: row.raw?.condition ?? row.condition,
    quantity: row.raw?.quantity ?? row.quantity,
  };
}

/**
 * Produces bounded JSON-array payloads for the staging RPC.
 *
 * The byte count includes the exact UTF-8 array brackets, commas, and encoded
 * row objects. The 512 KiB client ceiling intentionally stays well below the
 * database's 2 MiB jsonb argument ceiling.
 */
export function chunkInventoryImportStageRows(
  rows: InventoryImportInputRow[],
): InventoryImportStageChunks {
  const chunks: InventoryImportStageRow[][] = [];
  let chunk: InventoryImportStageRow[] = [];
  let chunkBytes = 2;

  for (const sourceRow of rows) {
    const row = rawStageRow(sourceRow);
    const rowBytes = jsonUtf8Bytes(row);
    if (
      rowBytes > INVENTORY_IMPORT_STAGE_LIMITS.maximumRowBytes ||
      rowBytes + 2 > INVENTORY_IMPORT_STAGE_LIMITS.maximumChunkBytes
    ) {
      return {
        ok: false,
        reason: "row_too_large",
        rowNumber: sourceRow.rowNumber,
      };
    }

    const separatorBytes = chunk.length === 0 ? 0 : 1;
    const exceedsCount = chunk.length >= INVENTORY_IMPORT_STAGE_LIMITS.maximumRowsPerChunk;
    const exceedsBytes =
      chunkBytes + separatorBytes + rowBytes > INVENTORY_IMPORT_STAGE_LIMITS.maximumChunkBytes;

    if (exceedsCount || exceedsBytes) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 2;
    }

    chunkBytes += (chunk.length === 0 ? 0 : 1) + rowBytes;
    chunk.push(row);
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  return { ok: true, chunks };
}
