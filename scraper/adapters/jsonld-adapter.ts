import { politeFetch, RobotsDisallowedError } from "../lib/politeFetch";
import { extractLodgingNodes } from "../lib/jsonld";
import { extractEurocampingsBookingLink, extractEurocampingsGuidePrice } from "../lib/eurocampings";
import { normalizeLodgingNode } from "../lib/normalize";
import type { AdapterResult, ScrapedCampsite, SourceAdapter, SourceConfig } from "../types";

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
 * Fetch one page and pull a single normalized campsite record out of
 * whatever schema.org LodgingBusiness/Campground JSON-LD it publishes.
 * Shared by the "jsonld" adapter (one source = one page) and the
 * "jsonld-listing" adapter (one page per discovered URL).
 */
export async function fetchAndExtractOne(
  url: string,
  dataSource: string,
): Promise<{ record: ScrapedCampsite | null; issue: string | null }> {
  const res = await politeFetch(url);
  if (!res.ok) {
    return { record: null, issue: `HTTP ${res.status} fetching ${url}` };
  }

  const html = await res.text();
  const nodes = extractLodgingNodes(html);
  if (nodes.length === 0) {
    return { record: null, issue: `no LodgingBusiness/Campground JSON-LD found on ${url}` };
  }

  const merged = mergeNodes(nodes);
  const guidePrice = extractEurocampingsGuidePrice(html);
  const bookingUrlOverride = extractEurocampingsBookingLink(html);
  const record = normalizeLodgingNode(merged, url, dataSource, guidePrice, bookingUrlOverride);
  if (!record) {
    return { record: null, issue: `found JSON-LD nodes but none had a usable name on ${url}` };
  }

  return { record, issue: null };
}

/**
 * Generic adapter: fetch a single detail page and pull whatever schema.org
 * LodgingBusiness/Campground JSON-LD it publishes. Works against any source
 * without site-specific selectors — the first-priority strategy from
 * PLAN.md §5.
 */
export const jsonldAdapter: SourceAdapter = {
  id: "jsonld",

  async fetchListing(source: SourceConfig): Promise<AdapterResult> {
    const fetchedAt = new Date().toISOString();
    const issues: AdapterResult["issues"] = [];

    try {
      const { record, issue } = await fetchAndExtractOne(source.url, source.id);
      if (issue) issues.push({ sourceId: source.id, message: issue });
      return { sourceId: source.id, adapter: "jsonld", records: record ? [record] : [], issues, fetchedAt };
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
