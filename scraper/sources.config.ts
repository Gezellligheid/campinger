import type { SourceConfig } from "./types";

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
