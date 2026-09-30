"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Campsite } from "@/lib/types";
import { formatPriceBand } from "@/lib/display";

export default function BookingPanel({ campsite }: { campsite: Campsite }) {
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [guests, setGuests] = useState(2);

  const nights = useMemo(() => {
    if (!checkin || !checkout) return 0;
    const inD = new Date(checkin);
    const outD = new Date(checkout);
    const diff = Math.round((outD.getTime() - inD.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [checkin, checkout]);

  const goHref = useMemo(() => {
    const params = new URLSearchParams();
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    if (guests) params.set("guests", String(guests));
    const qs = params.toString();
    return `/go/${campsite.id}${qs ? `?${qs}` : ""}`;
  }, [campsite.id, checkin, checkout, guests]);

  const hasPrice = campsite.priceEstimate.low > 0 || campsite.priceEstimate.high > 0;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest-900/8">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-wide text-ink-500">
            {hasPrice
              ? campsite.hasLivePricing
                ? "Estimated / night"
                : "From (estimate only)"
              : "Price"}
          </span>
          <div className="font-display text-2xl font-semibold text-forest-700">
            {hasPrice
              ? formatPriceBand(campsite.priceEstimate.low, campsite.priceEstimate.high)
              : "Check on site"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="flex flex-col rounded-xl border border-forest-900/15 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Arrival
          </span>
          <input
            type="date"
            value={checkin}
            onChange={(e) => setCheckin(e.target.value)}
            className="bg-transparent text-sm text-ink-900 focus:outline-none"
          />
        </label>
        <label className="flex flex-col rounded-xl border border-forest-900/15 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Departure
          </span>
          <input
            type="date"
            value={checkout}
            onChange={(e) => setCheckout(e.target.value)}
            className="bg-transparent text-sm text-ink-900 focus:outline-none"
          />
        </label>
        <label className="col-span-2 flex flex-col rounded-xl border border-forest-900/15 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Guests
          </span>
          <input
            type="number"
            min={1}
            max={12}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="bg-transparent text-sm text-ink-900 focus:outline-none"
          />
        </label>
      </div>

      {hasPrice && nights > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-forest-900/10 pt-3 text-sm">
          <span className="text-ink-500">
            {formatPriceBand(campsite.priceEstimate.low, campsite.priceEstimate.high)} ×{" "}
            {nights} night{nights === 1 ? "" : "s"}
          </span>
          <span className="font-semibold text-ink-900">
            €{campsite.priceEstimate.low * nights}–€{campsite.priceEstimate.high * nights}
          </span>
        </div>
      )}

      <a
        href={goHref}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-600"
      >
        Book on {campsite.name} <ExternalLink className="h-4 w-4" />
      </a>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-500">
        Estimated price — confirm the final total and availability on the
        operator&apos;s own site before booking.
      </p>
    </div>
  );
}
