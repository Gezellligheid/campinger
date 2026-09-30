import type { FocusedCountry, SitemapIndexSource, SourceConfig } from "./types";

/**
 * Sources the scraper is allowed to hit.
 *
 * Per PLAN.md §2, every entry needs a robots.txt/ToS review *before* it's
 * added here — this file is that review's record, not something to
 * autofill. For each source: confirm robots.txt allows the paths you'll
 * fetch (the adapter also checks this live and skips disallowed URLs, but
 * do the manual read first), confirm the ToS doesn't forbid scraping, and
 * note both in `complianceNote` below.
 *
 * The three below were reviewed 2026-09-30: robots.txt fetched and read
 * directly for each domain, confirming the specific page path isn't
 * disallowed for `User-agent: *`. Each page publishes schema.org
 * Campground/LodgingBusiness JSON-LD itself — structured data sites
 * publish specifically to be machine-read (for search engines), which is
 * the least invasive signal of "meant to be scraped" available without a
 * direct answer from the operator. None of the three had an accessible
 * ToS page reviewed for an explicit no-scraping clause — that's a gap, not
 * a clean bill of health; per PLAN.md §2, get a real legal review before
 * scaling past this small initial set.
 *
 * To add another source once reviewed:
 *   {
 *     id: "example-campsite",
 *     label: "Example Campsite",
 *     url: "https://example.com/campsite-detail-page",
 *     adapter: "jsonld",
 *     complianceNote: "robots.txt reviewed 2026-09-30, no Disallow on this " +
 *       "path; ToS silent on scraping; page publishes schema.org Campground JSON-LD.",
 *   },
 */
export const sources: SourceConfig[] = [
  {
    id: "les-castels-la-garangeoire",
    label: "Les Castels — La Garangeoire",
    url: "https://www.les-castels.com/camping/les-castels-la-garangeoire",
    adapter: "jsonld",
    complianceNote:
      "robots.txt (les-castels.com, checked 2026-09-30) disallows only " +
      "*/resultat-recherche*, tx_news_pi1/tx_nkclient_tunnel query params, " +
      "/annexes/demande-de-rappel, and *flux-produit* — this /camping/ " +
      "detail path isn't covered. Page publishes a schema.org Campground " +
      "JSON-LD block with name/description/address/geo/aggregateRating.",
  },
  {
    id: "sandaya-aloha",
    label: "Sandaya — Aloha",
    url: "https://www.sandaya.fr/nos-campings/aloha",
    adapter: "jsonld",
    complianceNote:
      "robots.txt (sandaya.fr, checked 2026-09-30) disallows only " +
      "*availability_search*/*availabilitysearch* — this /nos-campings/ " +
      "detail path isn't covered. Page publishes a schema.org " +
      "LodgingBusiness JSON-LD block with address/geo/amenityFeature " +
      "(French-language amenity names) /aggregateRating.",
  },
  {
    id: "capfun-an-trest",
    label: "Capfun — An Trest",
    url: "https://www.capfun.com/camping-france-bretagne-an_trest-FR.html",
    adapter: "jsonld",
    complianceNote:
      "robots.txt (capfun.com, checked 2026-09-30) disallows only " +
      "/page/, /php/, /webservice/, /clix/ for User-agent: * (plus a hard " +
      "block on several SEO-crawler bots, not us) — this .html detail " +
      "page isn't covered. Page publishes a schema.org Campground JSON-LD " +
      "block with address/geo/amenityFeature (French-language amenity " +
      "names)/aggregateRating.",
  },
];

/**
 * Sitemaps to index every run: cheap (one fetch each), tags every URL with
 * country/region, writes to the `campsite_index` Firestore collection —
 * but never visits any of the listed URLs itself. See FocusedCountry in
 * types.ts for the other half of the split: only indexed URLs whose
 * country is in `focusedCountries` below ever actually get scraped.
 *
 * NOTE: unlike the three individual-campsite sources above, eurocampings.nl
 * (/ ACSI) is a third-party directory, not an individual campsite's own
 * site — its compiled listings are its own core commercial asset, and
 * under EU law a compilation like this can carry a "database right"
 * independent of any single page's copyright, separate from whatever
 * robots.txt/ToS say about crawling. robots.txt is permissive (checked
 * 2026-09-30 on both eurocampings.nl and eurocampings.co uk, which hosts
 * this sitemap file cross-domain from the pages it lists — same rules on
 * both: only /maintenance.html, /cpc/out/, /campsite/search/,
 * /campsite/review/, /dfp/, /campsite/download-pdf/, /esi/, /index.php/,
 * /clear-cache/ disallowed for User-agent: *, covering neither /sitemap/
 * nor the individual /<country>/<region>/<town>/<slug>/ detail pages it
 * lists) and I found no explicit no-scraping clause in their general terms
 * (algemene voorwaarden), but I did not get a real legal opinion on the
 * database-right question — that's a materially bigger compliance gap
 * than the three sources above. Added at the user's explicit
 * request/acceptance of that risk (chat, 2026-09-30); get an actual legal
 * review before scaling focus beyond a small initial country list.
 */
export const sitemapIndexSources: SitemapIndexSource[] = [
  {
    id: "eurocampings-campsite-sitemap",
    label: "Eurocampings — full campsite sitemap",
    url: "https://www.eurocampings.co.uk/sitemap/campsite.nl.xml",
    parser: "eurocampings",
    complianceNote:
      "robots.txt (eurocampings.nl and eurocampings.co.uk, checked " +
      "2026-09-30) disallows only /maintenance.html, /cpc/out/, " +
      "/campsite/search/, /campsite/review/, /dfp/, " +
      "/campsite/download-pdf/, /esi/, /index.php/, /clear-cache/ for " +
      "User-agent: * on both — /sitemap/ isn't covered. Indexing only " +
      "reads this one sitemap file; it doesn't visit any campsite page " +
      "itself (each one discovered still goes through politeFetch's own " +
      "robots.txt check when/if a focused-country run actually visits it).",
  },
];

/**
 * Countries actively being built out — each run, pulls up to `maxItems`
 * not-yet-scraped indexed URLs per country and scrapes full details for
 * them via the same jsonld single-page path every other source uses.
 * `country` must match the path segment parseEurocampingsEntry extracts
 * (e.g. "belgie", not "belgium" or "Belgium").
 */
export const focusedCountries: FocusedCountry[] = [
  { country: "belgie", label: "Belgium", maxItems: 20 },
  // France is the largest country in the sitemap (~2,865 entries) — at
  // 20/run it'll take a long time to fully cover, but that's the
  // intentional politeness tradeoff (see the file-header note above).
  { country: "frankrijk", label: "France", maxItems: 20 },
];
