import type { SourceConfig } from "./types";

/**
 * Sources the scraper is allowed to hit. Intentionally starts empty.
 *
 * Per PLAN.md §2, every entry needs a robots.txt/ToS review *before* it's
 * added here — this file is that review's record, not something to
 * autofill. For each source: confirm robots.txt allows the paths you'll
 * fetch (the adapter also checks this live and skips disallowed URLs, but
 * do the manual read first), confirm the ToS doesn't forbid scraping, and
 * note both in `complianceNote` below.
 *
 * To add a source once reviewed:
 *   {
 *     id: "example-campsite",
 *     label: "Example Campsite",
 *     url: "https://example.com/campsite-detail-page",
 *     adapter: "jsonld",
 *     complianceNote: "robots.txt reviewed 2026-09-30, no Disallow on this " +
 *       "path; ToS silent on scraping; page publishes schema.org Campground JSON-LD.",
 *   },
 */
export const sources: SourceConfig[] = [];
