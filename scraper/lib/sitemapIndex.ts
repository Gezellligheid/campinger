/**
 * One discovered-but-not-necessarily-scraped-yet campsite URL, tagged with
 * enough location info to decide *when* to actually visit it. Cheap to
 * produce in bulk (one sitemap fetch) — the expensive part (visiting the
 * page, extracting JSON-LD) happens later, only for countries in focus.
 */
export interface SitemapIndexEntry {
  url: string;
  country: string;
  region: string | null;
  town: string | null;
}

/**
 * Parse a eurocampings.nl-style detail URL:
 * https://www.eurocampings.nl/<country>/<region>/<town>/<slug>/
 * Other sitemap sources would need their own parser if/when added — this
 * one is deliberately specific rather than a guessed-at generic shape.
 */
export function parseEurocampingsEntry(url: string): SitemapIndexEntry | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 4) return null;
  const [country, region, town] = segments;
  return { url, country, region: region ?? null, town: town ?? null };
}
