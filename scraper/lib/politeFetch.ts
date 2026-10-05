import { isAllowedByRobots } from "./robots";

/**
 * Identify ourselves honestly and give operators a way to reach us, per
 * PLAN.md §2's "always disclose the source" / good-citizen scraping stance.
 * Override via SCRAPER_CONTACT_URL if the project gets a real contact page.
 */
export const USER_AGENT = `CampingerBot/0.1 (+${
  process.env.SCRAPER_CONTACT_URL ?? "https://github.com/campinger/campinger"
})`;

const MIN_DELAY_MS = Number(process.env.SCRAPER_MIN_DELAY_MS ?? 2000);
const lastRequestAtByHost = new Map<string, number>();

function hostOf(url: string): string {
  return new URL(url).host;
}

async function waitForTurn(host: string): Promise<void> {
  const last = lastRequestAtByHost.get(host) ?? 0;
  const wait = last + MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAtByHost.set(host, Date.now());
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows fetching ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

const FETCH_TIMEOUT_MS = 15000;

/**
 * fetch() wrapper that enforces robots.txt and a per-host politeness delay.
 * Every adapter must route outbound requests through this, not raw fetch.
 * Timeout matters more now than it used to: OSM's image-fetch step
 * (scraper/lib/images.ts) hits hundreds of arbitrary third-party campsite
 * websites per run, not just a handful of manually-reviewed sources — a
 * single slow/hanging one shouldn't stall the whole run.
 */
export async function politeFetch(url: string): Promise<Response> {
  if (!(await isAllowedByRobots(url, USER_AGENT))) {
    throw new RobotsDisallowedError(url);
  }
  await waitForTurn(hostOf(url));
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}
