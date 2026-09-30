import Image from "next/image";
import { Suspense } from "react";
import SearchBar from "./SearchBar";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1500534623283-312aade485b7?q=80&w=2400&auto=format&fit=crop"
          alt="Sunlit pine forest track leading toward the coast"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/45 via-forest-900/35 to-sand-50" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col items-start px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-8">
        <span className="rounded-full bg-sand-50/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-sand-50 ring-1 ring-sand-50/30">
          40,000+ campsites, one search
        </span>
        <h1 className="mt-6 max-w-2xl font-display text-4xl font-semibold leading-[1.05] text-sand-50 sm:text-5xl lg:text-6xl">
          Stop googling forty different camping websites.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-sand-100/90">
          Search once, compare pitches, cabins, and mobile homes across
          Europe, then book directly with the campsite — no markup, no
          middleman.
        </p>

        <div className="mt-10 w-full max-w-3xl">
          <Suspense fallback={<div className="h-[76px] w-full rounded-full bg-white/60" />}>
            <SearchBar variant="hero" />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
