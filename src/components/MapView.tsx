"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import type { Campsite } from "@/lib/types";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";
const SOURCE_ID = "campsites";
const CLUSTER_LAYER = "campsite-clusters";
const CLUSTER_COUNT_LAYER = "campsite-cluster-count";

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

export default function MapView({
  campsites,
  hoveredId,
  onHover,
}: {
  campsites: Campsite[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const pillsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const campsitesRef = useRef<Campsite[]>(campsites);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    campsitesRef.current = campsites;
  }, [campsites]);

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

      setReady(true);
    });

    map.on("error", (e) => console.error("[maplibre]", e.error));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push the full dataset into the clustering source and fit bounds
  // whenever the filtered campsite list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toFeatureCollection(campsites));

    if (campsites.length > 0) {
      const bounds = new LngLatBounds();
      campsites.forEach((c) => bounds.extend([c.lng, c.lat]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 9, duration: 400 });
    }
  }, [campsites, ready]);

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

      const visibleIds = new Set<string>();
      for (const feature of features) {
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
        pill.textContent = `€${campsite.priceEstimate.low}`;
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
      {campsites.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-500">
          No campsites match these filters yet.
        </div>
      )}
    </div>
  );
}
