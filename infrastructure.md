# Campinger — Infrastructure

Companion to `PLAN.md`. Scope: **hosting/runtime tech only**, adapted from the plan's suggested
stack to run **entirely on free tiers**, primarily **Vercel** + **Firebase**. Free-tier limits
change over time — treat the numbers below as "true as of writing" and re-check the provider
pricing pages before relying on them at scale.

---

## 1. Constraints driving these choices

- **$0 budget.** Every service below must have a no-credit-card-required (or credit-card-required
  but $0-if-under-quota) free tier.
- Vercel Hobby and Firebase Spark are both built for light/serverless workloads, not long-running
  processes — this shapes the scraper design more than anything else (see §5).
- PostGIS from `PLAN.md`'s original suggestion isn't available for free in this setup (no free
  managed Postgres+PostGIS from Vercel or Firebase) → swapped for **Firestore + geohashing**.

---

## 2. Stack summary

| Layer | Tech | Platform | Free tier |
|---|---|---|---|
| Frontend | Next.js + Tailwind + MapLibre GL | **Vercel** (Hobby) | Unlimited static/SSR hosting for personal/non-commercial use, generous bandwidth |
| API | Next.js Route Handlers (serverless functions) | **Vercel** (Hobby) | Included with the above; watch function duration limits |
| Database | Firestore (NoSQL) | **Firebase** (Spark) | 1 GiB stored, 50K reads / 20K writes / 20K deletes per day |
| Auth (later, §9) | Firebase Authentication | **Firebase** (Spark) | Free, generous MAU limits |
| Image/asset storage | Firebase Cloud Storage | **Firebase** (Spark) | 5 GB stored, 1 GB/day download |
| Map tiles | OpenStreetMap via MapLibre GL | n/a (public) | Free, no key required for light usage — self-host tiles later if traffic grows |
| Scraper/ingestion | Node or Python script | **GitHub Actions** | ~2,000 free CI minutes/month (private repo) or unlimited (public repo) |
| Scheduling for lightweight jobs | Vercel Cron | **Vercel** (Hobby) | Limited invocation frequency on Hobby — used only for cheap/fast jobs |

Two hosting platforms as requested (Vercel + Firebase). GitHub Actions is added purely as a free
*job runner* for the scraper — it hosts nothing user-facing, per your call above.

---

## 3. Frontend — Vercel

- Next.js app deployed on **Vercel Hobby**.
- Map: **MapLibre GL** + free OSM raster/vector tiles (matches `PLAN.md` §3's "avoid Google Maps
  cost early on"). No API key, no billing risk.
- Client fetches data through the API layer (§4), never talks to Firestore directly from the
  browser for search/list views, to keep security rules simple (public read-only queries only
  where explicitly allowed).
- Known Hobby-plan limits to design around:
  - Serverless function execution time is capped (short, seconds-scale) — keep API routes thin;
    push anything heavy (scraping, batch writes) to GitHub Actions instead.
  - Hobby plan is licensed for personal/non-commercial use — **if Campinger starts generating
    revenue (per §1 of `PLAN.md`), you'll need to move to a Pro plan at that point.** Flagged here
    so it isn't a surprise later.

---

## 4. API layer — Vercel Route Handlers

- Implemented as Next.js Route Handlers (`app/api/**`) running as Vercel serverless functions —
  no separate backend service to host.
- Responsibilities: search/filter/geo queries against Firestore, price-estimate computation
  (`PLAN.md` §4's derived `price_estimate` logic), the `/go/:campsiteId` outbound redirect +
  click-tracking endpoint.
- Firebase Admin SDK credentials stored as Vercel encrypted environment variables (service account
  key), used server-side only — browser never sees Firestore write credentials.
- If/when heavier compute is needed beyond Hobby limits (e.g. bulk price recompute), move that job
  to the GitHub Actions runner (§5) rather than upgrading Vercel — keeps everything at $0 longer.

---

## 5. Ingestion / scraper — GitHub Actions

Per `PLAN.md` §5, scraping needs scheduled, sometimes JS-heavy (Playwright) jobs that don't fit
Vercel Hobby's short function timeouts or Firebase Spark's outbound-network-restricted Cloud
Functions. GitHub Actions has neither limitation for our volume:

- **Scheduled workflow** (`.github/workflows/scrape.yml`) using `on: schedule` (cron syntax) —
  nightly for static campsite info, more frequently for prices, matching `PLAN.md` §2's rate-
  limiting guidance.
- Runner installs Node/Python + Playwright (only for the subset of sources that need a real
  browser — prefer the structured-data / lightweight-HTTP path from `PLAN.md` §5 wherever
  possible to keep runs fast and within free CI minutes).
- Writes normalized `CampsiteRecord[]` results directly to **Firestore** via the Firebase Admin
  SDK, authenticated with a service-account key stored as a **GitHub Actions secret**.
- Logs success/fail/field-completeness per adapter to a Firestore `source_adapter` collection
  (`PLAN.md` §4) — surfaced later in an admin view served by the same Vercel app.
- Cost control: keep an eye on private-repo Actions minutes (~2,000/month free); if the scraper
  suite grows past that, either make the repo public or trim schedule frequency before it becomes
  a paid line item.

**Fallback path (if GitHub Actions becomes unavailable or undesired later):** Vercel Cron →
lightweight Vercel API route, limited to fast structured-data (JSON-LD) scraping only, no
Playwright, roughly daily cadence — strictly Vercel+Firebase, but a real capability step down.

---

## 6. Database — Firestore (Firebase Spark)

Adapts `PLAN.md` §4's Postgres/PostGIS model to Firestore's document model:

- **`campsites` collection** — one document per campsite, fields as in `PLAN.md` §4
  (location, amenities, accommodation_types, source_url, booking_url, etc.), plus a
  precomputed **geohash** field for radius queries (via `geofire-common`, a free library — no
  paid geo-index needed).
- **`price_snapshots` subcollection** (under each campsite, or a top-level collection keyed by
  campsite_id) — time series of scraped prices, matching `PLAN.md`'s `price_snapshot` model.
- **`source_adapters` collection** — per-adapter health status written by the GitHub Actions
  scraper (§5).
- **Search/filter tradeoffs vs. the original Postgres plan:**
  - Firestore has no full-text search and no native geo-radius query — geohash + client/server
    bounding-box queries (via `geofire-common`) cover "near this point" search well enough for
    MVP scale.
  - Tag-based filters (amenities, accommodation type) map cleanly to Firestore `array-contains` /
    `in` queries.
  - Typo-tolerant name/location search (originally Meilisearch/Typesense in `PLAN.md` §3) has no
    free equivalent wired in here — start with simple prefix matching on a lowercased name field;
    revisit with a dedicated search service (e.g. Algolia/Typesense free tier) only if this
    becomes a real UX gap, since that would add a third platform beyond Vercel+Firebase.
- **Quota discipline:** MVP-scale reads/writes (single-digit thousands of campsites, nightly
  batch writes) should sit comfortably under Spark's 50K reads/20K writes per day — but the
  price-estimate endpoint (§4) should cache aggressively (e.g. short-lived in-memory/edge cache
  per Vercel function) rather than re-querying Firestore per pageview, to protect that quota as
  traffic grows.

---

## 7. Storage — Firebase Cloud Storage

- Used only for images/assets Campinger is actually licensed to host (per `PLAN.md` §2's data
  minimization guidance) — logos, curated collection imagery, etc.
- Scraped campsite photos are **hot-linked to the source**, not mirrored into Storage, both for
  legal reasons (`PLAN.md` §2) and to stay well under the 5 GB / 1 GB-per-day free quota.

---

## 8. Outbound redirect + click tracking

- `/go/:campsiteId` route (Vercel API route, §4) issues a 302 to the operator's booking URL with
  dates pre-filled where supported, and logs a lightweight click event to a Firestore
  `redirect_clicks` collection (campsite_id, timestamp, query params) — stays within free write
  quota at MVP traffic levels.

---

## 9. Deferred (not needed for MVP, noted for later)

- **Firebase Auth** — user accounts, saved searches, favorites (`PLAN.md` §9). Free tier is
  generous enough to add later without re-architecting.
- **Firebase Blaze plan** — only needed if: Cloud Functions need outbound internet access, Storage
  egress exceeds 1 GB/day, or Firestore usage exceeds Spark quotas. Blaze still has a free monthly
  allowance identical to Spark's, billing only for usage above it — so this is a soft ceiling, not
  a cliff.
- **Dedicated search service** (Algolia/Typesense) — only if Firestore prefix search proves too
  weak in practice.
- **Self-hosted map tiles** — only if public OSM tile usage triggers rate limiting at higher
  traffic.

---

## 10. Open questions carried over from `PLAN.md` §10

Still unresolved and out of scope for this doc: target launch region, and how aggressive to be on
scraping vs. partnerships. Both affect which sources the GitHub Actions scraper targets first, not
the infrastructure choices above.
