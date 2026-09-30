import Image from "next/image";
import Link from "next/link";
import { collections } from "@/lib/mock-data";

export default function CollectionsSection() {
  return (
    <section id="collections" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-terracotta-500">
            Curated for you
          </span>
          <h2 className="mt-2 font-display text-3xl font-semibold text-forest-800">
            Find your kind of trip
          </h2>
        </div>
        <Link
          href="/search"
          className="text-sm font-semibold text-forest-600 hover:text-forest-700"
        >
          Browse all campsites →
        </Link>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {collections.map((c) => (
          <Link
            key={c.slug}
            href={`/search?collection=${c.slug}`}
            className="group relative flex h-72 flex-col justify-end overflow-hidden rounded-3xl"
          >
            <Image
              src={c.image}
              alt={c.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-900/85 via-forest-900/20 to-transparent" />
            <div className="relative p-6">
              <h3 className="font-display text-xl font-semibold text-sand-50">
                {c.title}
              </h3>
              <p className="mt-1 text-sm text-sand-100/85">{c.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
