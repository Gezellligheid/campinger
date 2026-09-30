import { politeFetch, RobotsDisallowedError } from "../lib/politeFetch";
import { extractLodgingNodes } from "../lib/jsonld";
import { normalizeLodgingNode } from "../lib/normalize";
import type { AdapterResult, SourceAdapter, SourceConfig } from "../types";

/**
 * A single detail page sometimes publishes more than one qualifying JSON-LD
 * node for the *same* place — e.g. sandaya.fr emits both a `Hotel` and a
 * `LodgingBusiness` block for one campsite, with different name casing and
 * only partially-overlapping fields. Treating each node as its own record
 * (the naive approach) creates duplicate campsites with different slugs.
 * Since this adapter fetches one page per source, merge every matching node
 * into a single object first — plain fields keep the first non-empty value
 * seen (earlier nodes considered more authoritative), array fields (like
 * amenityFeature) are unioned so nothing found only on the second node gets
 * dropped.
 */
function mergeNodes(nodes: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined || value === null) continue;
      const existing = merged[key];
      if (existing === undefined || existing === null) {
        merged[key] = value;
      } else if (Array.isArray(existing) && Array.isArray(value)) {
        merged[key] = [...existing, ...value];
      }
      // otherwise keep the first-seen value
    }
  }
  return merged;
}

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

      const merged = nodes.length > 0 ? mergeNodes(nodes) : null;
      const record = merged ? normalizeLodgingNode(merged, source.url, source.id) : null;
      const records = record ? [record] : [];

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
