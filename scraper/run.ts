import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsonldAdapter } from "./adapters/jsonld-adapter";
import { jsonldListingAdapter } from "./adapters/jsonld-listing-adapter";
import {
  fieldCompleteness,
  hasFirestoreCredentials,
  writeAdapterHealthToFirestore,
  writeRecordsToFirestore,
} from "./lib/firestore";
import { sources } from "./sources.config";
import type { AdapterResult, ScrapedCampsite, SourceAdapter, SourceAdapterHealth } from "./types";

const adaptersById: Record<string, SourceAdapter> = {
  jsonld: jsonldAdapter,
  "jsonld-listing": jsonldListingAdapter,
};

const OUTPUT_DIR = path.join(__dirname, "output");

async function run(): Promise<void> {
  if (sources.length === 0) {
    console.log(
      "No sources configured in scraper/sources.config.ts yet — nothing to scrape.\n" +
        "Add reviewed, robots.txt/ToS-compliant sources there first (see the file's header comment).",
    );
    return;
  }

  console.log(`Running scraper over ${sources.length} source(s)...`);
  const results: AdapterResult[] = [];

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

  const allRecords: ScrapedCampsite[] = results.flatMap((r) => r.records);
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
