/**
 * eurocampings.nl-specific extraction for data that isn't in the page's
 * schema.org JSON-LD block at all. "Richtprijs 1"/"Richtprijs 2" (a guide
 * price per pitch per night in high season, incl. 2 adults) are server-
 * rendered as plain HTML text next to their label — confirmed via a direct
 * curl of a detail page (no JS execution needed, so no headless browser is
 * required here). Runs as a harmless no-op on any other source's HTML,
 * since the label text won't be present.
 */
function extractPrice(html: string, label: string): number | null {
  const idx = html.indexOf(`>${label}<`);
  if (idx === -1) return null;
  // The label's price sits within ~300 chars in the markup seen so far;
  // capped well short of that so we can't accidentally pick up the next
  // label's price (e.g. "Richtprijs 1" bleeding into "Richtprijs 2").
  const window = html.slice(idx, idx + 250);
  const match = window.match(/€\s*([0-9]+(?:[.,][0-9]+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function extractEurocampingsGuidePrice(
  html: string,
): { low: number; high: number; currency: string } | null {
  const prices = [extractPrice(html, "Richtprijs 1"), extractPrice(html, "Richtprijs 2")].filter(
    (n): n is number => n !== null,
  );
  if (prices.length === 0) return null;
  return { low: Math.min(...prices), high: Math.max(...prices), currency: "EUR" };
}

/**
 * Pull the real `data-link` href off eurocampings.nl's own "Bezoek
 * campingwebsite" button, when the page renders one at all — e.g.
 * `data-link="https://cpc.acsi.eu/eurocampings/nl/cpc/out/113225/
 * EXTERNALLINK_DETAIL_TOP/"`. This is the same ACSI cost-per-click redirect
 * that resolves (via an ACSI/Eurocampings-branded interstitial) to the
 * campsite's own real site, confirmed by hand 2026-10-01.
 *
 * Earlier this constructed that URL ourselves from the campsite id in the
 * page URL, assuming it'd work for every campsite — it doesn't. Spot-
 * checking by hand found a case (Floreal Gossaimont, id 117778 — no button
 * shown on its own page) where the constructed link 404s on ACSI's side
 * instead of redirecting anywhere. Scraping the literal `data-link` instead
 * means we only ever offer this link when eurocampings.nl's own page
 * vouches for it as clickable — not a guarantee every such link resolves,
 * but strictly more conservative than guessing for every campsite.
 *
 * This is still the same `/cpc/out/` path eurocampings.nl's robots.txt
 * disallows for crawlers (see sources.config.ts's compliance note), so the
 * scraper itself never fetches or follows it — only extracts the href
 * already sitting in HTML it fetched for other reasons, for a real
 * visitor's browser to follow later. Routing the click through ACSI's own
 * paid/tracked affiliate redirect (no agreement with them about it) is an
 * accepted tradeoff — chat 2026-10-01.
 */
export function extractEurocampingsBookingLink(html: string): string | null {
  const match = html.match(/data-link="(https:\/\/cpc\.acsi\.eu\/[^"]+)"/);
  if (!match) return null;
  try {
    return new URL(match[1]).toString();
  } catch {
    return null;
  }
}
