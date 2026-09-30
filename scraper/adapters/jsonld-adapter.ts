import { politeFetch, RobotsDisallowedError } from "../lib/politeFetch";
import { extractLodgingNodes } from "../lib/jsonld";
import { normalizeLodgingNode } from "../lib/normalize";
import type { AdapterResult, SourceAdapter, SourceConfig } from "../types";

/**
 * Generic adapter: fetch a single listing/detail page and pull whatever
 * schema.org LodgingBusiness/Campground JSON-LD it publishes. Works against
 * any source without site-specific selectors — the first-priority strategy
 * from PLAN.md §5.
 */
export const jsonldAdapter: SourceAdapter = {
  id: "jsonld",

  async fetchListing(source: SourceConfig): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const issues: AdapterResult["issues"] = [];

    try {
      const res = await politeFetch(source.url);
      if (!res.ok) {
        issues.push({ sourceId: source.id, message: `HTTP ${res.status} fetching ${source.url}` });
        return { sourceId: source.id, adapter: "jsonld", records: [], issues, fetchedAt };
      }

      const html = await res.text();
      const nodes = extractLodgingNodes(html);
      if (nodes.length === 0) {
        issues.push({
          sourceId: source.id,
          message: "no LodgingBusiness/Campground JSON-LD found on page",
        });
      }

      const records = nodes
        .map((node) => normalizeLodgingNode(node, source.url, source.id))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (records.length === 0 && nodes.length > 0) {
        issues.push({ sourceId: source.id, message: "found JSON-LD nodes but none had a usable name" });
      }

      return { sourceId: source.id, adapter: "jsonld", records, issues, fetchedAt };
    } catch (err) {
      const message =
        err instanceof RobotsDisallowedError
          ? err.message
          : `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      issues.push({ sourceId: source.id, message });
      return { sourceId: source.id, adapter: "jsonld", records: [], issues, fetchedAt };
    }
  },
};
