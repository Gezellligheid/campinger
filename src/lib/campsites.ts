import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Campsite } from "./types";

const COLLECTION = "campsites";

/**
 * Trial mode: show only OpenStreetMap-sourced campsites (dataSource "osm")
 * on the site, hiding the existing eurocampings-scraped catalog — not
 * deleted, just not displayed, while OSM is evaluated as a lower-risk
 * alternative data source (see scraper/lib/osm.ts). Flip back to false once
 * a decision is made.
 */
export const ONLY_SHOW_OSM = true;

/**
 * Firestore docs come from an external scraper pipeline we don't control the
 * exact shape of — every field is defensively defaulted so a partially
 * populated or differently-shaped doc still renders instead of crashing the
 * page.
 */
function normalizeCampsite(id: string, data: DocumentData): Campsite {
  const heroImage: string = data.heroImage ?? data.gallery?.[0] ?? "";
  return {
    id,
    slug: data.slug ?? id,
    name: data.name ?? "Unnamed campsite",
    country: data.country ?? "",
    region: data.region ?? "",
    lat: data.lat ?? data.location?.lat ?? 0,
    lng: data.lng ?? data.location?.lng ?? 0,
    heroImage,
    gallery: Array.isArray(data.gallery) && data.gallery.length ? data.gallery : [heroImage].filter(Boolean),
    description: data.description ?? "",
    rating: typeof data.rating === "number" ? data.rating : 0,
    reviewCount: typeof data.reviewCount === "number" ? data.reviewCount : 0,
    accommodationTypes: Array.isArray(data.accommodationTypes) ? data.accommodationTypes : [],
    amenities: Array.isArray(data.amenities) ? data.amenities : [],
    setting: Array.isArray(data.setting) ? data.setting : [],
    priceEstimate: data.priceEstimate ?? { low: 0, high: 0, currency: "EUR" },
    hasLivePricing: Boolean(data.hasLivePricing),
    sourceUrl: data.sourceUrl ?? "",
    bookingUrl: data.bookingUrl ?? data.sourceUrl ?? "",
    lastScrapedAt: data.lastScrapedAt ?? "",
    collections: Array.isArray(data.collections) ? data.collections : [],
  };
}

export interface LatLngBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Campsites within a map viewport, not the whole collection. Firestore
 * can't range-filter two different fields (lat AND lng) in one query — only
 * a single field's range is allowed without a geo-indexing scheme (e.g.
 * geohashing), which is more machinery than this needs right now. So this
 * queries the latitude band server-side (cheap: single-field range queries
 * don't need a manual composite index) and filters longitude client-side on
 * that already-small result. A viewport spanning the full lat range of a
 * continent still over-fetches somewhat, but it's nowhere near "every
 * campsite on the site" — see fetchCampsites() below for why that mattered.
 *
 * Deliberately no `limit()` here: a range query with no explicit `orderBy`
 * is implicitly sorted by the range field (lat) ascending, so a limit
 * applied before the longitude filter keeps only the lowest-latitude
 * matches across the *entire* band (every longitude, not just this
 * viewport's) — tried once, it visibly cut off everything but a sliver
 * along the south edge of the map once the catalog grew past a few
 * thousand campsites. If read volume needs bounding again, do it after
 * the longitude filter, not as a query-level limit.
 */
export async function fetchCampsitesInBounds(bounds: LatLngBounds): Promise<Campsite[]> {
  const q = query(
    collection(db, COLLECTION),
    where("lat", ">=", bounds.south),
    where("lat", "<=", bounds.north),
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => !ONLY_SHOW_OSM || d.data().dataSource === "osm")
    .map((d) => normalizeCampsite(d.id, d.data()))
    .filter((c) => c.lng >= bounds.west && c.lng <= bounds.east);
}

/**
 * Every campsite, no bounds — only for callers that genuinely need the
 * whole catalog (e.g. a sitemap or an admin view). Prefer
 * fetchCampsitesInBounds for anything rendering a map/list: fetching the
 * full collection on every page view is what blew through Firestore's free
 * daily read quota in the first place (every visitor re-reading every
 * campsite, regardless of what's actually on screen).
 */
export async function fetchCampsites(): Promise<Campsite[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs
    .filter((d) => !ONLY_SHOW_OSM || d.data().dataSource === "osm")
    .map((d) => normalizeCampsite(d.id, d.data()));
}

export async function fetchCampsiteBySlug(slug: string): Promise<Campsite | null> {
  // Try doc-id-as-slug first (cheap, common convention), then fall back to
  // querying a `slug` field in case the scraper uses auto-generated ids.
  const directSnap = await getDoc(doc(db, COLLECTION, slug));
  if (directSnap.exists()) {
    return normalizeCampsite(directSnap.id, directSnap.data());
  }

  const q = query(collection(db, COLLECTION), where("slug", "==", slug));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const found = snap.docs[0];
  return normalizeCampsite(found.id, found.data());
}
