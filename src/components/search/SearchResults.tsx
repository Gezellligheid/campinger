"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SlidersHorizontal, X } from "lucide-react";
import { fetchCampsites } from "@/lib/campsites";
import { fetchTownAggregates, type TownAggregate } from "@/lib/townAggregates";
import type { Campsite } from "@/lib/types";
import SearchBar from "@/components/SearchBar";
import CampsiteCard from "@/components/CampsiteCard";
import FilterSidebar, { defaultFilters, type Filters } from "./FilterSidebar";
import type { MapBounds } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-forest-100 text-sm text-ink-500">
      Loading map…
    </div>
  ),
});

type SortKey = "price-asc" | "rating-desc" | "popularity-desc";

export default function SearchResults({
  location,
  collection,
}: {
  location: string;
  collection: string;
}) {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sort, setSort] = useState<SortKey>("rating-desc");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [allCampsites, setAllCampsites] = useState<Campsite[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [placeholders, setPlaceholders] = useState<TownAggregate[]>([]);
  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCampsites()
      .then((data) => {
        if (!cancelled) setAllCampsites(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load campsites");
        }
      });
    // Best-effort: placeholder markers are a nice-to-have, not core
    // functionality — a failure here shouldn't affect the rest of the page.
    fetchTownAggregates()
      .then((data) => {
        if (!cancelled) setPlaceholders(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const base = useMemo(() => {
    const source = allCampsites ?? [];
    return collection ? source.filter((c) => c.collections.includes(collection)) : source;
  }, [allCampsites, collection]);

  const filtered = useMemo(() => {
    const loc = location.trim().toLowerCase();

    const results = base.filter((c) => {
      if (
        loc &&
        !`${c.name} ${c.region} ${c.country}`.toLowerCase().includes(loc)
      ) {
        return false;
      }
      if (c.priceEstimate.low > filters.maxPrice) return false;
      if (
        filters.accommodationTypes.length > 0 &&
        !filters.accommodationTypes.some((t) => c.accommodationTypes.includes(t))
      ) {
        return false;
      }
      if (
        filters.amenities.length > 0 &&
        !filters.amenities.every((a) => c.amenities.includes(a))
      ) {
        return false;
      }
      if (
        filters.settings.length > 0 &&
        !filters.settings.some((s) => c.setting.includes(s))
      ) {
        return false;
      }
      if (filters.liveOnly && !c.hasLivePricing) return false;
      return true;
    });

    const sorted = [...results].sort((a, b) => {
      if (sort === "price-asc") return a.priceEstimate.low - b.priceEstimate.low;
      if (sort === "rating-desc") return b.rating - a.rating;
      return b.reviewCount - a.reviewCount;
    });

    return sorted;
  }, [base, location, filters, sort]);

  // "Search as I move the map": once the map reports a viewport, the list
  // only shows campsites currently on screen — panning/zooming the map
  // updates the list, matching the Airbnb/Zillow pattern. Falls back to
  // the full filtered list before the map has reported its first viewport
  // (e.g. still loading) so the list isn't empty on initial paint.
  const inViewport = useMemo(() => {
    if (!viewportBounds) return filtered;
    const { west, south, east, north } = viewportBounds;
    return filtered.filter((c) => c.lng >= west && c.lng <= east && c.lat >= south && c.lat <= north);
  }, [filtered, viewportBounds]);

  const filteredPlaceholders = useMemo(() => {
    const loc = location.trim().toLowerCase();
    if (!loc) return placeholders;
    return placeholders.filter((p) =>
      `${p.town ?? ""} ${p.region ?? ""} ${p.country}`.toLowerCase().includes(loc),
    );
  }, [placeholders, location]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-forest-900/10 bg-white/70 px-4 py-4 sm:px-6 lg:px-8">
        <SearchBar variant="compact" />
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-forest-900/10 bg-sand-50 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="flex items-center gap-2 rounded-full border border-forest-900/15 px-3 py-1.5 text-sm font-medium text-ink-700 lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>

        <div className="hidden text-sm text-ink-500 lg:block">
          {fetchError
            ? "Couldn't load campsites"
            : allCampsites === null
              ? "Loading campsites…"
              : `${inViewport.length} campsite${inViewport.length === 1 ? "" : "s"} in this area`}
          {!fetchError && allCampsites !== null && location && (
            <>
              {" "}
              near <span className="font-semibold text-ink-900">{location}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-full border border-forest-900/15 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className={`px-3 py-1.5 text-sm font-medium ${
                mobileView === "list" ? "bg-forest-600 text-sand-50" : "text-ink-700"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setMobileView("map")}
              className={`px-3 py-1.5 text-sm font-medium ${
                mobileView === "map" ? "bg-forest-600 text-sand-50" : "text-ink-700"
              }`}
            >
              Map
            </button>
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-forest-900/15 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 focus:outline-none"
          >
            <option value="rating-desc">Top rated</option>
            <option value="price-asc">Price: low to high</option>
            <option value="popularity-desc">Most reviewed</option>
          </select>
        </div>
      </div>

      <div className="grid flex-1 lg:grid-cols-[280px_1fr_1fr]">
        <aside className="hidden border-r border-forest-900/10 bg-white/60 p-5 lg:block">
          <FilterSidebar filters={filters} onChange={setFilters} resultCount={filtered.length} />
        </aside>

        <div
          className={`overflow-y-auto p-4 sm:p-6 ${
            mobileView === "map" ? "hidden lg:block" : ""
          }`}
        >
          {fetchError ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-white text-center ring-1 ring-forest-900/5">
              <p className="font-display text-lg font-semibold text-ink-900">
                Couldn&apos;t load campsites
              </p>
              <p className="mt-1 max-w-xs text-sm text-ink-500">{fetchError}</p>
            </div>
          ) : allCampsites === null ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-white text-center ring-1 ring-forest-900/5">
              <p className="text-sm text-ink-500">Loading campsites…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-white text-center ring-1 ring-forest-900/5">
              <p className="font-display text-lg font-semibold text-ink-900">
                {allCampsites.length === 0 ? "No campsites yet" : "No campsites match yet"}
              </p>
              <p className="mt-1 max-w-xs text-sm text-ink-500">
                {allCampsites.length === 0
                  ? "Check back soon — we're still building out the catalog."
                  : "Try widening your price range or clearing a filter."}
              </p>
            </div>
          ) : inViewport.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-white text-center ring-1 ring-forest-900/5">
              <p className="font-display text-lg font-semibold text-ink-900">
                No campsites in this area
              </p>
              <p className="mt-1 max-w-xs text-sm text-ink-500">
                Pan or zoom out on the map to see more — {filtered.length} match your filters
                elsewhere.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {inViewport.map((c) => (
                <CampsiteCard
                  key={c.id}
                  campsite={c}
                  active={hoveredId === c.id}
                  onHover={setHoveredId}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={`p-4 sm:p-6 lg:sticky lg:top-[137px] lg:h-[calc(100vh-137px)] ${
            mobileView === "list" ? "hidden lg:block" : ""
          }`}
        >
          <div className="h-[60vh] lg:h-full">
            <MapView
              campsites={filtered}
              placeholders={filteredPlaceholders}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onBoundsChange={setViewportBounds}
            />
          </div>
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-forest-900/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative ml-auto flex h-full w-full max-w-sm flex-col overflow-y-auto bg-sand-50 p-5 shadow-xl">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mb-4 ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white"
            >
              <X className="h-4 w-4" />
            </button>
            <FilterSidebar filters={filters} onChange={setFilters} resultCount={filtered.length} />
          </div>
        </div>
      )}
    </div>
  );
}
