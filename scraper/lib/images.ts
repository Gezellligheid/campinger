import * as cheerio from "cheerio";
import { politeFetch, RobotsDisallowedError } from "./politeFetch";

// Broad on purpose: a missed icon costs nothing (we just skip to the next
// candidate), a missed photo costs a campsite showing a social/payment icon
// as its hero image — err toward excluding when unsure.
const JUNK_PATTERN =
  /logo|icon|sprite|favicon|pixel|spacer|placeholder|avatar|badge|button|arrow|chevron|star-|rating|banner|cookie|gdpr|menu|hamburger|search|cart|loading|spinner|marker|map-pin|social|share|facebook|instagram|twitter|youtube|linkedin|pinterest|whatsapp|tripadvisor|payment|visa|mastercard|paypal|flag-|lang-|svgrepo|flaticon|fontawesome|feathericon/i;
const MIN_DIMENSION = 200;

function isLikelyJunk(src: string, attrs: { width?: string; height?: string; class?: string; alt?: string }): boolean {
  const lower = src.toLowerCase();
  if (lower.startsWith("data:")) return true;
  if (lower.endsWith(".svg")) return true;
  if (JUNK_PATTERN.test(lower)) return true;
  if (attrs.class && JUNK_PATTERN.test(attrs.class)) return true;
  if (attrs.alt && JUNK_PATTERN.test(attrs.alt)) return true;

  const w = Number(attrs.width);
  const h = Number(attrs.height);
  const wOk = Number.isFinite(w) && w > 0;
  const hOk = Number.isFinite(h) && h > 0;
  if ((wOk && w < MIN_DIMENSION) || (hOk && h < MIN_DIMENSION)) return true;
  // Icons are almost always square; real photos rarely are — a small-ish
  // exact square is a strong icon signal even under MIN_DIMENSION alone.
  if (wOk && hOk && w === h && w <= 300) return true;

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

  // og:image/twitter:image are site-curated and far more reliable than
  // guessing from arbitrary <img> tags — only fall back to scanning the
  // page when those didn't already fill the quota.
  if (candidates.length < max) {
    $("img").each((_, el) => {
      const src = $(el).attr("src") ?? $(el).attr("data-src");
      if (!src) return;
      const attrs = {
        width: $(el).attr("width"),
        height: $(el).attr("height"),
        class: $(el).attr("class"),
        alt: $(el).attr("alt"),
      };
      if (isLikelyJunk(src, attrs)) return;
      candidates.push(src);
    });
  }

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
