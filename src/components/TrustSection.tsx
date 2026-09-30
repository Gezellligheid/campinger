import { SearchCheck, Tag, ExternalLink } from "lucide-react";

const steps = [
  {
    icon: SearchCheck,
    title: "Search once",
    body: "Filter by dates, price, amenities, and setting across thousands of campsites in one place — instead of forty separate tabs.",
  },
  {
    icon: Tag,
    title: "Compare real prices",
    body: "We show an estimated price for your dates, sourced straight from each campsite's own site, refreshed on a schedule.",
  },
  {
    icon: ExternalLink,
    title: "Book directly, no markup",
    body: "When you're ready, we send you to the campsite's own booking page to finish — we never touch your payment.",
  },
];

export default function TrustSection() {
  return (
    <section id="trust" className="bg-forest-50/60">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-terracotta-500">
            How it works
          </span>
          <h2 className="mt-2 font-display text-3xl font-semibold text-forest-800">
            We compare, the campsite books
          </h2>
          <p className="mt-3 text-ink-700">
            Campinger isn&apos;t a booking engine. We&apos;re a discovery and
            comparison layer on top of campsites&apos; own websites and
            booking systems — always disclosed, always linking straight
            through.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="rounded-2xl bg-white p-6 ring-1 ring-forest-900/5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-terracotta-500/10 text-terracotta-500">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-ink-500">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
