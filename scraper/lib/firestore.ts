import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { AdapterResult, ScrapedCampsite, SourceAdapterHealth } from "../types";

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
    const campsiteRef = db.collection("campsites").doc(record.slug);
    // campsiteFields already carries `lastScrapedAt` — see the field-name
    // note on ScrapedCampsite in scraper/types.ts. Don't add a second
    // "when was this written" field under a different name.
    batch.set(campsiteRef, campsiteFields, { merge: true });
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
