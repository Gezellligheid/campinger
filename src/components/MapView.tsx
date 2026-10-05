"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import type { Campsite } from "@/lib/types";
import type { TownAggregate } from "@/lib/townAggregates";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";
const SOURCE_ID = "campsites";
const CLUSTER_LAYER = "campsite-clusters";
const CLUSTER_COUNT_LAYER = "campsite-cluster-count";
const PLACEHOLDER_SOURCE_ID = "placeholders";
const PLACEHOLDER_LAYER = "placeholder-points";
const PLACEHOLDER_COUNT_LAYER = "placeholder-count";

function toFeatureCollection(campsites: Campsite[]) {
  return {
    type: "FeatureCollection" as const,
    features: campsites.map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  };
}

// Each feature already represents one town's aggregate (not a raw point),
// so this source is never passed through MapLibre's own cluster:true —
// `remaining` drives the circle size/label directly instead.
function toPlaceholderFeatureCollection(placeholders: TownAggregate[]) {
  return {
    type: "FeatureCollection" as const,
    features: placeholders.map((p) => ({
      type: "Feature" as const,
      properties: { id: p.id, remaining: p.remaining },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export default function MapView({
  campsites,
  placeholders = [],
  hoveredId,
  onHover,
  onBoundsChange,
}: {
  campsites: Campsite[];
  placeholders?: TownAggregate[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  /**
   * Fired on every pan/zoom (and once after the initial fitBounds) with the
   * map's current visible bounds — lets the parent filter the list to
   * "campsites currently visible on the map", the standard
   * Airbnb/Zillow-style "search as I move the map" pattern.
   */
  onBoundsChange?: (bounds: MapBounds) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const pillsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const campsitesRef = useRef<Campsite[]>(campsites);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    campsitesRef.current = campsites;
  }, [campsites]);

  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: TILE_STYLE,
      center: [2.5, 46.5],
      zoom: 5,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection([]),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#235943", // forest-600
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26, 200, 32],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.on("click", CLUSTER_LAYER, async (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
        const clusterId = feature?.properties?.cluster_id;
        const geometry = feature?.geometry;
        if (clusterId === undefined || geometry?.type !== "Point") return;

        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: geometry.coordinates as [number, number],
          zoom,
          duration: 400,
        });
      });

      map.on("mouseenter", CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      // Placeholder markers: towns the scraper knows (from a sitemap) have
      // campsites it hasn't visited/scraped full details for yet. Styled
      // distinctly from the real forest-green clusters above — a muted,
      // outlined sand tone reads as "known but not loaded", not a real
      // pin. Added below the real layers so a real cluster/pin always
      // draws on top where the two coincide.
      map.addSource(PLACEHOLDER_SOURCE_ID, {
        type: "geojson",
        data: toPlaceholderFeatureCollection([]),
      });

      map.addLayer(
        {
          id: PLACEHOLDER_LAYER,
          type: "circle",
          source: PLACEHOLDER_SOURCE_ID,
          paint: {
            "circle-color": "rgba(204,167,95,0.35)", // sand-500 @ 35%
            "circle-radius": ["step", ["get", "remaining"], 14, 10, 18, 50, 24, 200, 30],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#b08a45", // sand-600
          },
        },
        CLUSTER_LAYER,
      );

      map.addLayer(
        {
          id: PLACEHOLDER_COUNT_LAYER,
          type: "symbol",
          source: PLACEHOLDER_SOURCE_ID,
          layout: {
            "text-field": ["get", "remaining"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#82371d" }, // terracotta-700
        },
        CLUSTER_LAYER,
      );

      map.on("click", PLACEHOLDER_LAYER, (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, { layers: [PLACEHOLDER_LAYER] });
        if (feature?.geometry.type !== "Point") return;
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.min(map.getZoom() + 2, 14),
          duration: 400,
        });
      });
      map.on("mouseenter", PLACEHOLDER_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", PLACEHOLDER_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      setReady(true);
    });

    map.on("error", (e) => console.error("[maplibre]", e.error));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push the dataset into the clustering source whenever it changes.
  //
  // This used to also call map.fitBounds() to frame the data — fine when
  // `campsites` was the whole catalog, loaded once. Now that campsites are
  // fetched *for the current viewport* (see SearchResults.tsx), that
  // created a feedback loop: moving the map re-fetches campsites for the
  // new viewport -> campsites prop changes -> fitBounds moves the map
  // again -> refetch again, indefinitely. The camera drives the data now,
  // not the other way around, so the data must never move the camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(toFeatureCollection(campsites));

    const placeholderSource = map.getSource(PLACEHOLDER_SOURCE_ID) as GeoJSONSource | undefined;
    if (placeholderSource) placeholderSource.setData(toPlaceholderFeatureCollection(placeholders));
  }, [campsites, placeholders, ready]);

  // Custom DOM price-pill markers only for points NOT currently folded into
  // a cluster bubble — clusters render as the circle+count layers above.
  // Re-synced on every render (pan/zoom/data change) since which points
  // count as "unclustered" depends on current zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    function syncMarkers() {
      if (!map) return;
      let features;
      try {
        features = map.querySourceFeatures(SOURCE_ID);
      } catch {
        return; // source/tiles not ready yet for this frame
      }

      // Each unclustered point gets a real DOM element (MapLibre's own
      // cluster circles are WebGL and scale fine — this custom price-pill
      // marker doesn't). clusterRadius/clusterMaxZoom keep this small in
      // the common case, but a dense, barely-zoomed-in view can still put
      // hundreds of points on screen at once — cap it rather than let the
      // DOM choke, same tradeoff as MAX_RESULTS in fetchCampsitesInBounds.
      const MAX_DOM_MARKERS = 300;

      const visibleIds = new Set<string>();
      for (const feature of features) {
        if (visibleIds.size >= MAX_DOM_MARKERS) break;
        if (feature.properties?.cluster) continue;
        const id = feature.properties?.id as string | undefined;
        if (!id || visibleIds.has(id)) continue;
        visibleIds.add(id);

        if (markersRef.current.has(id)) continue;
        const campsite = campsitesRef.current.find((c) => c.id === id);
        if (!campsite) continue;

        // MapLibre positions this outer element via its own `transform`
        // (translate) — never style/scale it directly. Combining a CSS
        // `scale` with that positioning transform on the SAME element
        // scales the translation too (per the CSS transform composition
        // spec), causing the marker to visibly drift toward the
        // bottom-right on hover. The scale/color hover effect instead
        // lives on this unpositioned child.
        const el = document.createElement("div");

        const pill = document.createElement("button");
        pill.type = "button";
        pill.className =
          "flex items-center rounded-full border-2 border-white bg-forest-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md shadow-forest-900/30 cursor-pointer";
        pill.style.fontFamily = "var(--font-jakarta), sans-serif";
        // maplibre-gl.css sets `.maplibregl-marker { transition: opacity }`
        // on el, not pill, but set this inline too so it can't be
        // overridden by source order against any Tailwind class.
        pill.style.transition = "scale 150ms ease-out, background-color 150ms ease-out";
        const hasPrice = campsite.priceEstimate.low > 0 || campsite.priceEstimate.high > 0;
        pill.textContent = hasPrice ? `€${campsite.priceEstimate.low}` : "n/a";
        pill.addEventListener("mouseenter", () => onHover(campsite.id));
        pill.addEventListener("mouseleave", () => onHover(null));
        pill.addEventListener("click", () => router.push(`/campsite/${campsite.slug}`));
        el.appendChild(pill);

        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat([campsite.lng, campsite.lat])
          .addTo(map);

        markersRef.current.set(id, marker);
        pillsRef.current.set(id, pill);
      }

      for (const [id, marker] of markersRef.current) {
        if (!visibleIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
          pillsRef.current.delete(id);
        }
      }
    }

    syncMarkers();
    map.on("moveend", syncMarkers);
    map.on("zoomend", syncMarkers);
    map.on("idle", syncMarkers);

    return () => {
      map.off("moveend", syncMarkers);
      map.off("zoomend", syncMarkers);
      map.off("idle", syncMarkers);
    };
  }, [ready, campsites, onHover, router]);

  // Report the visible viewport to the parent on every pan/zoom, so the
  // list can show "campsites currently on screen" — not tied to the
  // campsites/placeholders data effects above since it only cares about
  // camera movement, not dataset changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    function reportBounds() {
      if (!map) return;
      const b = map.getBounds();
      onBoundsChangeRef.current?.({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    }

    reportBounds();
    map.on("moveend", reportBounds);
    return () => {
      map.off("moveend", reportBounds);
    };
  }, [ready]);

  useEffect(() => {
    pillsRef.current.forEach((pill, id) => {
      if (id === hoveredId) {
        pill.classList.add("bg-terracotta-500", "z-10", "scale-110");
        pill.classList.remove("bg-forest-600");
      } else {
        pill.classList.remove("bg-terracotta-500", "z-10", "scale-110");
        pill.classList.add("bg-forest-600");
      }
    });
  }, [hoveredId]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-forest-100">
      <div ref={containerRef} className="h-full w-full" />
      {campsites.length === 0 && placeholders.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-500">
          No campsites match these filters yet.
        </div>
      )}
    </div>
  );
}
