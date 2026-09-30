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
  adapter: "jsonld";
  /** Free-text note on the ToS/robots.txt review done for this source, per PLAN.md §2. */
  complianceNote: string;
}

export interface SourceAdapter {
  id: string;
  fetchListing(source: SourceConfig): Promise<AdapterResult>;
}
