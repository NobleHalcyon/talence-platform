import { describe, expect, it } from "vitest";

import {
  MAX_DECK_IMPORT_BYTES,
  MAX_DECK_IMPORT_LINES,
  normalizeDeckImportName,
  parseDeckTextImport,
} from "@/features/decks/text-import";

describe("bounded deck text import", () => {
  it("parses headers, export suffixes, prefixes, comments, and merged normalized names", () => {
    const result = parseDeckTextImport(
      [
        "# Private deck export",
        "[commander]",
        "1 Delver of Secrets // Insectile Aberration",
        "",
        "[mainboard]",
        "2 Lightning   Bolt",
        "1x Ｌｉｇｈｔｎｉｎｇ　Ｂｏｌｔ",
        "SB: 2 Black Lotus",
        "1 Black Lotus [maybeboard]",
      ].join("\r\n"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      expect.objectContaining({
        quantity: 1,
        zone: "commander",
        normalizedName: "delver of secrets // insectile aberration",
      }),
      expect.objectContaining({
        quantity: 3,
        zone: "mainboard",
        name: "Lightning Bolt",
        normalizedName: "lightning bolt",
      }),
      expect.objectContaining({
        quantity: 2,
        zone: "sideboard",
        normalizedName: "black lotus",
      }),
      expect.objectContaining({
        quantity: 1,
        zone: "maybeboard",
        normalizedName: "black lotus",
      }),
    ]);
  });

  it("does not count the conventional final newline as an extra physical line", () => {
    const source = `${Array.from(
      { length: MAX_DECK_IMPORT_LINES },
      (_, index) => `1 Card ${index + 1}`,
    ).join("\n")}\n`;
    const result = parseDeckTextImport(source);

    expect(result.ok).toBe(true);
    expect(result.physicalLineCount).toBe(MAX_DECK_IMPORT_LINES);
    if (result.ok) expect(result.lines).toHaveLength(MAX_DECK_IMPORT_LINES);
  });

  it("rejects the first line and byte beyond each bound while accepting the byte limit", () => {
    const tooManyLines = parseDeckTextImport(
      Array.from({ length: MAX_DECK_IMPORT_LINES + 1 }, (_, index) => `1 C${index}`).join("\n"),
    );
    expect(tooManyLines.ok).toBe(false);
    if (!tooManyLines.ok) {
      expect(tooManyLines.errors.map((error) => error.code)).toContain("too_many_lines");
    }

    const prefix = "1 Black Lotus\n#";
    const exactlyBounded = `${prefix}${"x".repeat(MAX_DECK_IMPORT_BYTES - prefix.length)}`;
    expect(new TextEncoder().encode(exactlyBounded)).toHaveLength(MAX_DECK_IMPORT_BYTES);
    expect(parseDeckTextImport(exactlyBounded).ok).toBe(true);

    const tooLarge = parseDeckTextImport(`${exactlyBounded}x`);
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) {
      expect(tooLarge.errors.map((error) => error.code)).toContain("too_large");
    }
  });

  it("rejects malformed lines, control characters, invalid quantities, and merged overflow", () => {
    const malformed = parseDeckTextImport(
      ["Lightning Bolt", "0 Black Lotus", "600 Bolt", "500 Bolt", "1 Bad\u0000Name"].join("\n"),
    );

    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.errors.map((error) => error.code)).toContain("invalid_control_character");
    }

    const overflow = parseDeckTextImport("600 Lightning Bolt\n500 lightning bolt");
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.errors.map((error) => error.code)).toContain("quantity_overflow");
    }
  });

  it("uses stable Unicode normalization without fuzzy matching", () => {
    expect(normalizeDeckImportName("  Ｂｌａｃｋ　Lotus  ")).toBe("black lotus");
    expect(normalizeDeckImportName("Black Lotu")).not.toBe("black lotus");
  });
});
