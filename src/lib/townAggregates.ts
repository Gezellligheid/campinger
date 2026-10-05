import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { ONLY_SHOW_OSM, type LatLngBounds } from "./campsites";

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

function normalizeTownAggregate(id: string, data: Record<string, unknown>): TownAggregate {
  const totalCount = typeof data.totalCount === "number" ? data.totalCount : 0;
  const scrapedCount = typeof data.scrapedCount === "number" ? data.scrapedCount : 0;
  return {
    id,
    country: (data.country as string) ?? "",
    region: (data.region as string | null) ?? null,
    town: (data.town as string | null) ?? null,
    lat: typeof data.lat === "number" ? data.lat : 0,
    lng: typeof data.lng === "number" ? data.lng : 0,
    totalCount,
    scrapedCount,
    remaining: Math.max(0, totalCount - scrapedCount),
  };
}

/**
 * Town placeholders within a map viewport — see fetchCampsitesInBounds's
 * comment on why this is a latitude-band server-side query plus a
 * longitude client-side filter rather than a true bounding-box query.
 *
 * Every town_aggregates entry today comes from the eurocampings index/focus
 * pipeline — OSM campsites are fetched as complete records directly (see
 * scraper/lib/osm.ts), no "known but not yet scraped" placeholder stage.
 * So while ONLY_SHOW_OSM is on, placeholders are entirely "our own data"
 * too — skip the query and return nothing rather than show a stale/
 * inconsistent placeholder for a catalog that isn't being displayed.
 */
export async function fetchTownAggregatesInBounds(bounds: LatLngBounds): Promise<TownAggregate[]> {
  if (ONLY_SHOW_OSM) return [];

  const q = query(
    collection(db, "town_aggregates"),
    where("lat", ">=", bounds.south),
    where("lat", "<=", bounds.north),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => normalizeTownAggregate(d.id, d.data()))
    .filter((t) => t.remaining > 0 && t.lng >= bounds.west && t.lng <= bounds.east);
}

/** Every town aggregate, no bounds — see fetchCampsites's equivalent note. */
export async function fetchTownAggregates(): Promise<TownAggregate[]> {
  if (ONLY_SHOW_OSM) return [];

  const snap = await getDocs(collection(db, "town_aggregates"));
  return snap.docs
    .map((d) => normalizeTownAggregate(d.id, d.data()))
    .filter((t) => t.remaining > 0 && (t.lat !== 0 || t.lng !== 0));
}
