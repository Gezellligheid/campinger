import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { AdapterResult, ScrapedCampsite, SourceAdapterHealth } from "../types";
import { townSlug, type SitemapIndexEntry } from "./sitemapIndex";
import { geocodeTown } from "./geocode";

/**
 * Firestore writes are optional: only attempted when a service-account key
 * is configured, per infrastructure.md §5 (Admin SDK creds as a CI secret).
 * Without it, run.ts just writes local JSON so the pipeline is still
 * runnable/testable end-to-end.
 */
export function hasFirestoreCredentials(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

/**
 * Upserts campsites (by slug) and appends price snapshots, matching the
 * `campsites` / `price_snapshots` collections from infrastructure.md §6.
 */
export async function writeRecordsToFirestore(records: ScrapedCampsite[]): Promise<void> {
  const db = getDb();
  let batch = db.batch();
  let opsInBatch = 0;

  const flushIfNeeded = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const record of records) {
    const { priceSnapshots, ...campsiteFields } = record;
    // A blank heroImage/gallery on this record might just mean this run
    // didn't attempt to find one (e.g. OSM's per-run image-fetch budget —
    // see runOsmCountries in run.ts), not that there isn't one. A `merge:
    // true` write still overwrites a field if it's present with any value,
    // including null/[], so a previously-found image would get silently
    // wiped on a run that didn't re-fetch it. Omit the keys instead of
    // writing a blank, so merge leaves whatever was already there alone.
    const fields: Record<string, unknown> = { ...campsiteFields };
    if (!fields.heroImage) delete fields.heroImage;
    if (Array.isArray(fields.gallery) && fields.gallery.length === 0) delete fields.gallery;

    const campsiteRef = db.collection("campsites").doc(record.slug);
    // campsiteFields already carries `lastScrapedAt` — see the field-name
    // note on ScrapedCampsite in scraper/types.ts. Don't add a second
    // "when was this written" field under a different name.
    batch.set(campsiteRef, fields, { merge: true });
    opsInBatch++;
    await flushIfNeeded();

    for (const snapshot of priceSnapshots) {
      const snapshotRef = campsiteRef.collection("price_snapshots").doc();
      batch.set(snapshotRef, snapshot);
      opsInBatch++;
      await flushIfNeeded();
    }
  }

  if (opsInBatch > 0) await batch.commit();
}

export async function writeAdapterHealthToFirestore(results: AdapterResult[]): Promise<void> {
  const db = getDb();
  const batch = db.batch();

  for (const result of results) {
    const health: SourceAdapterHealth = {
      sourceId: result.sourceId,
      adapter: result.adapter,
      lastRunAt: result.fetchedAt,
      success: result.issues.length === 0,
      recordCount: result.records.length,
      fieldCompleteness: fieldCompleteness(result.records),
      errors: result.issues.map((i) => i.message),
    };
    batch.set(db.collection("source_adapters").doc(result.sourceId), health, { merge: true });
  }

  await batch.commit();
}

const INDEX_COLLECTION = "campsite_index";

function slugFromUrl(url: string): string {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? url;
}

const INDEX_META_COLLECTION = "campsite_index_meta";
const KNOWN_IDS_DOC = "known_ids";

/**
 * Cheap-discovery / expensive-scrape split (per the "focus" design): record
 * every URL a sitemap lists, tagged with country/region, WITHOUT visiting
 * any of them yet. Entries already in the index are left untouched (no
 * write at all) so this never resets an entry's `scraped` progress — only
 * genuinely new URLs get created, with `scraped: false`.
 *
 * Membership ("is this URL already indexed?") is checked against a single
 * manifest doc (`campsite_index_meta/known_ids`, one `ids` array field)
 * instead of querying `campsite_index` itself. The previous approach ran
 * one `.where("country","==",country).select().get()` per distinct country
 * in the sitemap (effectively every country eurocampings.nl covers) — since
 * nearly everything is already indexed after the first run, that re-read
 * close to the *entire* collection, every single run, growing without
 * bound (~9,700+ reads/run once fully indexed). Reading one manifest doc
 * instead is O(1) regardless of index size.
 */
export async function upsertSitemapIndex(
  entries: SitemapIndexEntry[],
): Promise<{ added: number; skipped: number; addedEntries: SitemapIndexEntry[] }> {
  const db = getDb();
  const collection = db.collection(INDEX_COLLECTION);
  const metaRef = db.collection(INDEX_META_COLLECTION).doc(KNOWN_IDS_DOC);

  const metaDoc = await metaRef.get();
  let knownIds: Set<string>;
  if (metaDoc.exists) {
    knownIds = new Set<string>((metaDoc.data()?.["ids"] as string[] | undefined) ?? []);
  } else {
    // First run after this manifest existed: seed it from whatever's
    // already in campsite_index so we don't treat already-indexed entries
    // as new (which would reset their `scraped` progress). One-time cost —
    // every run after this one only reads the manifest doc.
    const fullSnap = await collection.select().get();
    knownIds = new Set(fullSnap.docs.map((d) => d.id));
    await metaRef.set({ ids: [...knownIds] });
  }

  const discoveredAt = new Date().toISOString();
  let batch = db.batch();
  let opsInBatch = 0;
  const addedEntries: SitemapIndexEntry[] = [];
  const addedIds: string[] = [];

  const flushIfNeeded = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const entry of entries) {
    const id = slugFromUrl(entry.url);
    if (knownIds.has(id)) continue;
    batch.set(collection.doc(id), { ...entry, scraped: false, discoveredAt });
    addedEntries.push(entry);
    addedIds.push(id);
    opsInBatch++;
    await flushIfNeeded();
  }
  if (opsInBatch > 0) await batch.commit();

  if (addedIds.length > 0) {
    // Comfortably under Firestore's 1MiB doc limit at today's scale (~9.7k
    // ids * ~30 chars ~= 290KB) — revisit (shard by country, say) if the
    // index grows past roughly 25-30k entries.
    await metaRef.set({ ids: FieldValue.arrayUnion(...addedIds) }, { merge: true });
  }

  return { added: addedEntries.length, skipped: entries.length - addedEntries.length, addedEntries };
}

const TOWN_AGGREGATE_COLLECTION = "town_aggregates";
const GEOCODE_CACHE_COLLECTION = "geocode_cache";

/**
 * For newly-indexed entries, ensure their town has a geocoded position and
 * bump that town's `totalCount` — the data behind the map's placeholder
 * markers for campsites that are known (from the sitemap) but not yet
 * fully scraped. Geocoding only happens once per unique town (cached in
 * `geocode_cache`); re-running with the same towns costs no extra Nominatim
 * requests.
 */
export async function ensureTownAggregates(entries: SitemapIndexEntry[]): Promise<void> {
  const db = getDb();
  const byTown = new Map<string, { country: string; region: string | null; town: string | null; count: number }>();

  for (const entry of entries) {
    const slug = townSlug(entry.country, entry.region, entry.town);
    const existing = byTown.get(slug);
    if (existing) {
      existing.count++;
    } else {
      byTown.set(slug, { country: entry.country, region: entry.region, town: entry.town, count: 1 });
    }
  }

  console.log(`    ${byTown.size} distinct town(s) among ${entries.length} newly indexed entr(y/ies)`);
  let processed = 0;
  let geocodedFresh = 0;

  for (const [slug, group] of byTown) {
    const geocodeRef = db.collection(GEOCODE_CACHE_COLLECTION).doc(slug);
    let geocodeDoc = await geocodeRef.get();

    if (!geocodeDoc.exists) {
      const result = await geocodeTown(group.country, group.region, group.town);
      geocodedFresh++;
      if (!result) continue; // couldn't geocode this town — skip its aggregate, don't block others
      await geocodeRef.set({ ...result, geocodedAt: new Date().toISOString() });
      geocodeDoc = await geocodeRef.get();
    }

    processed++;
    if (processed % 25 === 0) {
      console.log(`    ...${processed}/${byTown.size} towns processed (${geocodedFresh} freshly geocoded)`);
    }

    const geocode = geocodeDoc.data() as { lat: number; lng: number } | undefined;
    if (!geocode) continue;

    const aggregateRef = db.collection(TOWN_AGGREGATE_COLLECTION).doc(slug);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(aggregateRef);
      const current = doc.data() as { totalCount?: number; scrapedCount?: number } | undefined;
      tx.set(
        aggregateRef,
        {
          country: group.country,
          region: group.region,
          town: group.town,
          lat: geocode.lat,
          lng: geocode.lng,
          totalCount: (current?.totalCount ?? 0) + group.count,
          scrapedCount: current?.scrapedCount ?? 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    });
  }
}

/** Called after a focus run actually scrapes a campsite — moves it from "known" to "loaded" in its town's aggregate. */
export async function incrementScrapedCount(
  country: string,
  region: string | null,
  town: string | null,
): Promise<void> {
  const db = getDb();
  const slug = townSlug(country, region, town);
  const aggregateRef = db.collection(TOWN_AGGREGATE_COLLECTION).doc(slug);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(aggregateRef);
    if (!doc.exists) return; // no aggregate (e.g. town failed to geocode) — nothing to update
    const current = doc.data() as { scrapedCount?: number };
    tx.set(aggregateRef, { scrapedCount: (current.scrapedCount ?? 0) + 1 }, { merge: true });
  });
}

/**
 * Up to `limit` not-yet-scraped indexed URLs for one country. Used to read
 * every doc for the country (often thousands, e.g. ~2,865 for France) and
 * filter `scraped === false` in JS to dodge a composite-index requirement —
 * that meant reading the whole country's index every run no matter how
 * small `limit` is. Querying `scraped` directly needs a composite index on
 * (country, scraped); Firestore will print a one-click console link to
 * create it the first time this runs without one.
 */
export async function getFocusedCountryUrls(
  country: string,
  limit: number,
): Promise<{ id: string; url: string; region: string | null; town: string | null }[]> {
  const db = getDb();
  const snap = await db
    .collection(INDEX_COLLECTION)
    .where("country", "==", country)
    .where("scraped", "==", false)
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      url: data["url"] as string,
      region: (data["region"] as string | null) ?? null,
      town: (data["town"] as string | null) ?? null,
    };
  });
}

export async function markIndexEntriesScraped(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const scrapedAt = new Date().toISOString();
  let batch = db.batch();
  let opsInBatch = 0;

  for (const id of ids) {
    batch.set(db.collection(INDEX_COLLECTION).doc(id), { scraped: true, scrapedAt }, { merge: true });
    opsInBatch++;
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
}

/**
 * One-time backfill for entries indexed *before* town aggregation existed
 * — ensureTownAggregates only ever processes newly-discovered entries, so
 * anything already in campsite_index from an earlier run never got
 * geocoded/aggregated on its own. Recomputes totalCount/scrapedCount from
 * a fresh count of the FULL index each time (not an increment), so unlike
 * ensureTownAggregates this is safe to re-run without double-counting.
 */
export async function backfillTownAggregates(): Promise<void> {
  const db = getDb();
  const snap = await db.collection(INDEX_COLLECTION).get();

  const byTown = new Map<
    string,
    { country: string; region: string | null; town: string | null; total: number; scraped: number }
  >();
  for (const doc of snap.docs) {
    const data = doc.data();
    const slug = townSlug(data.country, data.region ?? null, data.town ?? null);
    const existing = byTown.get(slug);
    if (existing) {
      existing.total++;
      if (data.scraped === true) existing.scraped++;
    } else {
      byTown.set(slug, {
        country: data.country,
        region: data.region ?? null,
        town: data.town ?? null,
        total: 1,
        scraped: data.scraped === true ? 1 : 0,
      });
    }
  }

  console.log(`  [backfill] ${byTown.size} distinct town(s) across ${snap.size} indexed entries`);
  let processed = 0;
  let geocodedFresh = 0;

  for (const [slug, group] of byTown) {
    const geocodeRef = db.collection(GEOCODE_CACHE_COLLECTION).doc(slug);
    let geocodeDoc = await geocodeRef.get();

    if (!geocodeDoc.exists) {
      const result = await geocodeTown(group.country, group.region, group.town);
      geocodedFresh++;
      if (result) {
        await geocodeRef.set({ ...result, geocodedAt: new Date().toISOString() });
        geocodeDoc = await geocodeRef.get();
      }
    }

    const geocode = geocodeDoc.data() as { lat: number; lng: number } | undefined;
    if (geocode) {
      await db
        .collection(TOWN_AGGREGATE_COLLECTION)
        .doc(slug)
        .set(
          {
            country: group.country,
            region: group.region,
            town: group.town,
            lat: geocode.lat,
            lng: geocode.lng,
            totalCount: group.total,
            scrapedCount: group.scraped,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
    }

    processed++;
    if (processed % 25 === 0) {
      console.log(`  [backfill] ...${processed}/${byTown.size} towns processed (${geocodedFresh} freshly geocoded)`);
    }
  }
  console.log(`  [backfill] done — ${processed} town(s) processed, ${geocodedFresh} freshly geocoded`);
}

export function fieldCompleteness(records: ScrapedCampsite[]): number {
  if (records.length === 0) return 0;
  const keyFields: (keyof ScrapedCampsite)[] = [
    "country",
    "region",
    "lat",
    "lng",
    "description",
    "heroImage",
  ];
  let filled = 0;
  for (const record of records) {
    for (const field of keyFields) {
      if (record[field] !== null && record[field] !== undefined) filled++;
    }
  }
  return filled / (records.length * keyFields.length);
}
