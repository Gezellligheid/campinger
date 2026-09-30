"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Clock, ShieldCheck, ImageOff } from "lucide-react";
import RatingStars from "@/components/RatingStars";
import { fetchCampsiteBySlug } from "@/lib/campsites";
import { accommodationMeta, amenityMeta, settingLabel } from "@/lib/display";
import type { Campsite } from "@/lib/types";
import BookingPanel from "./BookingPanel";
import DetailMap from "./DetailMap";

export default function CampsiteDetailClient({ slug }: { slug: string }) {
  const [campsite, setCampsite] = useState<Campsite | null | undefined>(undefined);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCampsiteBySlug(slug)
      .then((result) => {
        if (!cancelled) setCampsite(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load campsite");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (fetchError) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-32 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          Couldn&apos;t load this campsite
        </h1>
        <p className="text-sm text-ink-500">{fetchError}</p>
        <Link href="/search" className="text-sm font-semibold text-forest-600 hover:text-forest-700">
          ← Back to search
        </Link>
      </div>
    );
  }

  if (campsite === undefined) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-32 text-sm text-ink-500">
        Loading campsite…
      </div>
    );
  }

  if (campsite === null) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-32 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          Campsite not found
        </h1>
        <p className="text-sm text-ink-500">
          It may have been removed, or the link is incorrect.
        </p>
        <Link href="/search" className="text-sm font-semibold text-forest-600 hover:text-forest-700">
          ← Back to search
        </Link>
      </div>
    );
  }

  const gallery = campsite.gallery.filter(Boolean);

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <nav className="text-sm text-ink-500">
          <Link href="/search" className="hover:text-forest-600">
            Search
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink-900">{campsite.name}</span>
        </nav>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink-900 sm:text-4xl">
              {campsite.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
              {(campsite.region || campsite.country) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {[campsite.region, campsite.country].filter(Boolean).join(", ")}
                </span>
              )}
              {campsite.rating > 0 && (
                <RatingStars rating={campsite.rating} reviewCount={campsite.reviewCount} size="md" />
              )}
            </div>
          </div>
        </div>

        {gallery.length > 0 ? (
          <div className="mt-6 grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl">
            <div className="relative col-span-4 row-span-2 h-72 sm:col-span-2 sm:row-span-2 sm:h-[420px]">
              <Image
                src={gallery[0]}
                alt={campsite.name}
                fill
                priority
                unoptimized
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
            {gallery.slice(1, 3).map((src, i) => (
              <div key={src} className="relative hidden h-[206px] sm:block sm:col-span-2">
                <Image
                  src={src}
                  alt={`${campsite.name} photo ${i + 2}`}
                  fill
                  unoptimized
                  sizes="25vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 flex h-72 items-center justify-center gap-2 rounded-3xl bg-sand-100 text-ink-300 sm:h-[420px]">
            <ImageOff className="h-5 w-5" />
            <span className="text-sm">No photos yet</span>
          </div>
        )}
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="lg:col-span-2">
          {campsite.description && (
            <section>
              <h2 className="font-display text-xl font-semibold text-ink-900">
                About this campsite
              </h2>
              <p className="mt-3 leading-relaxed text-ink-700">{campsite.description}</p>
            </section>
          )}

          {campsite.accommodationTypes.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold text-ink-900">
                Accommodation
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {campsite.accommodationTypes.map((type) => {
                  const meta = accommodationMeta[type];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <span
                      key={type}
                      className="flex items-center gap-2 rounded-full bg-forest-50 px-4 py-2 text-sm font-medium text-forest-700"
                    >
                      <Icon className="h-4 w-4" />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {campsite.amenities.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold text-ink-900">Amenities</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {campsite.amenities.map((amenity) => {
                  const meta = amenityMeta[amenity];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <div key={amenity} className="flex items-center gap-2 text-sm text-ink-700">
                      <Icon className="h-4 w-4 text-forest-600" />
                      {meta.label}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {campsite.setting.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold text-ink-900">Setting</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {campsite.setting.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-sand-200 px-3 py-1.5 text-xs font-medium text-ink-700"
                  >
                    {settingLabel[s] ?? s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {campsite.lat !== 0 && campsite.lng !== 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold text-ink-900">Location</h2>
              <div className="mt-4 h-80 overflow-hidden rounded-2xl">
                <DetailMap campsite={campsite} />
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 flex flex-col gap-4">
            <BookingPanel campsite={campsite} />

            <div className="flex items-start gap-2 rounded-2xl bg-forest-50 p-4 text-xs text-forest-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Campinger is a comparison site, not the merchant of record.
                Prices are estimates — you&apos;ll confirm the exact total
                and pay on {campsite.name}&apos;s own site.
              </p>
            </div>

            {campsite.lastScrapedAt && (
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <Clock className="h-3.5 w-3.5" />
                Prices from {campsite.name}, updated {campsite.lastScrapedAt}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
