import { politeFetch, RobotsDisallowedError } from "../lib/politeFetch";
import { extractListingUrls } from "../lib/jsonld";
import { fetchAndExtractOne } from "./jsonld-adapter";
import type { AdapterResult, SourceAdapter, SourceConfig } from "../types";

const DEFAULT_MAX_ITEMS = 20;

/**
 * Adapter for directory/search-results pages (e.g. eurocampings.nl region
 * pages): discover candidate campsite detail-page URLs from the page's
 * schema.org ItemList JSON-LD, then politely fetch and jsonld-extract each
 * one individually via the same single-page path the "jsonld" adapter uses
 * — every discovered URL goes through politeFetch, so it gets its own
 * robots.txt check and per-host rate limit, same as if it had been listed
 * as its own source.
 */
export const jsonldListingAdapter: SourceAdapter = {
  id: "jsonld-listing",

  async fetchListing(source: SourceConfig): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const issues: AdapterResult["issues"] = [];

    try {
      const res = await politeFetch(source.url);
      if (!res.ok) {
        issues.push({ sourceId: source.id, message: `HTTP ${res.status} fetching ${source.url}` });
        return { sourceId: source.id, adapter: "jsonld-listing", records: [], issues, fetchedAt };
      }

      const html = await res.text();
      const allUrls = extractListingUrls(html, source.url);
      if (allUrls.length === 0) {
        issues.push({ sourceId: source.id, message: "no ItemList JSON-LD found on listing page" });
        return { sourceId: source.id, adapter: "jsonld-listing", records: [], issues, fetchedAt };
      }

      const maxItems = source.maxItems ?? DEFAULT_MAX_ITEMS;
      const urls = allUrls.slice(0, maxItems);
      if (allUrls.length > urls.length) {
        issues.push({
          sourceId: source.id,
          message: `found ${allUrls.length} listing item(s), only visiting the first ${urls.length} (maxItems)`,
        });
      }

      const records = [];
      for (const url of urls) {
        try {
          const { record, issue } = await fetchAndExtractOne(url, source.id);
          if (record) records.push(record);
          if (issue) issues.push({ sourceId: source.id, message: issue });
        } catch (err) {
          const message =
            err instanceof RobotsDisallowedError
              ? err.message
              : `fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`;
          issues.push({ sourceId: source.id, message });
        }
      }

      return { sourceId: source.id, adapter: "jsonld-listing", records, issues, fetchedAt };
    } catch (err) {
      const message =
        err instanceof RobotsDisallowedError
          ? err.message
          : `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      issues.push({ sourceId: source.id, message });
      return { sourceId: source.id, adapter: "jsonld-listing", records: [], issues, fetchedAt };
    }
  },
};
