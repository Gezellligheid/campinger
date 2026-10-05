import type { Amenity } from "../../src/lib/types";
import type { ScrapedCampsite } from "../types";
import { slugify } from "./normalize";
import { USER_AGENT } from "./politeFetch";

/**
 * OpenStreetMap as a campsite data source, via the public Overpass API.
 *
 * Why: eurocampings.nl is a third-party directory scraped under real
 * uncertainty (no confirmed legal review of its database right — see
 * sources.config.ts's header comment) for data that isn't ours. OSM data is
 * ODbL-licensed specifically *for* reuse like this: one Overpass query
 * returns every tagged campsite in a whole country at once (no per-page
 * crawling, no robots.txt dance, no rate-limited politeFetch loop — this
 * isn't a web scrape at all, it's a documented public API). The tradeoff is
 * depth: OSM has no price/review data and amenity tagging coverage varies
 * by contributor, so records here are sparser than a eurocampings page.
 *
 * ODbL requires attribution wherever this data is shown — the map's
 * attribution control (MapView.tsx) already credits OpenStreetMap for the
 * base tiles, which covers this too since it's the same source.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Every tagged `tourism=camp_site` in one country (`countryCode` is an
 * ISO 3166-1 alpha-2 code, e.g. "FR", "BE" — matches OSM's own
 * `ISO3166-1` area tag). `out center tags` gets ways/relations a
 * representative point (their bounding-geometry centroid) alongside plain
 * node coordinates, so every element type yields one lat/lng pair.
 */
// The shared public Overpass instance intermittently 504s under load
// (observed in testing) with no fault of the query itself — one retry
// after a short pause clears it in practice, and this runs unattended in
// CI so it shouldn't give up on the first transient blip.
async function fetchOverpass(query: string, attempt = 1): Promise<Response> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": USER_AGENT,
    },
    body: query,
  });
  if (!res.ok && attempt === 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return fetchOverpass(query, attempt + 1);
  }
  return res;
}

export async function fetchOsmCampsites(countryCode: string): Promise<OverpassElement[]> {
  const query = `
    [out:json][timeout:60];
    area["ISO3166-1"="${countryCode}"][admin_level=2]->.searchArea;
    (
      node["tourism"="camp_site"](area.searchArea);
      way["tourism"="camp_site"](area.searchArea);
      relation["tourism"="camp_site"](area.searchArea);
    );
    out center tags;
  `;

  const res = await fetchOverpass(query);
  if (!res.ok) {
    throw new Error(`Overpass API error fetching ${countryCode}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as OverpassResponse;
  return data.elements ?? [];
}

function str(tags: Record<string, string>, key: string): string | null {
  const v = tags[key];
  return v && v.trim() ? v.trim() : null;
}

function truthy(tags: Record<string, string>, key: string): boolean {
  const v = tags[key];
  return v === "yes" || v === "leashed" || v === "limited";
}

// OSM tagging is inconsistent in practice (different contributors use
// different keys for the "same" amenity) — check every plausible key per
// amenity rather than assuming one canonical tag.
function mapAmenities(tags: Record<string, string>): Amenity[] {
  const found = new Set<Amenity>();
  if (truthy(tags, "swimming_pool") || tags["leisure"] === "swimming_pool") found.add("pool");
  if (tags["internet_access"] && tags["internet_access"] !== "no") found.add("wifi");
  if (truthy(tags, "dog")) found.add("pets");
  if (truthy(tags, "electricity") || truthy(tags, "power_supply")) found.add("electricity");
  if (truthy(tags, "shower") || truthy(tags, "toilets")) found.add("showers");
  if (truthy(tags, "playground")) found.add("playground");
  if (tags["shop"] || tags["amenity"] === "restaurant" || tags["amenity"] === "bar")
    found.add("restaurant");
  if (tags["wheelchair"] === "yes") found.add("accessible");
  return [...found];
}

/**
 * Map one Overpass element into our normalized shape. `countryLabel` comes
 * from our own config (the country we queried for), not from OSM's own
 * `addr:country` tag — far more reliable than trusting free-text/variable
 * country tagging across thousands of independently-edited elements.
 */
export function normalizeOsmElement(
  element: OverpassElement,
  countryLabel: string,
): ScrapedCampsite | null {
  const tags = element.tags ?? {};
  const name = str(tags, "name");
  if (!name) return null; // unusable without a name

  const lat = element.lat ?? element.center?.lat ?? null;
  const lng = element.lon ?? element.center?.lon ?? null;

  const osmUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const website = str(tags, "website") ?? str(tags, "contact:website");

  return {
    name,
    slug: `${slugify(name)}-osm-${element.id}`,
    sourceUrl: osmUrl,
    bookingUrl: website ?? osmUrl,
    country: countryLabel,
    region: str(tags, "addr:state") ?? str(tags, "addr:region") ?? str(tags, "addr:city"),
    lat,
    lng,
    description: str(tags, "description"),
    heroImage: null,
    gallery: [],
    accommodationTypes: [],
    amenities: mapAmenities(tags),
    setting: [],
    rating: null,
    reviewCount: null,
    priceSnapshots: [],
    dataSource: "osm",
    lastScrapedAt: new Date().toISOString(),
    priceEstimate: null, // OSM has no price data at all — not even a free-text field to parse
    hasLivePricing: false,
  };
}
