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

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
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

const AMENITY_KEYWORDS: [RegExp, Amenity][] = [
  [/pool|swim/i, "pool"],
  [/wi-?fi|internet/i, "wifi"],
  [/pet|dog/i, "pets"],
  [/electric|hook-?up/i, "electricity"],
  [/shower|toilet|sanitary/i, "showers"],
  [/playground|kids|children/i, "playground"],
  [/restaurant|snack|bar|shop/i, "restaurant"],
  [/accessible|wheelchair|disab/i, "accessible"],
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

  // Some sites only publish a coarse priceRange (e.g. "€€" or "20-40 EUR") — skip,
  // it's not a usable numeric snapshot.
  return snapshots;
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

  return {
    name,
    slug: slugify(name),
    sourceUrl,
    bookingUrl,
    country: str(address["addressCountry"]),
    region: str(address["addressRegion"]) ?? str(address["addressLocality"]),
    lat: num(geo["latitude"]),
    lng: num(geo["longitude"]),
    description: str(node["description"]),
    heroImage: typeof image === "string" ? image : null,
    gallery: Array.isArray(node["image"])
      ? (node["image"] as unknown[]).filter((v): v is string => typeof v === "string")
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
    ...derivePriceEstimate(priceSnapshots),
  };
}
