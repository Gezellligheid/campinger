import Link from "next/link";
import { Tent } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-forest-900/10 bg-forest-800 text-sand-100">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-100 text-forest-800">
                <Tent className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span className="font-display text-lg font-semibold text-sand-50">
                Campinger
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm text-sand-100/80">
              We compare campsites across Europe and send you straight to the
              operator to book — no markup, no middleman. Prices shown are
              estimates; always confirm the final price and availability on
              the campsite&apos;s own site.
            </p>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-sand-50">
              Explore
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-sand-100/80">
              <li>
                <Link href="/search" className="hover:text-sand-50">
                  Search campsites
                </Link>
              </li>
              <li>
                <Link href="/#collections" className="hover:text-sand-50">
                  Collections
                </Link>
              </li>
              <li>
                <Link href="/#trust" className="hover:text-sand-50">
                  How it works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-sand-50">
              For campsites
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-sand-100/80">
              <li>
                <a href="#" className="hover:text-sand-50">
                  Claim your listing
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-sand-50">
                  Report incorrect data
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-sand-50">
                  Request a takedown
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-sand-100/10 pt-6 text-xs text-sand-100/60">
          © {new Date().getFullYear()} Campinger. Not a booking platform — a
          discovery layer on top of campsites&apos; own booking systems.
        </div>
      </div>
    </footer>
  );
}
