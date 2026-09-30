import assert from "node:assert/strict";
import { extractLodgingNodes } from "./lib/jsonld";
import { normalizeLodgingNode } from "./lib/normalize";

/**
 * Offline smoke test for the JSON-LD extraction + normalization pipeline,
 * run against a local HTML fixture rather than a live third-party site —
 * validates the adapter logic without scraping anyone. Run with:
 *   npm run scrape:verify
 */

const FIXTURE_HTML = `
<html>
  <head>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Campground",
      "name": "Fixture Pines Campsite",
      "description": "A fixture campsite used to test the scraper.",
      "url": "https://example.com/fixture-pines",
      "image": ["https://example.com/fixture-pines/hero.jpg"],
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "France",
        "addressRegion": "Brittany"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 47.65,
        "longitude": -2.76
      },
      "petsAllowed": true,
      "amenityFeature": [
        { "@type": "LocationFeatureSpecification", "name": "Swimming Pool", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "Free WiFi", "value": true }
      ],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.6",
        "reviewCount": "312"
      },
      "makesOffer": {
        "@type": "Offer",
        "price": "24.00",
        "priceCurrency": "EUR",
        "validFrom": "2026-06-01",
        "validThrough": "2026-09-15"
      }
    }
    </script>
  </head>
  <body></body>
</html>
`;

function main() {
  const nodes = extractLodgingNodes(FIXTURE_HTML);
  assert.equal(nodes.length, 1, "expected exactly one JSON-LD node");

  const record = normalizeLodgingNode(nodes[0], "https://example.com/fixture-pines", "fixture");
  assert.ok(record, "normalization should not return null for a valid node");
  assert.equal(record!.name, "Fixture Pines Campsite");
  assert.equal(record!.slug, "fixture-pines-campsite");
  assert.equal(record!.country, "France");
  assert.equal(record!.lat, 47.65);
  assert.equal(record!.lng, -2.76);
  assert.ok(record!.amenities.includes("pool"), "should detect pool amenity");
  assert.ok(record!.amenities.includes("wifi"), "should detect wifi amenity");
  assert.ok(record!.amenities.includes("pets"), "should detect pets from petsAllowed");
  assert.equal(record!.priceSnapshots.length, 1);
  assert.equal(record!.priceSnapshots[0].price, 24);
  assert.equal(record!.priceSnapshots[0].currency, "EUR");
  assert.equal(record!.rating, 4.6);
  assert.equal(record!.reviewCount, 312);
  assert.deepEqual(record!.priceEstimate, { low: 24, high: 24, currency: "EUR" });
  assert.equal(record!.hasLivePricing, true);
  assert.equal(record!.lastScrapedAt, record!.priceSnapshots[0].scrapedAt);

  console.log("scraper/verify.ts: all checks passed.");
}

main();
