import type { Amenity } from "../../src/lib/types";
import type { PriceSnapshot, ScrapedCampsite } from "../types";
import { derivePriceEstimate } from "./priceEstimate";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_GALLERY_IMAGES = 6;

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/**
 * schema.org `addressCountry` is valid either as plain Text ("France", "FR")
 * or as a nested Country object ({ "@type": "Country", "name": "France" }) —
 * seen both forms across real sources. `str()` alone silently drops the
 * object form.
 */
// Sources publish country as a 2-letter code (capfun.com: "FR"), a 3-letter
// code (eurocampings.nl ItemList summaries: "BEL"), or a native-language
// name (eurocampings.nl detail pages: "België") instead of an English full
// name — normalize the variants actually seen so far rather than showing
// "FR"/"BEL"/"België" in the UI. Lookup is case-insensitive.
const COUNTRY_NAME_MAP: Record<string, string> = {
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  DE: "Germany",
  NL: "Netherlands",
  BE: "Belgium",
  BEL: "Belgium",
  PT: "Portugal",
  BELGIË: "Belgium",
  BELGIE: "Belgium",
  DEUTSCHLAND: "Germany",
  ESPAÑA: "Spain",
  NEDERLAND: "Netherlands",
};

function countryStr(value: unknown): string | null {
  const direct = str(value);
  if (direct) return COUNTRY_NAME_MAP[direct.toUpperCase()] ?? direct;
  if (value && typeof value === "object") {
    const nested = str((value as Record<string, unknown>)["name"]);
    return nested ? (COUNTRY_NAME_MAP[nested.toUpperCase()] ?? nested) : null;
  }
  return null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function firstOf<T>(value: T | T[] | undefined | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// English and French keywords — several real sources (les-castels.com,
// sandaya.fr, capfun.com) publish amenityFeature names in French.
const AMENITY_KEYWORDS: [RegExp, Amenity][] = [
  [/pool|swim|piscine/i, "pool"],
  [/wi-?fi|internet/i, "wifi"],
  [/pet|dog|anima(l|ux)/i, "pets"],
  [/electric|hook-?up|électri|raccordement/i, "electricity"],
  [/shower|toilet|sanitary|douche|sanitaire/i, "showers"],
  [/playground|aire de jeux/i, "playground"],
  [/restaurant|snack|bar|shop|épicerie/i, "restaurant"],
  [/accessible|wheelchair|disab|accessibilit|handicap|pmr/i, "accessible"],
];

function guessAmenities(node: Record<string, unknown>): Amenity[] {
  const found = new Set<Amenity>();
  const raw = node["amenityFeature"];
  const features = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const f = feature as Record<string, unknown>;
    const name = str(f["name"]);
    const value = f["value"];
    if (!name) continue;
    if (value === false) continue; // explicitly "does not have"
    for (const [pattern, amenity] of AMENITY_KEYWORDS) {
      if (pattern.test(name)) found.add(amenity);
    }
  }
  if (node["petsAllowed"] === true) found.add("pets");
  return [...found];
}

function extractOffers(node: Record<string, unknown>, scrapedAt: string): PriceSnapshot[] {
  const rawOffers = node["makesOffer"] ?? node["offers"];
  const offers = Array.isArray(rawOffers) ? rawOffers : rawOffers ? [rawOffers] : [];
  const snapshots: PriceSnapshot[] = [];

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const priceSpec = (o["priceSpecification"] as Record<string, unknown>) ?? o;
    const price = num(priceSpec["price"] ?? o["price"]);
    const currency = str(priceSpec["priceCurrency"] ?? o["priceCurrency"]);
    if (price === null || !currency) continue;

    snapshots.push({
      accommodationType: null,
      checkinDate: str(o["validFrom"] ?? o["availabilityStarts"]),
      checkoutDate: str(o["validThrough"] ?? o["availabilityEnds"]),
      price,
      currency,
      priceType: "from-price",
      scrapedAt,
    });
  }

  return snapshots;
}

/**
 * Fallback for sites that publish `priceRange` as free text instead of a
 * structured `offers`/`makesOffer`. Handles two real shapes seen so far:
 * a single "from" price ("A partir de 127.20€", "Vanaf €25") and an
 * explicit range ("€20-€40", "20-40 EUR"). Purely qualitative tiers
 * ("€€", "$$") have no digits at all and correctly fall through to null —
 * deliberately NOT guessed at, per PLAN.md's "don't fabricate estimates
 * from unreliable signals" stance.
 */
function parsePriceRangeText(text: string): { low: number; high: number; currency: string } | null {
  const numbers = [...text.matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((m) => Number(m[0].replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return null;

  const currency = /£/.test(text) ? "GBP" : /\$/.test(text) ? "USD" : "EUR";
  return { low: Math.min(...numbers), high: Math.max(...numbers), currency };
}

function extractRating(node: Record<string, unknown>): {
  rating: number | null;
  reviewCount: number | null;
} {
  const agg = node["aggregateRating"];
  if (!agg || typeof agg !== "object") return { rating: null, reviewCount: null };
  const a = agg as Record<string, unknown>;
  return {
    rating: num(a["ratingValue"]),
    reviewCount: num(a["reviewCount"] ?? a["ratingCount"]),
  };
}

/**
 * Map one schema.org LodgingBusiness/Campground node (as found by
 * lib/jsonld.ts) into our normalized ScrapedCampsite shape.
 */
export function normalizeLodgingNode(
  node: Record<string, unknown>,
  sourceUrl: string,
  dataSource: string,
): ScrapedCampsite | null {
  const name = str(node["name"]);
  if (!name) return null; // unusable without a name

  const address = (node["address"] as Record<string, unknown>) ?? {};
  const geo = (node["geo"] as Record<string, unknown>) ?? {};
  const scrapedAt = new Date().toISOString();
  const image = firstOf(node["image"] as string | string[] | undefined);
  const bookingUrl = str(node["url"]) ?? sourceUrl;
  const priceSnapshots = extractOffers(node, scrapedAt);
  const { rating, reviewCount } = extractRating(node);

  // Real structured offers win when present (hasLivePricing: true). With
  // none, fall back to parsing the coarser `priceRange` text field — that's
  // still just a parsed estimate, not a live quote, so hasLivePricing stays
  // false for it even though we now have *a* number to show.
  const derived = derivePriceEstimate(priceSnapshots);
  const priceEstimate = derived.priceEstimate ?? parsePriceRangeText(str(node["priceRange"]) ?? "");
  const hasLivePricing = derived.hasLivePricing;

  return {
    name,
    slug: slugify(name),
    sourceUrl,
    bookingUrl,
    country: countryStr(address["addressCountry"]),
    region: str(address["addressRegion"]) ?? str(address["addressLocality"]),
    lat: num(geo["latitude"]),
    lng: num(geo["longitude"]),
    description: str(node["description"]),
    heroImage: typeof image === "string" ? image : null,
    // The UI only ever shows the first 3 (hero + 2 gallery slots) — some
    // sources (eurocampings.nl) publish 30+ image URLs per listing, which
    // would otherwise bloat every Firestore doc with data nothing reads.
    gallery: Array.isArray(node["image"])
      ? (node["image"] as unknown[])
          .filter((v): v is string => typeof v === "string")
          .slice(0, MAX_GALLERY_IMAGES)
      : image
        ? [image]
        : [],
    accommodationTypes: [],
    amenities: guessAmenities(node),
    setting: [],
    rating,
    reviewCount,
    priceSnapshots,
    dataSource,
    lastScrapedAt: scrapedAt,
    priceEstimate,
    hasLivePricing,
  };
}
