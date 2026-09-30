export type AccommodationType =
  | "tent"
  | "caravan"
  | "mobile-home"
  | "cabin"
  | "glamping";

export type Amenity =
  | "pool"
  | "wifi"
  | "pets"
  | "electricity"
  | "showers"
  | "playground"
  | "restaurant"
  | "accessible";

export type Setting =
  | "coastal"
  | "forest"
  | "countryside"
  | "near-city"
  | "lakeside";

export interface PriceBand {
  low: number;
  high: number;
  currency: "EUR";
}

export interface Campsite {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  heroImage: string;
  gallery: string[];
  description: string;
  rating: number; // 0-5
  reviewCount: number;
  accommodationTypes: AccommodationType[];
  amenities: Amenity[];
  setting: Setting[];
  priceEstimate: PriceBand;
  hasLivePricing: boolean;
  sourceUrl: string;
  bookingUrl: string;
  lastScrapedAt: string;
  collections: string[];
}

export interface Collection {
  slug: string;
  title: string;
  description: string;
  image: string;
}
