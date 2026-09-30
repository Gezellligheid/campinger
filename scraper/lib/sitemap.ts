/**
 * Extract <loc> URLs from a sitemap XML document, optionally scoped to a
 * path prefix (e.g. restricting a multi-country sitemap to one country).
 * A regex is enough here — sitemap XML is simple/flat and this avoids
 * pulling in a full XML parser dependency for one tag.
 */
export function extractSitemapUrls(xml: string, prefix?: string): string[] {
  const urls: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const url = match[1].trim();
    if (!prefix || url.startsWith(prefix)) urls.push(url);
  }
  return urls;
}
