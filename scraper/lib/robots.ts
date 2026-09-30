/**
 * Minimal robots.txt fetcher/checker. Per PLAN.md §2, every source must be
 * checked for crawl permission before we scrape it — this is that gate,
 * applied unconditionally by every adapter (not opt-in per source).
 */

interface RobotsRule {
  disallow: string[];
  allow: string[];
}

const robotsCache = new Map<string, Promise<RobotsRule>>();

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

function parseRobotsTxt(text: string, userAgent: string): RobotsRule {
  const lines = text.split(/\r?\n/);
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(":");
    if (!rawField || rest.length === 0) continue;
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (field === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "disallow" && current) {
      current.disallow.push(value);
    } else if (field === "allow" && current) {
      current.allow.push(value);
    }
  }

  const ua = userAgent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const chosen = specific ?? wildcard;

  return {
    disallow: chosen?.disallow.filter((p) => p !== "") ?? [],
    allow: chosen?.allow.filter((p) => p !== "") ?? [],
  };
}

async function getRobotsRules(url: string, userAgent: string): Promise<RobotsRule> {
  const origin = originOf(url);
  const cacheKey = `${origin}::${userAgent}`;
  let pending = robotsCache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, {
          headers: { "User-Agent": userAgent },
        });
        if (!res.ok) return { disallow: [], allow: [] };
        const text = await res.text();
        return parseRobotsTxt(text, userAgent);
      } catch {
        // Network failure fetching robots.txt: fail closed (treat as disallowed)
        // rather than assume permission.
        return { disallow: ["/"], allow: [] };
      }
    })();
    robotsCache.set(cacheKey, pending);
  }
  return pending;
}

function matchesRule(path: string, pattern: string): number {
  // robots.txt prefix match; longest match wins per the de-facto spec.
  if (pattern === "") return -1;
  return path.startsWith(pattern) ? pattern.length : -1;
}

export async function isAllowedByRobots(url: string, userAgent: string): Promise<boolean> {
  const { pathname } = new URL(url);
  const { disallow, allow } = await getRobotsRules(url, userAgent);

  let bestDisallow = -1;
  for (const p of disallow) bestDisallow = Math.max(bestDisallow, matchesRule(pathname, p));
  let bestAllow = -1;
  for (const p of allow) bestAllow = Math.max(bestAllow, matchesRule(pathname, p));

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}
