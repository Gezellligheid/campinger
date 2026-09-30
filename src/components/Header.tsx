import Link from "next/link";
import { Tent } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-forest-900/5 bg-sand-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-600 text-sand-50">
            <Tent className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-forest-800">
            Campinger
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-ink-700 md:flex">
          <Link href="/search" className="transition-colors hover:text-forest-600">
            Search campsites
          </Link>
          <a href="#collections" className="transition-colors hover:text-forest-600">
            Collections
          </a>
          <a href="#trust" className="transition-colors hover:text-forest-600">
            How it works
          </a>
        </nav>

        <Link
          href="/search"
          className="rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-sand-50 shadow-sm transition-colors hover:bg-forest-700"
        >
          Find a campsite
        </Link>
      </div>
    </header>
  );
}
