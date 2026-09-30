import type { PriceSnapshot, ScrapedCampsite } from "../types";

/**
 * Collapse this run's price snapshots into the denormalized band the
 * frontend reads directly off the campsite doc (`ScrapedCampsite.priceEstimate`
 * / `hasLivePricing` — see the comment on that type for why it's stored
 * rather than computed at query time).
 */
export function derivePriceEstimate(
  snapshots: PriceSnapshot[],
): Pick<ScrapedCampsite, "priceEstimate" | "hasLivePricing"> {
  if (snapshots.length === 0) {
    return { priceEstimate: null, hasLivePricing: false };
  }

  // Snapshots can mix currencies across offers; band on whichever currency
  // has the most observations rather than mixing amounts across currencies.
  const counts = new Map<string, number>();
  for (const s of snapshots) counts.set(s.currency, (counts.get(s.currency) ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const prices = snapshots.filter((s) => s.currency === currency).map((s) => s.price);

  return {
    priceEstimate: { low: Math.min(...prices), high: Math.max(...prices), currency },
    hasLivePricing: true,
  };
}
