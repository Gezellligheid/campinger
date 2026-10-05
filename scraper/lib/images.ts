import * as cheerio from "cheerio";
import { politeFetch, RobotsDisallowedError } from "./politeFetch";

const JUNK_PATTERN = /logo|icon|sprite|favicon|pixel|spacer|placeholder|avatar/i;
const MIN_DIMENSION = 100;

function isLikelyJunk(src: string, width?: string, height?: string): boolean {
  const lower = src.toLowerCase();
  if (lower.startsWith("data:")) return true;
  if (lower.endsWith(".svg")) return true;
  if (JUNK_PATTERN.test(lower)) return true;
  const w = Number(width);
  const h = Number(height);
  if ((Number.isFinite(w) && w > 0 && w < MIN_DIMENSION) || (Number.isFinite(h) && h > 0 && h < MIN_DIMENSION)) {
    return true;
  }
  return false;
}

/**
 * Best-effort "first few decent photos" from a campsite's own homepage —
 * for OSM-sourced records, which have no imagery of their own (OSM doesn't
 * host campsite photos, just tags). Prefers the page's own
 * og:image/twitter:image (what the site itself picked as its representative
 * preview photo — the same mechanism Slack/iMessage/etc. link previews use)
 * before falling back to scanning <img> tags, filtering out obvious
 * non-photos (logos, icons, tracking pixels, tiny thumbnails). Routed
 * through politeFetch like every other fetch in this scraper — robots.txt-
 * gated per site, rate-limited, honestly identified via USER_AGENT.
 */
export async function fetchPreviewImages(pageUrl: string, max = 3): Promise<string[]> {
  let html: string;
  try {
    const res = await politeFetch(pageUrl);
    if (!res.ok) return [];
    html = await res.text();
  } catch (err) {
    if (err instanceof RobotsDisallowedError) return [];
    throw err;
  }

  const $ = cheerio.load(html);
  const candidates: string[] = [];

  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
    const content = $(el).attr("content");
    if (content) candidates.push(content);
  });

  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src");
    if (!src || isLikelyJunk(src, $(el).attr("width"), $(el).attr("height"))) return;
    candidates.push(src);
  });

  const resolved = candidates
    .map((src) => {
      try {
        return new URL(src, pageUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => url !== null);

  return [...new Set(resolved)].slice(0, max);
}
