import { describe, expect, it } from "vitest";

import {
  encodeCsvCell,
  INVENTORY_IMPORT_LIMITS,
  parseInventoryCsvBytes,
  parseInventoryCsvText,
  protectSpreadsheetCell,
  serializeImportErrorReport,
  serializeInventoryExport,
} from "@/features/collections/csv";
import type { InventoryExportRow, InventoryImportPreviewRow } from "@/features/collections/types";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

describe("collection CSV boundary", () => {
  it("parses quoted UTF-8 rows and exact supported identity strategies", () => {
    const result = parseInventoryCsvText(
      [
        "scryfall_id,name,set_code,collector_number,language,finish,condition,quantity",
        `${VALID_ID},"Fixture, Card",TST,7,en,foil,near_mint,2`,
        ',Fallback Card,TST,"7a",ja,nonfoil,lightly_played,1',
      ].join("\r\n"),
    );

    expect(result).toMatchObject({
      ok: true,
      rows: [
        {
          rowNumber: 2,
          scryfallId: VALID_ID,
          name: "Fixture, Card",
          strategy: "scryfall_id",
          finish: "foil",
          condition: "near_mint",
          quantity: 2,
          errorCode: null,
        },
        {
          rowNumber: 3,
          scryfallId: null,
          setCode: "TST",
          collectorNumber: "7a",
          language: "ja",
          strategy: "set_collector_language",
          errorCode: null,
        },
      ],
    });
  });

  it("hard-rejects an explicit malformed Scryfall ID without tuple fallback", () => {
    const result = parseInventoryCsvText(
      [
        "scryfall_id,set_code,collector_number,language,finish,condition,quantity",
        "not-a-uuid,TST,7,en,nonfoil,near_mint,1",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      ok: true,
      rows: [
        {
          strategy: "scryfall_id",
          errorCode: "invalid_scryfall_id",
        },
      ],
    });
  });

  it("keeps row validation additive-only and disallows unknown finish or condition", () => {
    const result = parseInventoryCsvText(
      [
        "scryfall_id,finish,condition,quantity",
        `${VALID_ID},unknown,near_mint,1`,
        `${VALID_ID},foil,unknown,1`,
        `${VALID_ID},foil,near_mint,-1`,
      ].join("\n"),
    );

    expect(result.ok && result.rows.map((row) => row.errorCode)).toEqual([
      "invalid_finish",
      "invalid_condition",
      "invalid_quantity",
    ]);
  });

  it("enforces the byte ceiling before text decoding", () => {
    const bytes = new Uint8Array(INVENTORY_IMPORT_LIMITS.maximumBytes + 1);
    const result = parseInventoryCsvBytes(bytes);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "file_too_large" },
    });
  });

  it("enforces row, column, cell, header, and UTF-8 bounds", () => {
    const tooManyRows = [
      "scryfall_id,finish,condition,quantity",
      ...Array.from(
        { length: INVENTORY_IMPORT_LIMITS.maximumRows + 1 },
        () => `${VALID_ID},nonfoil,near_mint,1`,
      ),
    ].join("\n");
    expect(parseInventoryCsvText(tooManyRows)).toMatchObject({
      ok: false,
      error: { code: "too_many_rows" },
    });

    const tooManyColumns = Array.from(
      { length: INVENTORY_IMPORT_LIMITS.maximumColumns + 1 },
      (_, index) => `column_${index}`,
    ).join(",");
    expect(parseInventoryCsvText(tooManyColumns)).toMatchObject({
      ok: false,
      error: { code: "too_many_columns" },
    });

    expect(
      parseInventoryCsvText(
        `scryfall_id,finish,condition,quantity,name\n${VALID_ID},nonfoil,near_mint,1,${"x".repeat(
          INVENTORY_IMPORT_LIMITS.maximumCellCharacters + 1,
        )}`,
      ),
    ).toMatchObject({ ok: false, error: { code: "cell_too_large" } });

    const largeCells = Array.from({ length: 5 }, () =>
      "x".repeat(INVENTORY_IMPORT_LIMITS.maximumCellCharacters),
    );
    expect(
      parseInventoryCsvText(
        [
          "scryfall_id,finish,condition,quantity,name,oracle_id,set_code,collector_number,language",
          [VALID_ID, "nonfoil", "near_mint", "1", ...largeCells].join(","),
        ].join("\n"),
      ),
    ).toMatchObject({ ok: false, error: { code: "row_too_large" } });

    expect(
      parseInventoryCsvText(
        `scryfall_id,finish,condition,quantity,unexpected\n${VALID_ID},nonfoil,near_mint,1,x`,
      ),
    ).toMatchObject({ ok: false, error: { code: "unknown_header" } });

    expect(parseInventoryCsvBytes(Uint8Array.from([0xc3, 0x28]))).toMatchObject({
      ok: false,
      error: { code: "invalid_encoding" },
    });
  });

  it("prefixes spreadsheet formulas before RFC-compatible CSV quoting", () => {
    for (const value of [
      "=1+1",
      "+cmd",
      "-2+3",
      "@SUM(A1)",
      "\tformula",
      "\rformula",
      "\nformula",
      "   =1+1",
      "\t @cmd",
      "\n -2+3",
      "\r\n+cmd",
    ]) {
      expect(protectSpreadsheetCell(value)).toBe(`'${value}`);
      expect(encodeCsvCell(value)).toContain(`'${value}`);
    }
    expect(protectSpreadsheetCell(" ordinary text")).toBe(" ordinary text");
    expect(protectSpreadsheetCell("1+1")).toBe("1+1");
    expect(encodeCsvCell('safe, "quoted"')).toBe('"safe, ""quoted"""');
  });

  it("exports stable identifiers and formula-safe labels", () => {
    const row = {
      scryfallId: VALID_ID,
      oracleId: "22222222-2222-4222-8222-222222222222",
      name: '=HYPERLINK("bad")',
      setCode: "TST",
      collectorNumber: "7",
      language: "en",
      finish: "nonfoil",
      condition: "near_mint",
      quantity: 1,
      price: null,
    } satisfies InventoryExportRow;

    const csv = serializeInventoryExport([row]);
    expect(csv).toContain("scryfall_id,oracle_id,name");
    expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(csv).toContain(`${VALID_ID},22222222-2222-4222-8222-222222222222`);

    const parsed = parseInventoryCsvText(csv);
    expect(parsed).toMatchObject({
      ok: true,
      rows: [
        {
          scryfallId: VALID_ID,
          name: `'=HYPERLINK("bad")`,
          finish: "nonfoil",
          condition: "near_mint",
          quantity: 1,
          errorCode: null,
        },
      ],
    });
  });

  it("round-trips server price provenance while still rejecting arbitrary headers", () => {
    const csv = serializeInventoryExport([
      {
        scryfallId: VALID_ID,
        oracleId: null,
        name: "+Formula-looking card",
        setCode: "TST",
        collectorNumber: "7",
        language: "en",
        finish: "foil",
        condition: "lightly_played",
        quantity: 3,
        price: {
          provider: "scryfall",
          currency: "USD",
          amount: "12.3400",
          observedAt: "2026-07-26T10:00:00Z",
          ingestedAt: "2026-07-26T11:00:00Z",
          staleAfter: "2026-07-27T10:00:00Z",
        },
      },
    ]);

    expect(parseInventoryCsvText(csv)).toMatchObject({
      ok: true,
      rows: [
        {
          scryfallId: VALID_ID,
          name: "'+Formula-looking card",
          finish: "foil",
          condition: "lightly_played",
          quantity: 3,
          errorCode: null,
        },
      ],
    });
    expect(
      parseInventoryCsvText(
        `${csv.split(/\r?\n/, 1)[0]},arbitrary_metadata\n${VALID_ID},,,,,,nonfoil,near_mint,1,,,,,,,bad`,
      ),
    ).toMatchObject({ ok: false, error: { code: "unknown_header" } });
  });

  it("builds a bounded safe report from non-matched preview rows", () => {
    const row = {
      rowNumber: 2,
      scryfallId: null,
      oracleId: null,
      name: "@bad",
      setCode: "TST",
      collectorNumber: "7",
      language: "en",
      finish: "nonfoil",
      condition: "near_mint",
      quantity: 1,
      strategy: "set_collector_language",
      errorCode: "printing_not_found",
      errorMessage: "=not found",
      status: "rejected",
      included: false,
      proposedPrintingId: null,
      proposedPrinting: null,
      candidates: [],
      suggestion: "+Try another set",
    } satisfies InventoryImportPreviewRow;

    const csv = serializeImportErrorReport([row]);
    expect(csv).toContain("'=not found");
    expect(csv).toContain("'@bad");
    expect(csv).toContain("'+Try another set");
  });
});
