import * as cheerio from "cheerio";

const CAMPSITE_TYPES = new Set([
  "lodgingbusiness",
  "campground",
  "resort",
  "hotel",
  "bedandbreakfast",
]);

/** Recursively walk an arbitrary JSON-LD value, yielding every object node. */
function* walkNodes(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walkNodes(item);
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    yield obj;
    if (obj["@graph"]) yield* walkNodes(obj["@graph"]);
  }
}

function typeMatches(node: Record<string, unknown>): boolean {
  const raw = node["@type"];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((t) => typeof t === "string" && CAMPSITE_TYPES.has(t.toLowerCase()));
}

/**
 * Extract every schema.org LodgingBusiness/Campground-shaped node from a
 * page's <script type="application/ld+json"> blocks. This is the
 * "structured data" extraction path from PLAN.md §5 point 2 — it reads
 * markup sites publish for SEO rather than reverse-engineering page HTML,
 * which is both more stable and less invasive than CSS-selector scraping.
 */
export function extractLodgingNodes(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const nodes: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed JSON-LD on the page — skip, don't fail the whole run
    }
    for (const node of walkNodes(parsed)) {
      if (typeMatches(node)) nodes.push(node);
    }
  });

  return nodes;
}
