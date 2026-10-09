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
 * Pick the best resolution URL out of a `srcset`/`data-srcset` value, e.g.
 * "img-400.jpg 400w, img-1600.jpg 1600w" or "img-1x.jpg 1x, img-2x.jpg 2x".
 * Picks the entry with the largest descriptor (width or density) — good
 * enough since sites use one convention or the other, not a meaningful mix.
 */
function pickLargestFromSrcset(srcset: string): string | null {
  let best: { url: string; score: number } | null = null;
  for (const raw of srcset.split(",")) {
    const [url, descriptor] = raw.trim().split(/\s+/);
    if (!url) continue;
    const score = descriptor ? parseFloat(descriptor) : 0;
    if (!best || (Number.isFinite(score) && score > best.score)) {
      best = { url, score: Number.isFinite(score) ? score : 0 };
    }
  }
  return best?.url ?? null;
}

/**
 * Many sites lazy-load images: the real photo only loads via JS after the
 * page renders, so the static `src` in the HTML we fetch is often a tiny
 * blurred placeholder (sometimes a real-but-tiny file, not always a `data:`
 * URI, so isLikelyJunk's data: check alone doesn't catch it) — `data-src`/
 * `srcset`/`data-srcset` almost always hold the real image URL even before
 * any JS runs, so prefer those over plain `src` when present.
 */
function pickImgSrc($: cheerio.CheerioAPI, el: ReturnType<cheerio.CheerioAPI>[number]): string | null {
  const node = $(el);
  const srcset = node.attr("srcset") ?? node.attr("data-srcset");
  if (srcset) {
    const best = pickLargestFromSrcset(srcset);
    if (best) return best;
  }
  return node.attr("data-src") ?? node.attr("src") ?? null;
}

const MIN_IMAGE_BYTES = 15000; // logos/icons/thumbnails are almost always smaller; real photos aren't

/**
 * Confirms a candidate is a real-sized file via a HEAD request's
 * Content-Length — catches what HTML-attribute heuristics miss (including
 * og:image itself: some sites default it to their logo). Only rejects when
 * we positively know it's small; a failed HEAD or a server that doesn't
 * report Content-Length defaults to accepting rather than discarding a
 * possibly-good image over an unrelated network hiccup.
 */
async function isDecentSize(url: string): Promise<boolean> {
  try {
    const res = await politeFetch(url, { method: "HEAD" });
    if (!res.ok) return true;
    const len = Number(res.headers.get("content-length"));
    if (!Number.isFinite(len) || len <= 0) return true;
    return len >= MIN_IMAGE_BYTES;
  } catch {
    return true;
  }
}

/**
 * Best-effort "first few decent photos" from a campsite's own homepage —
 * for OSM-sourced records, which have no imagery of their own (OSM doesn't
 * host campsite photos, just tags). Prefers the page's own
 * og:image/twitter:image (what the site itself picked as its representative
 * preview photo — the same mechanism Slack/iMessage/etc. link previews use),
 * then falls back to scanning <img> tags, filtering out obvious non-photos
 * (logos, icons, tracking pixels, tiny thumbnails, lazy-load placeholders).
 * Every candidate — og:image included — is verified by real file size
 * before being accepted; see isDecentSize. Routed through politeFetch like
 * every other fetch in this scraper — robots.txt-gated per site, rate-
 * limited, honestly identified via USER_AGENT.
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
    const src = pickImgSrc($, el);
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

  const resolved = [
    ...new Set(
      candidates
        .map((src) => {
          try {
            return new URL(src, pageUrl).toString();
          } catch {
            return null;
          }
        })
        .filter((url): url is string => url !== null),
    ),
  ];

  const verified: string[] = [];
  for (const url of resolved) {
    if (verified.length >= max) break;
    if (await isDecentSize(url)) verified.push(url);
  }
  return verified;
}
