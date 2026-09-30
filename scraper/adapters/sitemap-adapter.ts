import { politeFetch, RobotsDisallowedError } from "../lib/politeFetch";
import { extractSitemapUrls } from "../lib/sitemap";
import { fetchAndExtractOne } from "./jsonld-adapter";
import type { AdapterResult, SourceAdapter, SourceConfig } from "../types";

const DEFAULT_MAX_ITEMS = 30;

/**
 * Adapter for sitemap-driven discovery: fetch a sitemap.xml, optionally
 * scoped to a urlPrefix (e.g. one country's section of a sitemap covering
 * many), then politely fetch and jsonld-extract each discovered URL — same
 * single-page path the "jsonld" adapter uses, so every discovered page
 * still gets its own robots.txt check and per-host rate limit.
 */
export const sitemapAdapter: SourceAdapter = {
  id: "sitemap",

  async fetchListing(source: SourceConfig): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const issues: AdapterResult["issues"] = [];

    try {
      const res = await politeFetch(source.url);
      if (!res.ok) {
        issues.push({ sourceId: source.id, message: `HTTP ${res.status} fetching ${source.url}` });
        return { sourceId: source.id, adapter: "sitemap", records: [], issues, fetchedAt };
      }

      const xml = await res.text();
      const allUrls = extractSitemapUrls(xml, source.urlPrefix);
      if (allUrls.length === 0) {
        issues.push({
          sourceId: source.id,
          message: source.urlPrefix
            ? `no <loc> URLs matching prefix "${source.urlPrefix}" found in sitemap`
            : "no <loc> URLs found in sitemap",
        });
        return { sourceId: source.id, adapter: "sitemap", records: [], issues, fetchedAt };
      }

      const maxItems = source.maxItems ?? DEFAULT_MAX_ITEMS;
      const urls = allUrls.slice(0, maxItems);
      if (allUrls.length > urls.length) {
        issues.push({
          sourceId: source.id,
          message: `sitemap has ${allUrls.length} matching URL(s), only visiting the first ${urls.length} (maxItems)`,
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

      return { sourceId: source.id, adapter: "sitemap", records, issues, fetchedAt };
    } catch (err) {
      const message =
        err instanceof RobotsDisallowedError
          ? err.message
          : `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      issues.push({ sourceId: source.id, message });
      return { sourceId: source.id, adapter: "sitemap", records: [], issues, fetchedAt };
    }
  },
};
