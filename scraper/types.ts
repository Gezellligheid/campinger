import type {
  AccommodationType,
  Amenity,
  Setting,
} from "../src/lib/types";

/**
 * One scraped price observation for a campsite, per PLAN.md §4 `price_snapshot`.
 * Kept separate from the derived display-only `priceEstimate` band.
 */
export interface PriceSnapshot {
  accommodationType: AccommodationType | null;
  checkinDate: string | null;
  checkoutDate: string | null;
  price: number;
  currency: string;
  priceType: "per-night" | "per-stay" | "from-price";
  scrapedAt: string;
}

/**
 * Raw normalized output of an adapter, before merging with any existing
 * record. Field names here are deliberately identical to `Campsite` in
 * src/lib/types.ts (see PLAN.md §4 `campsite`) — that type's Firestore
 * reader (src/lib/campsites.ts) defaults any field it doesn't find on the
 * doc rather than erroring, so a name mismatch here fails *silently* as a
 * blank/zeroed field in the UI instead of a build error. Keep the two in
 * sync deliberately; don't rename one side without the other.
 */
export interface ScrapedCampsite {
  name: string;
  slug: string;
  sourceUrl: string;
  bookingUrl: string;
  country: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  heroImage: string | null;
  gallery: string[];
  accommodationTypes: AccommodationType[];
  amenities: Amenity[];
  setting: Setting[];
  rating: number | null;
  reviewCount: number | null;
  /**
   * Denormalized onto the campsite doc (not just derived from
   * `priceSnapshots` at query time) so the search/list views can read it
   * without a subcollection fetch per card — matches infrastructure.md §6's
   * "cache aggressively, protect the Firestore read quota" guidance, and
   * matches what src/lib/campsites.ts already expects on the doc.
   */
  priceEstimate: { low: number; high: number; currency: string } | null;
  hasLivePricing: boolean;
  priceSnapshots: PriceSnapshot[];
  dataSource: string;
  lastScrapedAt: string;
}

export interface AdapterIssue {
  sourceId: string;
  message: string;
}

export interface AdapterResult {
  sourceId: string;
  adapter: string;
  records: ScrapedCampsite[];
  issues: AdapterIssue[];
  fetchedAt: string;
}

/** Per-source-run health entry, feeding PLAN.md §4 `source_adapter`. */
export interface SourceAdapterHealth {
  sourceId: string;
  adapter: string;
  lastRunAt: string;
  success: boolean;
  recordCount: number;
  fieldCompleteness: number; // 0-1, share of key fields populated across records
  errors: string[];
}

export interface SourceConfig {
  id: string;
  label: string;
  url: string;
  /**
   * "jsonld" — one detail page, one campsite (PLAN.md §5 point 2/3).
   * "jsonld-listing" — a directory/search-results page: discover candidate
   * campsite detail-page URLs from its JSON-LD ItemList, then politely
   * fetch and jsonld-extract each one individually (same normalize path as
   * "jsonld", just with a discovery step in front). Many sites only embed
   * a small "featured" ItemList on listing pages, not the full result set.
   * "sitemap" — discover candidate URLs from a sitemap.xml instead, which
   * is *more* complete than an ItemList (sitemaps are published
   * specifically to be crawled — the whole result set, not a snippet of
   * it) and an even cleaner "meant to be machine-read" signal. `url`
   * points at the sitemap XML itself, not a campsite page.
   */
  adapter: "jsonld" | "jsonld-listing" | "sitemap";
  /** Free-text note on the ToS/robots.txt review done for this source, per PLAN.md §2. */
  complianceNote: string;
  /**
   * "jsonld-listing"/"sitemap" only: cap on how many discovered detail
   * pages to visit per run. Keeps one source from silently fetching an
   * unbounded number of pages — politeFetch's per-host delay means a large
   * listing/sitemap would otherwise just make one run take a very long
   * time (or, for a sitemap covering many countries, fetch far more than
   * intended).
   */
  maxItems?: number;
  /**
   * "sitemap" only: restrict to URLs starting with this prefix (e.g. one
   * country's section of a sitemap that covers many countries).
   */
  urlPrefix?: string;
}

/**
 * A sitemap to index (cheap: one fetch, tag every URL with country/region,
 * store it) WITHOUT visiting any of the URLs it lists. Separate from
 * SourceConfig's "sitemap" adapter, which visits every discovered URL
 * immediately — indexing decouples "what exists" from "what we've actually
 * scraped full details for", so a sitemap covering thousands of pages
 * (eurocampings.nl: ~9,700) doesn't force scraping all of them just to see
 * any of them. Consumed by processFocusedCountries in run.ts.
 */
export interface SitemapIndexSource {
  id: string;
  label: string;
  url: string;
  /** Which parser understands this sitemap's URL structure. */
  parser: "eurocampings";
  complianceNote: string;
}

/**
 * A country (matching the path segment SitemapIndexSource's parser
 * extracts, e.g. "belgie") to actively pull full campsite details for, up
 * to maxItems indexed-but-unscraped URLs per run — the "focus" half of the
 * index/focus split. Add a country here once you're ready to build out
 * that region; leave it out and its indexed URLs just sit unscraped.
 */
export interface FocusedCountry {
  country: string;
  label: string;
  maxItems: number;
}

export interface SourceAdapter {
  id: string;
  fetchListing(source: SourceConfig): Promise<AdapterResult>;
}

/**
 * A country to pull full OpenStreetMap campsite data for, via one Overpass
 * API query per run (see scraper/lib/osm.ts) — no index/focus split needed
 * here since a single query already returns real, complete records for the
 * whole country, not just discovered-but-unvisited URLs.
 */
export interface OsmCountry {
  /** ISO 3166-1 alpha-2 code, matching OSM's own `ISO3166-1` area tag. */
  countryCode: string;
  label: string;
}
