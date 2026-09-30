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

const EUROCAMPINGS_HOST_RE = /(^|\.)eurocampings\.(nl|co\.uk)$/;

/**
 * eurocampings.nl detail URLs end in `<slug>-<numeric id>/`
 * (e.g. `camping-17-duinzicht-113225/`) — pull that id out so we can
 * construct the same outbound link eurocampings.nl's own "Bezoek
 * campingwebsite" button uses, without fetching the page a second time.
 * Scoped to eurocampings.nl/.co.uk hosts so it can't misfire on some other
 * source's URL that happens to end in digits.
 */
export function extractEurocampingsCampsiteId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!EUROCAMPINGS_HOST_RE.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

/**
 * Build the ACSI cost-per-click redirect that eurocampings.nl's own "Bezoek
 * campingwebsite" button links to — it resolves (via an ACSI/Eurocampings-
 * branded interstitial, confirmed by hand 2026-10-01) straight to the
 * campsite's real own site, e.g. camping-17-duinzicht-113225 ->
 * https://www.campingduinzicht.be/.
 *
 * This is the same `/cpc/out/` path eurocampings.nl's robots.txt disallows
 * for crawlers (see sources.config.ts's compliance note) — so the scraper
 * itself never fetches or follows it. This function only *constructs* the
 * URL from the campsite id (public in the page URL we already fetched) to
 * use as an href for a real visitor's browser to click, exactly how
 * eurocampings.nl uses it on its own page. Note this does route the click
 * through ACSI's own paid/tracked affiliate redirect, which we have no
 * agreement with them about — accepted tradeoff, chat 2026-10-01.
 */
export function buildEurocampingsBookingUrl(sourceUrl: string): string | null {
  const id = extractEurocampingsCampsiteId(sourceUrl);
  if (!id) return null;
  return `https://cpc.acsi.eu/eurocampings/nl/cpc/out/${id}/EXTERNALLINK_DETAIL_BOTTOM/`;
}
