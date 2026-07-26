import { describe, expect, it } from "vitest";

import { getPriceState } from "../src/price";

describe("getPriceState", () => {
  it("keeps a missing observation unknown rather than inventing zero", () => {
    expect(getPriceState(null)).toEqual({ kind: "unavailable" });
  });

  it("marks an observation stale only after its policy timestamp", () => {
    const observation = {
      amount: "4.2500",
      currency: "USD",
      finish: "nonfoil",
      provider: "Scryfall",
      observedAt: "2026-07-25T12:00:00Z",
      ingestedAt: "2026-07-25T12:30:00Z",
      staleAfter: "2026-07-26T12:00:00Z",
    };

    expect(getPriceState(observation, new Date("2026-07-26T11:59:59Z"))).toMatchObject({
      kind: "available",
      stale: false,
    });

    expect(getPriceState(observation, new Date("2026-07-26T12:00:00Z"))).toMatchObject({
      kind: "available",
      stale: true,
    });
  });
});
