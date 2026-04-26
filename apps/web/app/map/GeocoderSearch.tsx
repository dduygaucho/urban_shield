"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

type Props = {
  accessToken: string;
  active: boolean;
  onPick: (lng: number, lat: number) => void;
};

export function GeocoderSearch({ accessToken, active, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const geocoderRef = useRef<InstanceType<typeof MapboxGeocoder> | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const el = containerRef.current;
    el.innerHTML = "";

    const geocoder = new MapboxGeocoder({
      accessToken,
      mapboxgl: mapboxgl as never,
      marker: false,
      placeholder: "Station, street, landmark…",
      countries: "au",
      bbox: [143.35, -38.72, 146.05, -37.35] as [number, number, number, number],
    });

    geocoder.addTo(el);
    geocoder.on("result", (e: { result: { center: [number, number] } }) => {
      const [lng, lat] = e.result.center;
      onPick(lng, lat);
    });

    geocoderRef.current = geocoder;

    return () => {
      try {
        geocoder.clear();
      } catch {
        /* ignore */
      }
      el.innerHTML = "";
      geocoderRef.current = null;
    };
  }, [active, accessToken, onPick]);

  if (!active) return null;

  return <div ref={containerRef} className="map-geocoder-root w-full [&_.mapboxgl-ctrl-geocoder]:max-w-none" />;
}
