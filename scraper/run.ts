import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsonldAdapter, fetchAndExtractOne } from "./adapters/jsonld-adapter";
import { jsonldListingAdapter } from "./adapters/jsonld-listing-adapter";
import { sitemapAdapter } from "./adapters/sitemap-adapter";
import {
  ensureTownAggregates,
  fieldCompleteness,
  getFocusedCountryUrls,
  hasFirestoreCredentials,
  incrementScrapedCount,
  markIndexEntriesScraped,
  upsertSitemapIndex,
  writeAdapterHealthToFirestore,
  writeRecordsToFirestore,
} from "./lib/firestore";
import { politeFetch, RobotsDisallowedError } from "./lib/politeFetch";
import { extractSitemapUrls } from "./lib/sitemap";
import { parseEurocampingsEntry } from "./lib/sitemapIndex";
import { focusedCountries, sitemapIndexSources, sources } from "./sources.config";
import type { AdapterResult, ScrapedCampsite, SourceAdapter, SourceAdapterHealth } from "./types";

const adaptersById: Record<string, SourceAdapter> = {
  jsonld: jsonldAdapter,
  "jsonld-listing": jsonldListingAdapter,
  sitemap: sitemapAdapter,
};

const parsersById: Record<string, typeof parseEurocampingsEntry> = {
  eurocampings: parseEurocampingsEntry,
};

const OUTPUT_DIR = path.join(__dirname, "output");

/** Index step of the discover/focus split — see FocusedCountry in types.ts. */
async function runIndexing(): Promise<void> {
  if (sitemapIndexSources.length === 0) return;
  if (!hasFirestoreCredentials()) {
    console.log("Skipping sitemap indexing (no FIREBASE_SERVICE_ACCOUNT_KEY) — index lives in Firestore.");
    return;
  }

  for (const indexSource of sitemapIndexSources) {
    const parse = parsersById[indexSource.parser];
    console.log(`  [index:${indexSource.id}] fetching sitemap...`);
    try {
      const res = await politeFetch(indexSource.url);
      if (!res.ok) {
        console.warn(`  [index:${indexSource.id}] HTTP ${res.status} fetching ${indexSource.url}`);
        continue;
      }
      const xml = await res.text();
      const urls = extractSitemapUrls(xml);
      const entries = urls.map(parse).filter((e) => e !== null);
      const { added, skipped, addedEntries } = await upsertSitemapIndex(entries);
      console.log(
        `  [index:${indexSource.id}] ${urls.length} URL(s) in sitemap, ${added} newly indexed, ${skipped} already known`,
      );

      if (addedEntries.length > 0) {
        console.log(
          `  [index:${indexSource.id}] geocoding new towns for map placeholders (1 req/sec, this can take a while on a big first run)...`,
        );
        await ensureTownAggregates(addedEntries);
        console.log(`  [index:${indexSource.id}] town aggregates updated`);
      }
    } catch (err) {
      console.warn(`  [index:${indexSource.id}] indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Focus step: for each country actively being built out, scrape full
 * details for up to maxItems indexed-but-unscraped URLs. Every discovered
 * URL still goes through fetchAndExtractOne's own politeFetch/robots.txt
 * check — indexing only recorded that the URL exists, not that it's safe
 * to fetch.
 */
async function runFocusedCountries(): Promise<ScrapedCampsite[]> {
  if (focusedCountries.length === 0) return [];
  if (!hasFirestoreCredentials()) {
    console.log("Skipping focused-country scraping (no FIREBASE_SERVICE_ACCOUNT_KEY) — index lives in Firestore.");
    return [];
  }

  const records: ScrapedCampsite[] = [];

  for (const focus of focusedCountries) {
    const dataSource = `eurocampings-focus-${focus.country}`;
    const entries = await getFocusedCountryUrls(focus.country, focus.maxItems);
    if (entries.length === 0) {
      console.log(`  [focus:${focus.country}] nothing indexed-but-unscraped left`);
      continue;
    }

    console.log(`  [focus:${focus.country}] scraping ${entries.length} indexed URL(s)...`);
    const attemptedIds: string[] = [];
    for (const entry of entries) {
      attemptedIds.push(entry.id);
      try {
        const { record, issue } = await fetchAndExtractOne(entry.url, dataSource);
        if (record) records.push(record);
        if (issue) console.warn(`  [focus:${focus.country}] ${issue}`);
      } catch (err) {
        const message =
          err instanceof RobotsDisallowedError
            ? err.message
            : `fetch failed for ${entry.url}: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`  [focus:${focus.country}] ${message}`);
      } finally {
        // Count every *attempt* toward the town's scrapedCount, not just
        // successes — markIndexEntriesScraped below marks this URL scraped
        // (never retried) either way, so a dead link/no-JSON-LD page that
        // only incremented on success would permanently inflate its town's
        // placeholder count: counted in totalCount forever, never
        // subtracted, so the placeholder could never reach zero even once
        // every *scrapable* campsite in that town succeeded.
        await incrementScrapedCount(focus.country, entry.region, entry.town);
      }
    }
    // Mark every attempted URL scraped regardless of outcome — a dead/broken
    // link in the sitemap should fail once, not retry forever.
    await markIndexEntriesScraped(attemptedIds);
    console.log(`  [focus:${focus.country}] ${records.length} record(s) this run`);
  }

  return records;
}

async function run(): Promise<void> {
  if (sources.length === 0 && sitemapIndexSources.length === 0 && focusedCountries.length === 0) {
    console.log(
      "No sources configured in scraper/sources.config.ts yet — nothing to scrape.\n" +
        "Add reviewed, robots.txt/ToS-compliant sources there first (see the file's header comment).",
    );
    return;
  }

  const results: AdapterResult[] = [];

  if (sources.length > 0) {
    console.log(`Running scraper over ${sources.length} source(s)...`);
    for (const source of sources) {
      const adapter = adaptersById[source.adapter];
      if (!adapter) {
        console.error(`Unknown adapter "${source.adapter}" for source "${source.id}" — skipping.`);
        continue;
      }
      console.log(`  [${source.id}] fetching via ${adapter.id} adapter...`);
      const result = await adapter.fetchListing(source);
      for (const issue of result.issues) console.warn(`  [${source.id}] ${issue.message}`);
      console.log(`  [${source.id}] ${result.records.length} record(s)`);
      results.push(result);
    }
  }

  console.log("Indexing sitemaps...");
  await runIndexing();

  console.log("Scraping focused countries...");
  const focusedRecords = await runFocusedCountries();

  const allRecords: ScrapedCampsite[] = [...results.flatMap((r) => r.records), ...focusedRecords];
  const health: SourceAdapterHealth[] = results.map((r) => ({
    sourceId: r.sourceId,
    adapter: r.adapter,
    lastRunAt: r.fetchedAt,
    success: r.issues.length === 0,
    recordCount: r.records.length,
    fieldCompleteness: fieldCompleteness(r.records),
    errors: r.issues.map((i) => i.message),
  }));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, "campsites.json"),
    JSON.stringify(allRecords, null, 2),
  );
  await writeFile(
    path.join(OUTPUT_DIR, "run-log.json"),
    JSON.stringify(health, null, 2),
  );
  console.log(
    `Wrote ${allRecords.length} record(s) to scraper/output/campsites.json ` +
      `and health to scraper/output/run-log.json.`,
  );

  if (hasFirestoreCredentials()) {
    console.log("FIREBASE_SERVICE_ACCOUNT_KEY set — writing to Firestore...");
    await writeRecordsToFirestore(allRecords);
    await writeAdapterHealthToFirestore(results);
    console.log("Firestore write complete.");
  } else {
    console.log(
      "FIREBASE_SERVICE_ACCOUNT_KEY not set — skipped Firestore write, local JSON only.",
    );
  }
}

run().catch((err) => {
  console.error("Scraper run failed:", err);
  process.exitCode = 1;
});
