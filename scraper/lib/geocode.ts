import { USER_AGENT } from "./politeFetch";

// eurocampings.nl URL country segments are Dutch slugs (matches the site's
// language) — translate the ones we might plausibly focus on to an actual
// country name for the geocoding query. Extend as new countries get added
// to focusedCountries in sources.config.ts.
const COUNTRY_SLUG_NAMES: Record<string, string> = {
  frankrijk: "France",
  duitsland: "Germany",
  nederland: "Netherlands",
  italie: "Italy",
  "verenigd-koninkrijk": "United Kingdom",
  spanje: "Spain",
  zweden: "Sweden",
  denemarken: "Denmark",
  oostenrijk: "Austria",
  noorwegen: "Norway",
  zwitserland: "Switzerland",
  kroatie: "Croatia",
  belgie: "Belgium",
  polen: "Poland",
  finland: "Finland",
  griekenland: "Greece",
  hongarije: "Hungary",
  tsjechie: "Czechia",
  portugal: "Portugal",
  slovenie: "Slovenia",
  ierland: "Ireland",
  roemenie: "Romania",
  luxemburg: "Luxembourg",
  litouwen: "Lithuania",
  letland: "Latvia",
  estland: "Estonia",
  montenegro: "Montenegro",
  slowakije: "Slovakia",
  albanie: "Albania",
  "bosnie-herzegovina": "Bosnia and Herzegovina",
  andorra: "Andorra",
  liechtenstein: "Liechtenstein",
};

export function countryDisplayName(slug: string): string {
  return COUNTRY_SLUG_NAMES[slug] ?? slug;
}

// Nominatim's usage policy caps public API use at 1 request/second.
const MIN_DELAY_MS = 1100;
let lastRequestAt = 0;

async function waitForTurn(): Promise<void> {
  const wait = lastRequestAt + MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Nominatim (OSM) geocoding, per infrastructure.md §2's planned geocoder.
 * Rate-limited to Nominatim's usage-policy max of 1 req/sec, with the same
 * honest User-Agent the scraper uses elsewhere. Only ever used to place a
 * TOWN-level *approximate* marker for campsites we haven't visited/scraped
 * yet — never presented as an exact campsite location (real scraped
 * campsites get their own precise geo from the page's own JSON-LD).
 */
export async function geocodeTown(
  country: string,
  region: string | null,
  town: string | null,
): Promise<GeocodeResult | null> {
  const parts = [town, region, countryDisplayName(country)]
    .filter((p): p is string => Boolean(p))
    .map((p) => p.replace(/-/g, " "));
  if (parts.length === 0) return null;
  const query = parts.join(", ");

  await waitForTurn();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const results = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const first = results[0];
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng, displayName: first.display_name };
}
