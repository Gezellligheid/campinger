import {
  Waves,
  Wifi,
  Dog,
  Zap,
  ShowerHead,
  Baby,
  UtensilsCrossed,
  Accessibility,
  Tent,
  Caravan,
  Home,
  Warehouse,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import type { AccommodationType, Amenity, Setting } from "./types";

export const amenityMeta: Record<Amenity, { label: string; icon: LucideIcon }> = {
  pool: { label: "Pool", icon: Waves },
  wifi: { label: "Wifi", icon: Wifi },
  pets: { label: "Dog-friendly", icon: Dog },
  electricity: { label: "Electricity hookup", icon: Zap },
  showers: { label: "Showers & toilets", icon: ShowerHead },
  playground: { label: "Playground", icon: Baby },
  restaurant: { label: "Restaurant / shop", icon: UtensilsCrossed },
  accessible: { label: "Accessible facilities", icon: Accessibility },
};

export const accommodationMeta: Record<
  AccommodationType,
  { label: string; icon: LucideIcon }
> = {
  tent: { label: "Tent pitch", icon: Tent },
  caravan: { label: "Caravan / RV pitch", icon: Caravan },
  "mobile-home": { label: "Mobile home", icon: Warehouse },
  cabin: { label: "Cabin / chalet", icon: Home },
  glamping: { label: "Glamping", icon: TreePine },
};

export const settingLabel: Record<Setting, string> = {
  coastal: "Coastal",
  forest: "Forest",
  countryside: "Countryside",
  "near-city": "Near city",
  lakeside: "Lakeside",
};

export function formatPriceBand(low: number, high: number): string {
  return `€${low}–€${high}`;
}
