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
 * Some Next.js App Router sites (e.g. eurocampings.nl) don't render
 * `<script type="application/ld+json">` as a literal tag in the initial
 * HTML — they ship it inside an RSC boot payload as
 * `(self.__next_s=self.__next_s||[]).push([0,{"type":"application/ld+json",
 * "children":"<escaped JSON string>"}])`, which the framework turns into a
 * real script tag only after client-side hydration. Cheerio never sees a
 * script tag to select in that case, so pull the escaped `children` string
 * straight out of the raw HTML instead.
 */
function extractStreamedLdJson(html: string): unknown[] {
  const re = /"type":"application\/ld\+json","children":"((?:\\.|[^"\\])*)"/g;
  const results: unknown[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const unescaped = JSON.parse(`"${match[1]}"`);
      results.push(JSON.parse(unescaped));
    } catch {
      // malformed/partial match — skip, don't fail the whole run
    }
  }
  return results;
}

/**
 * Parse every JSON-LD blob on a page, however it's delivered (a plain
 * <script type="application/ld+json"> tag, or streamed via Next.js's RSC
 * boot payload — see extractStreamedLdJson). Shared by both node-type
 * extraction (extractLodgingNodes) and listing-URL extraction
 * (extractListingUrls) below.
 */
function parseAllJsonLdBlobs(html: string): unknown[] {
  const $ = cheerio.load(html);
  const blobs: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    try {
      blobs.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD on the page — skip, don't fail the whole run
    }
  });

  blobs.push(...extractStreamedLdJson(html));

  return blobs;
}

/**
 * Extract every schema.org LodgingBusiness/Campground-shaped node from a
 * page's JSON-LD. This is the "structured data" extraction path from
 * PLAN.md §5 point 2 — it reads markup sites publish for SEO rather than
 * reverse-engineering page HTML, which is both more stable and less
 * invasive than CSS-selector scraping.
 */
export function extractLodgingNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const blob of parseAllJsonLdBlobs(html)) {
    for (const node of walkNodes(blob)) {
      if (typeMatches(node)) nodes.push(node);
    }
  }
  return nodes;
}

/**
 * Extract candidate detail-page URLs from a directory/search-results page's
 * schema.org ItemList JSON-LD (`itemListElement[].item.url`, falling back
 * to `itemListElement[].url` for the less common flattened shape). Feeds
 * the "jsonld-listing" adapter's discovery step.
 */
export function extractListingUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  for (const blob of parseAllJsonLdBlobs(html)) {
    for (const node of walkNodes(blob)) {
      const raw = node["@type"];
      const types = Array.isArray(raw) ? raw : [raw];
      if (!types.some((t) => typeof t === "string" && t.toLowerCase() === "itemlist")) continue;

      const elements = node["itemListElement"];
      const items = Array.isArray(elements) ? elements : elements ? [elements] : [];
      for (const el of items) {
        if (!el || typeof el !== "object") continue;
        const listItem = el as Record<string, unknown>;
        const item = listItem["item"];
        const url =
          (item && typeof item === "object" ? (item as Record<string, unknown>)["url"] : undefined) ??
          listItem["url"];
        if (typeof url === "string" && url.trim()) {
          try {
            urls.add(new URL(url, baseUrl).toString());
          } catch {
            // malformed URL — skip
          }
        }
      }
    }
  }
  return [...urls];
}
