import {
  CARD_CONDITIONS,
  CARD_FINISHES,
  type CardCondition,
  type CardFinish,
} from "@talence/domain";

import type {
  InventoryExportRow,
  InventoryImportErrorReportRow,
  InventoryImportInputRow,
  InventoryImportPreviewRow,
} from "./types";

export const INVENTORY_IMPORT_LIMITS = Object.freeze({
  maximumBytes: 2 * 1024 * 1024,
  maximumRows: 5_000,
  maximumColumns: 32,
  maximumCellCharacters: 4_096,
  maximumRowCharacters: 16_384,
  maximumQuantityPerRow: 10_000,
});

export const INVENTORY_IMPORT_PARSER_VERSION = "talence-csv-v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const LANGUAGE_PATTERN = /^[a-z][a-z0-9_-]{1,15}$/;

const ALLOWED_HEADERS = new Set([
  "scryfall_id",
  "oracle_id",
  "name",
  "set_code",
  "collector_number",
  "language",
  "finish",
  "condition",
  "quantity",
  // Server export provenance is intentionally accepted but never staged as
  // inventory input. This keeps exports round-trippable without trusting
  // client-supplied market observations.
  "price_provider",
  "price_currency",
  "unit_estimate",
  "price_observed_at",
  "price_ingested_at",
  "price_stale_after",
]);

const FINISHES = new Set<string>(CARD_FINISHES);
const CONDITIONS = new Set<string>(CARD_CONDITIONS);

export type InventoryCsvErrorCode =
  | "empty_file"
  | "invalid_encoding"
  | "file_too_large"
  | "too_many_rows"
  | "too_many_columns"
  | "cell_too_large"
  | "row_too_large"
  | "malformed_csv"
  | "missing_header"
  | "duplicate_header"
  | "unknown_header"
  | "missing_required_header";

export interface InventoryCsvFileError {
  code: InventoryCsvErrorCode;
  message: string;
  rowNumber?: number;
  columnNumber?: number;
}

export type InventoryCsvParseResult =
  | {
      ok: true;
      rows: InventoryImportInputRow[];
      headers: string[];
      byteLength: number;
    }
  | {
      ok: false;
      error: InventoryCsvFileError;
    };

interface ParsedCsv {
  records: string[][];
  error: InventoryCsvFileError | null;
}

function fileError(
  code: InventoryCsvErrorCode,
  message: string,
  rowNumber?: number,
  columnNumber?: number,
): InventoryCsvParseResult {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(rowNumber === undefined ? {} : { rowNumber }),
      ...(columnNumber === undefined ? {} : { columnNumber }),
    },
  };
}

function parseRecords(text: string): ParsedCsv {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  let rowNumber = 1;
  let columnNumber = 1;
  let rowCharacterCount = 0;

  function pushCell(): InventoryCsvFileError | null {
    if (cell.length > INVENTORY_IMPORT_LIMITS.maximumCellCharacters) {
      return {
        code: "cell_too_large",
        message: `Cell ${columnNumber} on row ${rowNumber} exceeds ${INVENTORY_IMPORT_LIMITS.maximumCellCharacters.toLocaleString()} characters.`,
        rowNumber,
        columnNumber,
      };
    }
    rowCharacterCount += cell.length;
    if (rowCharacterCount > INVENTORY_IMPORT_LIMITS.maximumRowCharacters) {
      return {
        code: "row_too_large",
        message: `Row ${rowNumber} exceeds ${INVENTORY_IMPORT_LIMITS.maximumRowCharacters.toLocaleString()} total cell characters.`,
        rowNumber,
      };
    }
    record.push(cell);
    cell = "";
    afterQuote = false;
    columnNumber += 1;
    if (record.length > INVENTORY_IMPORT_LIMITS.maximumColumns) {
      return {
        code: "too_many_columns",
        message: `Row ${rowNumber} exceeds ${INVENTORY_IMPORT_LIMITS.maximumColumns} columns.`,
        rowNumber,
      };
    }
    return null;
  }

  function pushRecord(): InventoryCsvFileError | null {
    const error = pushCell();
    if (error) {
      return error;
    }
    records.push(record);
    record = [];
    rowNumber += 1;
    columnNumber = 1;
    rowCharacterCount = 0;
    if (records.length > INVENTORY_IMPORT_LIMITS.maximumRows + 1) {
      return {
        code: "too_many_rows",
        message: `CSV files are limited to ${INVENTORY_IMPORT_LIMITS.maximumRows.toLocaleString()} data rows.`,
        rowNumber,
      };
    }
    return null;
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
        if (cell.length > INVENTORY_IMPORT_LIMITS.maximumCellCharacters) {
          return {
            records,
            error: {
              code: "cell_too_large",
              message: `Cell ${columnNumber} on row ${rowNumber} exceeds ${INVENTORY_IMPORT_LIMITS.maximumCellCharacters.toLocaleString()} characters.`,
              rowNumber,
              columnNumber,
            },
          };
        }
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      return {
        records,
        error: {
          code: "malformed_csv",
          message: `Unexpected character after a closing quote on row ${rowNumber}.`,
          rowNumber,
          columnNumber,
        },
      };
    }

    if (character === '"' && cell.length === 0 && !afterQuote) {
      quoted = true;
    } else if (character === ",") {
      const error = pushCell();
      if (error) return { records, error };
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      const error = pushRecord();
      if (error) return { records, error };
    } else {
      cell += character;
      if (cell.length > INVENTORY_IMPORT_LIMITS.maximumCellCharacters) {
        return {
          records,
          error: {
            code: "cell_too_large",
            message: `Cell ${columnNumber} on row ${rowNumber} exceeds ${INVENTORY_IMPORT_LIMITS.maximumCellCharacters.toLocaleString()} characters.`,
            rowNumber,
            columnNumber,
          },
        };
      }
    }
  }

  if (quoted) {
    return {
      records,
      error: {
        code: "malformed_csv",
        message: `Unclosed quoted cell on row ${rowNumber}.`,
        rowNumber,
        columnNumber,
      },
    };
  }

  if (record.length > 0 || cell.length > 0 || afterQuote) {
    const error = pushRecord();
    if (error) return { records, error };
  }

  return { records, error: null };
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function nullableCell(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function rowError(
  base: Omit<InventoryImportInputRow, "errorCode" | "errorMessage">,
  errorCode: string,
  errorMessage: string,
): InventoryImportInputRow {
  return { ...base, errorCode, errorMessage };
}

function normalizedRow(record: string[], indexes: Map<string, number>, rowNumber: number) {
  const value = (header: string) => nullableCell(record[indexes.get(header) ?? -1]);
  const rawScryfallId = value("scryfall_id");
  const rawOracleId = value("oracle_id");
  const rawSetCode = value("set_code");
  const rawLanguage = value("language");
  const rawFinish = value("finish")?.toLowerCase() ?? null;
  const rawCondition = value("condition")?.toLowerCase() ?? null;
  const rawQuantity = value("quantity");
  const quantity = rawQuantity && /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : null;

  const base: Omit<InventoryImportInputRow, "errorCode" | "errorMessage"> = {
    rowNumber,
    scryfallId: rawScryfallId?.toLowerCase() ?? null,
    oracleId: rawOracleId?.toLowerCase() ?? null,
    name: value("name"),
    setCode: rawSetCode?.toUpperCase() ?? null,
    collectorNumber: value("collector_number"),
    language: rawLanguage?.toLowerCase() ?? null,
    finish:
      FINISHES.has(rawFinish ?? "") && rawFinish !== "unknown"
        ? (rawFinish as Exclude<CardFinish, "unknown">)
        : null,
    condition:
      CONDITIONS.has(rawCondition ?? "") && rawCondition !== "unknown"
        ? (rawCondition as Exclude<CardCondition, "unknown">)
        : null,
    quantity,
    strategy: rawScryfallId ? "scryfall_id" : "set_collector_language",
    raw: {
      scryfallId: rawScryfallId,
      oracleId: rawOracleId,
      name: value("name"),
      setCode: rawSetCode,
      collectorNumber: value("collector_number"),
      language: rawLanguage,
      finish: value("finish"),
      condition: value("condition"),
      quantity: rawQuantity,
    },
  };

  if (record.every((cellValue) => cellValue.trim() === "")) {
    return null;
  }
  if (rawScryfallId && !UUID_PATTERN.test(rawScryfallId)) {
    return rowError(
      base,
      "invalid_scryfall_id",
      "The explicit Scryfall ID is not a valid UUID and will not fall back to other fields.",
    );
  }
  if (rawOracleId && !UUID_PATTERN.test(rawOracleId)) {
    return rowError(base, "invalid_oracle_id", "Oracle ID must be a valid UUID when supplied.");
  }
  if (!rawScryfallId) {
    if (!rawSetCode || !SET_CODE_PATTERN.test(rawSetCode.toUpperCase())) {
      return rowError(
        base,
        "set_code_required",
        "A valid set code is required when Scryfall ID is absent.",
      );
    }
    if (!base.collectorNumber) {
      return rowError(
        base,
        "collector_number_required",
        "Collector number is required when Scryfall ID is absent.",
      );
    }
    if (!rawLanguage || !LANGUAGE_PATTERN.test(rawLanguage.toLowerCase())) {
      return rowError(
        base,
        "language_required",
        "A valid language code is required when Scryfall ID is absent.",
      );
    }
  }
  if (!rawFinish || !FINISHES.has(rawFinish) || rawFinish === "unknown") {
    return rowError(
      base,
      "invalid_finish",
      "Finish must be nonfoil, foil, or etched; unknown inventory cannot be imported.",
    );
  }
  if (!rawCondition || !CONDITIONS.has(rawCondition) || rawCondition === "unknown") {
    return rowError(
      base,
      "invalid_condition",
      "Condition must be a supported known condition; unknown inventory cannot be imported.",
    );
  }
  if (
    quantity === null ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > INVENTORY_IMPORT_LIMITS.maximumQuantityPerRow
  ) {
    return rowError(
      base,
      "invalid_quantity",
      `Quantity must be an additive whole number from 1 to ${INVENTORY_IMPORT_LIMITS.maximumQuantityPerRow.toLocaleString()}.`,
    );
  }

  return {
    ...base,
    errorCode: null,
    errorMessage: null,
  } satisfies InventoryImportInputRow;
}

export function parseInventoryCsvBytes(bytes: Uint8Array): InventoryCsvParseResult {
  if (bytes.byteLength === 0) {
    return fileError("empty_file", "Choose a non-empty CSV file.");
  }
  if (bytes.byteLength > INVENTORY_IMPORT_LIMITS.maximumBytes) {
    return fileError(
      "file_too_large",
      `CSV files are limited to ${Math.floor(
        INVENTORY_IMPORT_LIMITS.maximumBytes / (1024 * 1024),
      )} MiB.`,
    );
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fileError("invalid_encoding", "The CSV must be valid UTF-8 text.");
  }
  text = text.replace(/^\uFEFF/, "");

  const parsed = parseRecords(text);
  if (parsed.error) {
    return { ok: false, error: parsed.error };
  }
  if (parsed.records.length === 0 || parsed.records[0]!.every((cell) => !cell.trim())) {
    return fileError("missing_header", "The CSV header row is missing.");
  }

  const headers = parsed.records[0]!.map(normalizedHeader);
  const indexes = new Map<string, number>();
  for (const [index, header] of headers.entries()) {
    if (!header) {
      return fileError("missing_header", `Header column ${index + 1} is blank.`, 1, index + 1);
    }
    if (!ALLOWED_HEADERS.has(header)) {
      return fileError("unknown_header", `Header "${header}" is not supported.`, 1, index + 1);
    }
    if (indexes.has(header)) {
      return fileError(
        "duplicate_header",
        `Header "${header}" appears more than once.`,
        1,
        index + 1,
      );
    }
    indexes.set(header, index);
  }

  for (const required of ["finish", "condition", "quantity"]) {
    if (!indexes.has(required)) {
      return fileError("missing_required_header", `Required header "${required}" is missing.`, 1);
    }
  }
  const hasScryfallId = indexes.has("scryfall_id");
  const hasTuple =
    indexes.has("set_code") && indexes.has("collector_number") && indexes.has("language");
  if (!hasScryfallId && !hasTuple) {
    return fileError(
      "missing_required_header",
      "Include scryfall_id or all of set_code, collector_number, and language.",
      1,
    );
  }

  const rows = parsed.records
    .slice(1)
    .map((record, index) => normalizedRow(record, indexes, index + 2))
    .filter((row): row is InventoryImportInputRow => row !== null);

  if (rows.length === 0) {
    return fileError("empty_file", "The CSV does not contain any inventory rows.");
  }

  return {
    ok: true,
    rows,
    headers,
    byteLength: bytes.byteLength,
  };
}

export function parseInventoryCsvText(text: string): InventoryCsvParseResult {
  return parseInventoryCsvBytes(new TextEncoder().encode(text));
}

export function protectSpreadsheetCell(value: string): string {
  return /^(?:[\t\r\n]|\s*[=+\-@])/.test(value) ? `'${value}` : value;
}

export function encodeCsvCell(value: string | number | null): string {
  const text = protectSpreadsheetCell(value === null ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeRows(
  headers: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>,
): string {
  return [
    headers.map(encodeCsvCell).join(","),
    ...rows.map((row) =>
      row
        .map((value) =>
          encodeCsvCell(value === undefined ? null : (value as string | number | null)),
        )
        .join(","),
    ),
  ].join("\r\n");
}

export const INVENTORY_EXPORT_HEADERS = [
  "scryfall_id",
  "oracle_id",
  "name",
  "set_code",
  "collector_number",
  "language",
  "finish",
  "condition",
  "quantity",
  "price_provider",
  "price_currency",
  "unit_estimate",
  "price_observed_at",
  "price_ingested_at",
  "price_stale_after",
] as const;

function inventoryExportCells(row: InventoryExportRow): readonly unknown[] {
  return [
    row.scryfallId,
    row.oracleId,
    row.name,
    row.setCode,
    row.collectorNumber,
    row.language,
    row.finish,
    row.condition,
    row.quantity,
    row.price?.provider ?? null,
    row.price?.currency ?? null,
    row.price?.amount ?? null,
    row.price?.observedAt ?? null,
    row.price?.ingestedAt ?? null,
    row.price?.staleAfter ?? null,
  ];
}

export function serializeInventoryExportHeader(): string {
  return INVENTORY_EXPORT_HEADERS.map(encodeCsvCell).join(",");
}

export function serializeInventoryExportRow(row: InventoryExportRow): string {
  return inventoryExportCells(row)
    .map((value) => encodeCsvCell(value === undefined ? null : (value as string | number | null)))
    .join(",");
}

export function serializeInventoryExport(rows: readonly InventoryExportRow[]): string {
  return serializeRows(INVENTORY_EXPORT_HEADERS, rows.map(inventoryExportCells));
}

export const INVENTORY_IMPORT_ERROR_HEADERS = [
  "row_number",
  "status",
  "error_code",
  "error_message",
  "scryfall_id",
  "name",
  "set_code",
  "collector_number",
  "language",
  "finish",
  "condition",
  "quantity",
  "suggestion",
] as const;

type InventoryImportErrorCsvRow = InventoryImportPreviewRow | InventoryImportErrorReportRow;

function inventoryImportErrorCells(row: InventoryImportErrorCsvRow): readonly unknown[] {
  const raw = row.raw;
  return [
    row.rowNumber,
    row.status,
    row.errorCode,
    row.errorMessage,
    raw?.scryfallId ?? ("scryfallId" in row ? row.scryfallId : null),
    raw?.name ?? ("name" in row ? row.name : null),
    raw?.setCode ?? ("setCode" in row ? row.setCode : null),
    raw?.collectorNumber ?? ("collectorNumber" in row ? row.collectorNumber : null),
    raw?.language ?? ("language" in row ? row.language : null),
    raw?.finish ?? ("finish" in row ? row.finish : null),
    raw?.condition ?? ("condition" in row ? row.condition : null),
    raw?.quantity ?? ("quantity" in row ? row.quantity : null),
    row.suggestion,
  ];
}

export function serializeImportErrorReportHeader(): string {
  return INVENTORY_IMPORT_ERROR_HEADERS.map(encodeCsvCell).join(",");
}

export function serializeImportErrorReportRow(row: InventoryImportErrorCsvRow): string {
  return inventoryImportErrorCells(row)
    .map((value) => encodeCsvCell(value === undefined ? null : (value as string | number | null)))
    .join(",");
}

export function serializeImportErrorReport(rows: readonly InventoryImportErrorCsvRow[]): string {
  return serializeRows(
    INVENTORY_IMPORT_ERROR_HEADERS,
    rows.filter((row) => row.status !== "matched").map(inventoryImportErrorCells),
  );
}
