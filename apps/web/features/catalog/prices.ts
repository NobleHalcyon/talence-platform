import type { PriceObservation } from "@talence/domain";

import type { CatalogPricePair } from "./types";

export const EMPTY_CATALOG_PRICE_PAIR: CatalogPricePair = {
  nonfoil: null,
  foil: null,
};

function lowerAmount(
  current: PriceObservation | null,
  candidate: PriceObservation,
): PriceObservation {
  if (!current) return candidate;
  const currentAmount = Number(current.amount);
  const candidateAmount = Number(candidate.amount);
  if (candidateAmount !== currentAmount) {
    return candidateAmount < currentAmount ? candidate : current;
  }
  return candidate.observedAt > current.observedAt ? candidate : current;
}

export function catalogPricePair(
  prices: PriceObservation[],
  currency?: string | null,
): CatalogPricePair {
  const expectedCurrency = currency?.toUpperCase() ?? null;
  let nonfoil: PriceObservation | null = null;
  let foil: PriceObservation | null = null;

  for (const price of prices) {
    if (expectedCurrency && price.currency !== expectedCurrency) continue;
    if (price.finish === "nonfoil") nonfoil = lowerAmount(nonfoil, price);
    if (price.finish === "foil") foil = lowerAmount(foil, price);
  }

  return { nonfoil, foil };
}
