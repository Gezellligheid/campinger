"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Campsite } from "@/lib/types";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";

export default function DetailMap({ campsite }: { campsite: Campsite }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: TILE_STYLE,
      center: [campsite.lng, campsite.lat],
      zoom: 11,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const el = document.createElement("div");
    el.className =
      "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-terracotta-500 shadow-md shadow-forest-900/30";
    new Marker({ element: el })
      .setLngLat([campsite.lng, campsite.lat])
      .addTo(map);

    return () => map.remove();
  }, [campsite.lat, campsite.lng]);

  return <div ref={containerRef} className="h-full w-full" />;
}
