# Campinger scraper

Pluggable ingestion pipeline described in `PLAN.md` §5 and `infrastructure.md` §5:
adapters normalize source pages into `ScrapedCampsite` records, which get
written to `scraper/output/*.json` locally and, if configured, to Firestore.

## Before adding any source

Read `PLAN.md` §2 first. For every source you add to `sources.config.ts`:

1. Read its `robots.txt` and confirm the path you're fetching isn't disallowed.
2. Read its Terms of Service and confirm scraping isn't explicitly forbidden.
3. Record both in that source's `complianceNote`.

The adapter also checks `robots.txt` live before every request and refuses to
fetch a disallowed URL (`scraper/lib/robots.ts`), but that's a safety net, not
a substitute for the manual review — a site can allow crawling in robots.txt
while still forbidding it in prose in their ToS.

## Architecture

- `types.ts` — `ScrapedCampsite`, `PriceSnapshot`, `SourceAdapter` interface.
- `lib/robots.ts` — robots.txt fetch + allow/disallow check.
- `lib/politeFetch.ts` — fetch wrapper enforcing robots.txt + a per-host delay
  (`SCRAPER_MIN_DELAY_MS`, default 2000ms) and an honest `User-Agent`.
- `lib/jsonld.ts` — pulls schema.org `LodgingBusiness`/`Campground`/etc. nodes
  out of a page's `<script type="application/ld+json">` blocks.
- `lib/normalize.ts` — maps a raw JSON-LD node to `ScrapedCampsite`.
- `lib/firestore.ts` — optional Firestore writes (`campsites` +
  `price_snapshots` subcollection + `source_adapters` health, per
  `infrastructure.md` §6).
- `adapters/jsonld-adapter.ts` — the one adapter currently implemented: fetch
  a page, extract structured data. This is PLAN.md §5's highest-priority,
  most stable extraction strategy (no site-specific CSS selectors to
  maintain). Add new adapters (e.g. a shared booking-platform API adapter)
  by implementing the `SourceAdapter` interface and registering it in
  `run.ts`'s `adaptersById`.
- `sources.config.ts` — the reviewed source list. Starts empty; see above.
- `run.ts` — CLI entrypoint, runs every configured source through its
  adapter, writes local JSON + a per-source health log, and pushes to
  Firestore if `FIREBASE_SERVICE_ACCOUNT_KEY` is set.
- `verify.ts` — offline smoke test against a local HTML fixture (no network
  calls), so the extraction/normalization logic can be validated without
  scraping a real site.

## Running it

```bash
npm run scrape:verify   # offline pipeline smoke test
npm run scrape          # real run, against sources.config.ts
```

With no sources configured, `npm run scrape` is a no-op that tells you so.

### Firestore output (optional)

Set `FIREBASE_SERVICE_ACCOUNT_KEY` to a Firebase service-account JSON
(stringified) to also write results into Firestore, matching
`infrastructure.md` §5/§6:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY="$(cat service-account.json)" npm run scrape
```

In CI (`.github/workflows/scrape.yml`) this comes from the
`FIREBASE_SERVICE_ACCOUNT_KEY` repo secret. Without it, the run still
completes and just writes `scraper/output/campsites.json` +
`scraper/output/run-log.json`.

## Output shape

`ScrapedCampsite` (`scraper/types.ts`) is field-name-compatible with
`Campsite` in `src/lib/types.ts` on purpose: `src/lib/campsites.ts` reads
Firestore docs defensively (`data.foo ?? <default>`), so a name mismatch
between the two doesn't fail loudly — it just shows up as a blank or zeroed
field in the UI. If you rename a field on either side, rename it on both, or
update the fallback in `normalizeCampsite`.

`priceEstimate`/`hasLivePricing` are computed here (`lib/priceEstimate.ts`,
from that run's `priceSnapshots`) and written directly onto the campsite
doc, rather than derived at query time from a `price_snapshots`
subcollection read — deliberately, to stay inside Firestore's free-tier
read quota per `infrastructure.md` §6 ("cache aggressively... rather than
re-querying Firestore per pageview"). The raw `priceSnapshots` are still
written to the `price_snapshots` subcollection (`lib/firestore.ts`) for
history/audit; nothing currently reads them back.

Fields the scraper does *not* populate: `collections` (editorial curation,
not scraping) and `id` (Firestore doc id, set to `slug`, not a doc field).
Both are expected to stay empty/absent on scraped docs — that's normal, not
a bug.

## Known limitation

The JSON-LD adapter can't infer `accommodationTypes` (tent/caravan/mobile
home/...) or `setting` (coastal/forest/...) from generic
`LodgingBusiness`/`Campground` markup — those fields come back empty and
need either a source-specific adapter or manual tagging, per PLAN.md §5
point 4 ("fallback: static info only, no live price" — still worth listing).
