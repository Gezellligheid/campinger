import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

/**
 * A town-level placeholder for campsites the scraper knows exist (from a
 * sitemap) but hasn't visited/scraped full details for yet. `remaining` is
 * how many are still placeholder-only — as focused-country runs scrape
 * them, `scrapedCount` rises and `remaining` shrinks toward 0, at which
 * point the town aggregate stops contributing any placeholder marker and
 * every one of its campsites has its own real pin instead.
 */
export interface TownAggregate {
  id: string;
  country: string;
  region: string | null;
  town: string | null;
  lat: number;
  lng: number;
  totalCount: number;
  scrapedCount: number;
  remaining: number;
}

export async function fetchTownAggregates(): Promise<TownAggregate[]> {
  const snap = await getDocs(collection(db, "town_aggregates"));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const totalCount = typeof data.totalCount === "number" ? data.totalCount : 0;
      const scrapedCount = typeof data.scrapedCount === "number" ? data.scrapedCount : 0;
      return {
        id: d.id,
        country: data.country ?? "",
        region: data.region ?? null,
        town: data.town ?? null,
        lat: typeof data.lat === "number" ? data.lat : 0,
        lng: typeof data.lng === "number" ? data.lng : 0,
        totalCount,
        scrapedCount,
        remaining: Math.max(0, totalCount - scrapedCount),
      };
    })
    .filter((t) => t.remaining > 0 && (t.lat !== 0 || t.lng !== 0));
}
