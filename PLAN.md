# Campinger — Project Plan

A meta-search / aggregator for campsites ("booking.com for campings"). Campsites keep their own
booking systems; Campinger indexes them, lets people search & filter in one place, shows an
estimated price for their date range, and redirects to the camping's own booking page to complete
the reservation.

---

## 1. Core Concept

- **Not a booking engine.** We never handle payments or reservations ourselves. We are a
  discovery + comparison layer on top of campsites' existing websites/booking systems.
- **Value proposition:** "Stop googling 40 different camping websites — search once, compare,
  click through to book directly with the camping."
- **Revenue paths (later):** affiliate/referral commission where booking systems support it,
  featured/sponsored listings, lead-gen fees to campsites, eventually a Google-Flights-style
  "meta-search" ad model.

---

## 2. Legal & Ethical Groundwork (do this before scraping at scale)

This is the part most likely to sink the project if skipped, so it goes first.

- **robots.txt & ToS review per source** — build a per-source compliance note (allowed to
  crawl? rate limits? explicit anti-scraping clause?).
- **Prefer official channels over raw scraping wherever they exist:**
  - Booking-system vendors used by many independent campsites often expose feeds/APIs or partner
    programs (e.g. camping-specific PMS/channel-manager platforms). Getting data via a partner
    API is far more stable than scraping HTML.
  - National/regional camping federations or tourism boards sometimes publish open datasets
    (park locations, amenities) — great for seeding the map even before pricing is scraped.
- **Data minimization** — only store what's needed to show a listing + price estimate + a link
  out. Don't mirror photos/descriptions at large scale without a license; hot-link or use
  attribution where allowed.
- **Rate limiting & caching** — scrape on a schedule (e.g. nightly for static info, every few
  hours for prices), not on every user search, to avoid hammering source sites and to keep our
  own site fast.
- **Always disclose the source** — "Prices from [camping website], updated 3h ago" builds trust
  and reduces legal exposure (we're not claiming to be the merchant of record).
- **Have a takedown process** — a simple form/email so a campsite can ask to be removed or
  correct data; honor it fast.
- **Talk to a lawyer once you have traction** — scraping law varies by country (EU vs US) and by
  whether data is copyrighted/behind a login. Early stage: stay conservative, avoid scraping
  sites that clearly forbid it, and avoid circumventing any technical protection (captchas,
  logins).

---

## 3. High-Level Architecture

```
                     ┌──────────────────────┐
                     │   Scraper/Ingestion    │
                     │  (scheduled jobs)      │
                     │  - site adapters       │
                     │  - normalizer          │
                     │  - price extractor     │
                     └──────────┬─────────────┘
                                │ writes
                                ▼
                     ┌──────────────────────┐
                     │   Core Database        │
                     │  campsites, prices,    │
                     │  amenities, geodata    │
                     └──────────┬─────────────┘
                                │ reads
                                ▼
                     ┌──────────────────────┐
                     │   API Layer            │
                     │  search / filter /     │
                     │  price-estimate        │
                     └──────────┬─────────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │   Web Frontend         │
                     │  map + list, filters,  │
                     │  date picker, detail    │
                     │  page → outbound link  │
                     └──────────────────────┘
```

### Suggested stack (pragmatic, fast to ship)

- **Frontend:** Next.js (React) + Tailwind CSS + a map library (MapLibre GL or Leaflet with
  free OSM tiles to avoid Google Maps cost early on).
- **Backend/API:** Node.js (NestJS or Express) or Python (FastAPI) — pick whichever you're
  faster in; Python is arguably nicer for the scraper side, so a Python API (FastAPI) + shared
  DB with a Node frontend is a reasonable split, or just do it all in Node.
- **Database:** PostgreSQL with **PostGIS** (essential for "search near this location" /
  map-radius queries) + a search index (Postgres full-text or Meilisearch/Typesense for fast,
  typo-tolerant location/name search).
- **Scraper/workers:** Python (requests/httpx + BeautifulSoup/Playwright for JS-heavy sites) run
  as scheduled jobs (cron / a queue like Celery or a lightweight job runner). Playwright only
  for sites that need it — it's slower and heavier, so keep an HTML-only path where possible.
- **Geocoding:** Nominatim (OSM, self-hosted or rate-limited public) or a paid geocoder once
  volume grows.
- **Hosting:** Vercel (frontend) + a small VPS or Railway/Render (API + scrapers + Postgres), or
  all on one VPS to start — no need for heavy infra at MVP scale.

---

## 4. Data Model (first pass)

**campsite**
- id, name, slug
- location: lat/lng, address, country, region
- description, hero_image, gallery[] (only if licensed/allowed, else link out)
- amenities: pool, wifi, pets_allowed, electricity, showers, playground, dog-friendly, glamping,
  pitches vs cabins, beach nearby, etc. (tag-based, drives filters)
- accommodation_types: tent pitch / caravan pitch / mobile home / cabin / glamping
- source_url (the camping's own site / OTA listing we found it on)
- booking_url (deep link used for the outbound redirect — as close to a pre-filled search as
  possible)
- data_source(s): which scraper/adapter populated this record
- last_scraped_at, data_confidence (fresh vs stale)

**price_snapshot** (time series, one row per scrape per accommodation type per date range)
- campsite_id, accommodation_type
- checkin_date, checkout_date (or date range/season bucket if the source doesn't give exact
  nightly pricing)
- price, currency, price_type (per night / per stay / from-price)
- scraped_at

**price_estimate (derived, computed at query time)**
- Because most camping sites don't expose a clean calendar API, treat this as an **estimate**,
  not a live quote:
  - If exact dates match a scraped snapshot → show that price.
  - Else interpolate from nearby snapshots / season (low/mid/high season bands) → show a
    **range** ("€25–€40/night estimated") with a "final price may vary, confirm on [camping]"
    disclaimer.
  - Always link out for the real, live price — we are explicitly *not* the source of truth.

**source_adapter** (per scraped site/platform)
- name, base_url, scrape_strategy (HTML selectors / API / feed), schedule, health status
  (last success, failure count) — this becomes its own small admin dashboard once you have >20
  sources.

---

## 5. The Scraper: realistic approach

Scraping hundreds of independently-built campsite websites 1-by-1 does not scale. Prioritize in
this order:

1. **Aggregator/platform sources first.** Many independent campsites actually run on a handful
   of shared booking-system platforms (channel managers / camping-specific PMS). If you can
   write **one adapter per platform**, you cover many campsites at once instead of one adapter
   per site. Identify the top 5–10 platforms used in your target region and start there.
2. **Structured data on the sites themselves.** Look for JSON-LD / schema.org (`LodgingBusiness`,
   `Offer`) markup — some sites include this for SEO, and it's far easier/more stable to parse
   than raw HTML.
3. **Manual/semi-automated onboarding for high-value long-tail sites.** For popular campsites
   with a fully custom site, a lightweight per-site adapter (CSS selectors) is fine — expect
   maintenance overhead (~breaks every few months when they redesign).
4. **Fallback: static info only, no live price.** For sites you can't reliably extract pricing
   from, still list the campsite (name, location, amenities, photos if licensed) with a "check
   price on [site]" link rather than a fabricated estimate — better than nothing, and keeps the
   catalog broad.

Build the scraper as **pluggable adapters** behind a common interface
(`fetch_listing(source) -> normalized CampsiteRecord[]`) so adding a new source is additive, not
a rewrite. Log every scrape run (success/fail/field-completeness) so broken adapters surface
quickly.

---

## 6. Frontend / UX

### Look & feel
"Modern adventure" direction:
- Earthy-but-vivid palette (forest green, burnt orange/terracotta, warm sand, off-white), not a
  clinical SaaS-blue.
- Big, high-quality outdoor photography; rounded/organic shapes over sharp corporate edges.
- Friendly, energetic typography — a warm sans (e.g. something like Inter/General Sans for body)
  paired with a slightly bolder display face for headings.
- Micro-interactions: subtle hover/tap motion on cards, smooth map pans — reinforces "adventure,
  not spreadsheet."
- Reference points to look at for tone: AllTrails, Hipcamp, Airbnb — but keep our own identity,
  not a clone.

### Homepage
- Hero with a big search bar: **location** (autocomplete on place/region/camping name),
  **arrival date**, **departure date**, optional guest count.
- Below the fold: curated collections ("Best for families," "Near the coast," "Dog-friendly"),
  trust-building copy ("We compare X campsites across Y countries — book directly, no markup").

### Search results page
- Split view: **map (left/top)** + **list (right/bottom)**, like Airbnb/Booking.
- Filters sidebar: price range, amenities (pool, wifi, pets, electricity...), accommodation type
  (tent/caravan/mobile home/cabin), star rating/review score if available, distance to
  beach/city, instant "has live pricing" toggle.
- Each card: photo, name, location, key amenity icons, **estimated price for the selected
  dates** (or "from €X/night" if no exact match), "View & book →".
- Sort: price, distance, rating, popularity.

### Campsite detail page
- Gallery, description, full amenity list, map, reviews (aggregated/linked if available).
- Price panel: shows the same date picker, recalculates the estimate, and a prominent
  **"Book on [CampsiteName].com →"** CTA that opens the source's booking flow (deep-linked with
  dates pre-filled where the source URL scheme supports it via query params).
- Clear "estimated price, confirm final price and availability on the operator's site" note —
  manage expectations, avoid liability for stale prices.

### Redirect flow
- Outbound link is a tracked redirect (`/go/:campsiteId?checkin=...&checkout=...`) so you can
  measure click-through without slowing the user down — 302 redirect straight to the operator's
  booking page/search results, pre-filled with dates when possible.

---

## 7. Filters (v1 set)

- Location / radius
- Date range (arrival/departure) → drives the price estimate
- Price range
- Accommodation type: tent pitch, caravan/RV pitch, mobile home, cabin/chalet, glamping
- Amenities: pool, wifi, pets allowed, electricity hookup, showers/toilet block, playground,
  restaurant/shop on-site, accessible facilities
- Setting: coastal, forest, countryside, near city, lakeside
- Star rating / review score (if sourced)
- "Live pricing available" toggle (be upfront that some listings are estimate-only)

---

## 8. MVP Scope (build order)

1. **Data model + manual seed set.** Hand-enter/import ~50–100 campsites in one target region
   (pick a country/region you know well) so the frontend has real data to build against before
   the scraper is reliable.
2. **Search + filter + map UI** against that seed data (no scraping yet). Get the core UX right
   first.
3. **Date-based price estimate logic** using whatever pricing data you've manually gathered for
   the seed set (even rough season bands are fine to start).
4. **Outbound redirect + click tracking.**
5. **First scraper adapter** for one platform/source, feeding into the same schema — validate
   the pipeline end-to-end for a small batch before scaling adapters.
6. **Scale adapters** to more sources/platforms, add the admin/health dashboard for scrape
   status.
7. **Polish:** collections/curation, reviews, SEO for location pages (huge organic channel for
   this kind of site — "campsites near [city]" pages), analytics.

## 9. Later / Nice-to-have

- User accounts: saved searches, favorites, price-drop alerts.
- Reviews aggregated from multiple sources (with attribution) or your own review system.
- Availability calendar (not just price) once/if sources expose it.
- Mobile app.
- i18n/multi-currency for cross-border search.
- Partnering directly with campsites for verified live pricing (removes scraping fragility for
  the sites that opt in) — likely the long-term stable path once you have traffic to offer them.

---

## 10. Open Questions to Resolve Early

- **Target region for launch?** (Country/countries — affects which booking platforms to target
  first and what geocoding/map data you need.)
- **Build vs. seed data first?** Recommend seeding manually before investing in scraping, so the
  scraper is validated against a schema that's already proven useful in the UI.
- **Map provider budget** — OSM/MapLibre is free but rougher; Google Maps is polished but costs
  money at scale. Start free.
- **How aggressive to be on scraping vs. partnerships** — start conservative (structured
  data / partner feeds / few well-behaved adapters) and expand once the product proves it drives
  bookings, at which point campsites have an incentive to *give* you a feed rather than have you
  scrape them.
