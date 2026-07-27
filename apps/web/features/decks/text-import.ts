import type { DeckZone } from "@talence/domain";

import type { DeckImportCandidate, DeckImportResolutionStatus } from "./types";

export const MAX_DECK_IMPORT_BYTES = 256 * 1024;
export const MAX_DECK_IMPORT_LINES = 2_000;
export const MAX_DECK_IMPORT_NAME_LENGTH = 240;
export const MAX_DECK_IMPORT_QUANTITY = 999;

const ZONE_ALIASES = new Map<string, DeckZone>([
  ["deck", "mainboard"],
  ["main", "mainboard"],
  ["mainboard", "mainboard"],
  ["side", "sideboard"],
  ["sideboard", "sideboard"],
  ["sb", "sideboard"],
  ["commander", "commander"],
  ["commanders", "commander"],
  ["companion", "companion"],
  ["maybeboard", "maybeboard"],
  ["maybe", "maybeboard"],
  ["considering", "maybeboard"],
]);

export interface ParsedDeckImportLine {
  lineNumber: number;
  quantity: number;
  zone: DeckZone;
  name: string;
  normalizedName: string;
}

export interface DeckImportParseError {
  lineNumber: number | null;
  code:
    | "empty"
    | "too_large"
    | "too_many_lines"
    | "invalid_control_character"
    | "invalid_line"
    | "invalid_quantity"
    | "name_too_long"
    | "quantity_overflow";
  message: string;
}

export type DeckImportParseResult =
  | {
      ok: true;
      lines: ParsedDeckImportLine[];
      physicalLineCount: number;
      byteCount: number;
    }
  | {
      ok: false;
      errors: DeckImportParseError[];
      physicalLineCount: number;
      byteCount: number;
    };

export interface DeckImportReviewLine extends ParsedDeckImportLine {
  lineId: string;
  status: DeckImportResolutionStatus;
  candidateCount: number;
  candidates: DeckImportCandidate[];
  candidatesTruncated: boolean;
  suggestionsOmitted: boolean;
}

export type DeckImportStageState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      requestId: string;
      errors: DeckImportParseError[];
    }
  | {
      status: "ready";
      requestId: string;
      byteCount: number;
      physicalLineCount: number;
      rows: DeckImportReviewLine[];
      counts: Record<DeckImportResolutionStatus, number>;
    };

export function normalizeDeckImportName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function parseZone(value: string): DeckZone | null {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s_-]+/g, "");
  return ZONE_ALIASES.get(normalized) ?? null;
}

function headerZone(line: string): DeckZone | null {
  const bracketed = line.match(/^\[\s*([^\]]+?)\s*\]\s*:?\s*$/);
  if (bracketed) return parseZone(bracketed[1] ?? "");
  const markdown = line.match(/^#{1,3}\s+(.+?)\s*:?\s*$/);
  if (markdown) return parseZone(markdown[1] ?? "");
  const plain = line.match(/^([a-zA-Z _-]+?)\s*:?\s*$/);
  return plain ? parseZone(plain[1] ?? "") : null;
}

function suffixZone(line: string): { value: string; zone: DeckZone | null } {
  const suffix = line.match(/^(.*?)\s+\[\s*([^\]]+?)\s*\]\s*$/);
  if (!suffix) return { value: line, zone: null };
  const parsed = parseZone(suffix[2] ?? "");
  return parsed ? { value: suffix[1] ?? "", zone: parsed } : { value: line, zone: null };
}

function prefixedZone(line: string): { value: string; zone: DeckZone | null } {
  const prefix = line.match(/^([a-zA-Z _-]+?)\s*:\s*(.+)$/);
  if (!prefix) return { value: line, zone: null };
  const parsed = parseZone(prefix[1] ?? "");
  return parsed ? { value: prefix[2] ?? "", zone: parsed } : { value: line, zone: null };
}

function parseCardLine(
  rawLine: string,
  currentZone: DeckZone,
  lineNumber: number,
): { line: ParsedDeckImportLine | null; error: DeckImportParseError | null } {
  const suffixed = suffixZone(rawLine);
  const prefixed = prefixedZone(suffixed.value);
  const zone = suffixed.zone ?? prefixed.zone ?? currentZone;
  const match = prefixed.value.trim().match(/^(\d{1,6})\s*(?:x\s+|\s+)(.+?)\s*$/i);
  if (!match) {
    return {
      line: null,
      error: {
        lineNumber,
        code: "invalid_line",
        message: `Line ${lineNumber} must use “quantity card name”, optionally with a zone header or [zone] suffix.`,
      },
    };
  }
  const quantity = Number(match[1]);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return {
      line: null,
      error: {
        lineNumber,
        code: "invalid_quantity",
        message: `Line ${lineNumber} has an invalid quantity.`,
      },
    };
  }
  if (quantity > MAX_DECK_IMPORT_QUANTITY) {
    return {
      line: null,
      error: {
        lineNumber,
        code: "invalid_quantity",
        message: `Line ${lineNumber} exceeds the maximum quantity of ${MAX_DECK_IMPORT_QUANTITY}.`,
      },
    };
  }
  const name = (match[2] ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_DECK_IMPORT_NAME_LENGTH) {
    return {
      line: null,
      error: {
        lineNumber,
        code: "name_too_long",
        message: `Line ${lineNumber} has an empty or overlong card name.`,
      },
    };
  }
  return {
    line: {
      lineNumber,
      quantity,
      zone,
      name,
      normalizedName: normalizeDeckImportName(name),
    },
    error: null,
  };
}

export function parseDeckTextImport(source: string): DeckImportParseResult {
  const normalizedSource = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const byteCount = new TextEncoder().encode(normalizedSource).byteLength;
  const physicalLines = normalizedSource.split(/\r\n?|\n/);
  if (/(?:\r\n?|\n)$/.test(normalizedSource) && physicalLines.at(-1) === "") {
    physicalLines.pop();
  }
  const physicalLineCount = physicalLines.length;
  const boundaryErrors: DeckImportParseError[] = [];
  if (byteCount > MAX_DECK_IMPORT_BYTES) {
    boundaryErrors.push({
      lineNumber: null,
      code: "too_large",
      message: `Deck text exceeds the ${MAX_DECK_IMPORT_BYTES / 1024} KiB limit.`,
    });
  }
  if (physicalLineCount > MAX_DECK_IMPORT_LINES) {
    boundaryErrors.push({
      lineNumber: null,
      code: "too_many_lines",
      message: `Deck text exceeds the ${MAX_DECK_IMPORT_LINES.toLocaleString("en-US")}-line limit.`,
    });
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalizedSource)) {
    boundaryErrors.push({
      lineNumber: null,
      code: "invalid_control_character",
      message: "Deck text contains an unsupported control character.",
    });
  }
  if (boundaryErrors.length) {
    return { ok: false, errors: boundaryErrors, physicalLineCount, byteCount };
  }

  const lines: ParsedDeckImportLine[] = [];
  const errors: DeckImportParseError[] = [];
  let currentZone: DeckZone = "mainboard";
  for (let index = 0; index < physicalLines.length; index += 1) {
    const rawLine = (physicalLines[index] ?? "").trim();
    if (!rawLine) continue;
    const zoneHeader = headerZone(rawLine);
    if (zoneHeader) {
      currentZone = zoneHeader;
      continue;
    }
    if (/^(?:#|\/\/|;)/.test(rawLine)) continue;
    const parsed = parseCardLine(rawLine, currentZone, index + 1);
    if (parsed.line) lines.push(parsed.line);
    if (parsed.error) errors.push(parsed.error);
  }
  if (!lines.length && !errors.length) {
    errors.push({
      lineNumber: null,
      code: "empty",
      message: "Enter at least one card line before staging an import.",
    });
  }
  if (errors.length) return { ok: false, errors, physicalLineCount, byteCount };

  const merged = new Map<string, ParsedDeckImportLine>();
  for (const line of lines) {
    const key = `${line.zone}\u0000${line.normalizedName}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, line);
      continue;
    }
    const quantity = existing.quantity + line.quantity;
    if (quantity > MAX_DECK_IMPORT_QUANTITY) {
      errors.push({
        lineNumber: line.lineNumber,
        code: "quantity_overflow",
        message: `Merged copies of ${line.name} in ${line.zone} exceed ${MAX_DECK_IMPORT_QUANTITY}.`,
      });
      continue;
    }
    merged.set(key, { ...existing, quantity });
  }
  return errors.length
    ? { ok: false, errors, physicalLineCount, byteCount }
    : {
        ok: true,
        lines: [...merged.values()],
        physicalLineCount,
        byteCount,
      };
}
