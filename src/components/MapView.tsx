"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  LngLatBounds,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import type { Campsite } from "@/lib/types";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";

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
  const [ready, setReady] = useState(false);

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
    map.on("load", () => setReady(true));
    map.on("error", (e) => console.error("[maplibre]", e.error));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    pillsRef.current.clear();

    const bounds = new LngLatBounds();

    campsites.forEach((c) => {
      // MapLibre positions this outer element via its own `transform`
      // (translate) — never style/scale it directly. Combining a CSS `scale`
      // with that positioning transform on the SAME element scales the
      // translation too (per the CSS transform composition spec), causing
      // the marker to visibly drift toward the bottom-right on hover. The
      // scale/color hover effect instead lives on this unpositioned child.
      const el = document.createElement("div");

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className =
        "flex items-center rounded-full border-2 border-white bg-forest-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md shadow-forest-900/30 cursor-pointer";
      pill.style.fontFamily = "var(--font-jakarta), sans-serif";
      // maplibre-gl.css sets `.maplibregl-marker { transition: opacity }` on
      // el, not pill, but set this inline too so it can't be overridden by
      // source order against any Tailwind class.
      pill.style.transition = "scale 150ms ease-out, background-color 150ms ease-out";
      pill.textContent = `€${c.priceEstimate.low}`;
      pill.addEventListener("mouseenter", () => onHover(c.id));
      pill.addEventListener("mouseleave", () => onHover(null));
      pill.addEventListener("click", () => router.push(`/campsite/${c.slug}`));
      el.appendChild(pill);

      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([c.lng, c.lat])
        .addTo(map);

      markersRef.current.set(c.id, marker);
      pillsRef.current.set(c.id, pill);
      bounds.extend([c.lng, c.lat]);
    });

    if (campsites.length > 0) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 9, duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campsites, ready]);

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
