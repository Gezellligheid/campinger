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

export async function fetchCampsites(): Promise<Campsite[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => normalizeCampsite(d.id, d.data()));
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
