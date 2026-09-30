import { backfillTownAggregates, hasFirestoreCredentials } from "./lib/firestore";

async function main(): Promise<void> {
  if (!hasFirestoreCredentials()) {
    console.log("FIREBASE_SERVICE_ACCOUNT_KEY not set — backfill needs Firestore, nothing to do.");
    return;
  }
  console.log("Backfilling town_aggregates from the full existing campsite_index...");
  await backfillTownAggregates();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exitCode = 1;
});
