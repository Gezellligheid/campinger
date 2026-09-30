import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Campsite } from "@/lib/types";
import { amenityMeta, formatPriceBand } from "@/lib/display";
import RatingStars from "./RatingStars";

export default function CampsiteCard({
  campsite,
  variant = "grid",
  active = false,
  onHover,
}: {
  campsite: Campsite;
  variant?: "grid" | "row";
  active?: boolean;
  onHover?: (id: string | null) => void;
}) {
  const isRow = variant === "row";

  return (
    <Link
      href={`/campsite/${campsite.slug}`}
      onMouseEnter={() => onHover?.(campsite.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group block overflow-hidden rounded-2xl bg-white ring-1 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-forest-900/10 ${
        active ? "ring-2 ring-terracotta-500" : "ring-forest-900/8"
      } ${isRow ? "flex flex-col sm:flex-row" : "flex flex-col"}`}
    >
      <div
        className={`relative overflow-hidden ${
          isRow ? "h-44 sm:h-auto sm:w-64 sm:shrink-0" : "h-48 w-full"
        }`}
      >
        <Image
          src={campsite.heroImage}
          alt={campsite.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes={isRow ? "256px" : "(min-width: 1024px) 320px, 100vw"}
        />
        {!campsite.hasLivePricing && (
          <span className="absolute left-3 top-3 rounded-full bg-forest-900/80 px-2.5 py-1 text-[11px] font-semibold text-sand-50">
            Estimate only
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-snug text-ink-900">
            {campsite.name}
          </h3>
          <RatingStars rating={campsite.rating} />
        </div>

        <div className="flex items-center gap-1 text-sm text-ink-500">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {campsite.region}, {campsite.country}
          </span>
        </div>

        <p className="line-clamp-2 text-sm text-ink-500">
          {campsite.description}
        </p>

        <div className="mt-1 flex flex-wrap gap-2">
          {campsite.amenities.slice(0, 4).map((a) => {
            const meta = amenityMeta[a];
            const Icon = meta.icon;
            return (
              <span
                key={a}
                title={meta.label}
                className="flex items-center gap-1 rounded-full bg-forest-50 px-2 py-1 text-[11px] font-medium text-forest-700"
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            );
          })}
        </div>

        <div className="mt-auto flex items-end justify-between pt-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-500">
              Estimated / night
            </div>
            <div className="font-display text-lg font-semibold text-forest-700">
              {formatPriceBand(campsite.priceEstimate.low, campsite.priceEstimate.high)}
            </div>
          </div>
          <span className="rounded-full bg-forest-600 px-3 py-1.5 text-xs font-semibold text-sand-50 transition-colors group-hover:bg-forest-700">
            View &amp; book →
          </span>
        </div>
      </div>
    </Link>
  );
}
