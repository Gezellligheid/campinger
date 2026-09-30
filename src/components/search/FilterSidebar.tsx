"use client";

import { SlidersHorizontal, X } from "lucide-react";
import type { AccommodationType, Amenity, Setting } from "@/lib/types";
import { accommodationMeta, amenityMeta, settingLabel } from "@/lib/display";

export interface Filters {
  maxPrice: number;
  accommodationTypes: AccommodationType[];
  amenities: Amenity[];
  settings: Setting[];
  liveOnly: boolean;
}

export const defaultFilters: Filters = {
  maxPrice: 70,
  accommodationTypes: [],
  amenities: [],
  settings: [],
  liveOnly: false,
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function FilterSidebar({
  filters,
  onChange,
  resultCount,
  className = "",
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  resultCount: number;
  className?: string;
}) {
  const hasActiveFilters =
    filters.maxPrice < 70 ||
    filters.accommodationTypes.length > 0 ||
    filters.amenities.length > 0 ||
    filters.settings.length > 0 ||
    filters.liveOnly;

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => onChange(defaultFilters)}
            className="flex items-center gap-1 text-xs font-semibold text-terracotta-600 hover:text-terracotta-700"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-ink-900">
          <span>Max price / night</span>
          <span className="text-forest-600">€{filters.maxPrice}</span>
        </div>
        <input
          type="range"
          min={10}
          max={70}
          step={5}
          value={filters.maxPrice}
          onChange={(e) => onChange({ ...filters, maxPrice: Number(e.target.value) })}
          className="w-full accent-forest-600"
        />
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-ink-900">Accommodation</div>
        <div className="flex flex-col gap-2">
          {(Object.keys(accommodationMeta) as AccommodationType[]).map((type) => {
            const meta = accommodationMeta[type];
            const Icon = meta.icon;
            const checked = filters.accommodationTypes.includes(type);
            return (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      ...filters,
                      accommodationTypes: toggle(filters.accommodationTypes, type),
                    })
                  }
                  className="h-4 w-4 rounded accent-forest-600"
                />
                <Icon className="h-4 w-4 text-ink-500" />
                {meta.label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-ink-900">Amenities</div>
        <div className="flex flex-col gap-2">
          {(Object.keys(amenityMeta) as Amenity[]).map((amenity) => {
            const meta = amenityMeta[amenity];
            const Icon = meta.icon;
            const checked = filters.amenities.includes(amenity);
            return (
              <label
                key={amenity}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({ ...filters, amenities: toggle(filters.amenities, amenity) })
                  }
                  className="h-4 w-4 rounded accent-forest-600"
                />
                <Icon className="h-4 w-4 text-ink-500" />
                {meta.label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-ink-900">Setting</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(settingLabel) as Setting[]).map((setting) => {
            const active = filters.settings.includes(setting);
            return (
              <button
                key={setting}
                type="button"
                onClick={() => onChange({ ...filters, settings: toggle(filters.settings, setting) })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-forest-600 text-sand-50"
                    : "bg-forest-50 text-forest-700 hover:bg-forest-100"
                }`}
              >
                {settingLabel[setting]}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl bg-sand-100 px-3 py-2.5 text-sm font-medium text-ink-900">
        Live pricing only
        <input
          type="checkbox"
          checked={filters.liveOnly}
          onChange={() => onChange({ ...filters, liveOnly: !filters.liveOnly })}
          className="h-4 w-4 rounded accent-forest-600"
        />
      </label>

      <div className="text-xs text-ink-500">
        {resultCount} campsite{resultCount === 1 ? "" : "s"} match
      </div>
    </div>
  );
}
