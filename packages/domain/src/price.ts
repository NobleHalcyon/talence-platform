export interface PriceObservation {
  amount: string;
  currency: string;
  finish: string;
  provider: string;
  observedAt: string;
  ingestedAt: string;
  staleAfter?: string | null;
}

export type PriceState =
  | { kind: "unavailable" }
  | {
      kind: "available";
      observation: PriceObservation;
      stale: boolean;
    };

function parseInstant(value: string): number | null {
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? null : instant;
}

export function getPriceState(
  observation: PriceObservation | null | undefined,
  now: Date = new Date(),
): PriceState {
  if (!observation) {
    return { kind: "unavailable" };
  }

  const staleAt = observation.staleAfter ? parseInstant(observation.staleAfter) : null;

  return {
    kind: "available",
    observation,
    stale: staleAt !== null && staleAt <= now.getTime(),
  };
}
