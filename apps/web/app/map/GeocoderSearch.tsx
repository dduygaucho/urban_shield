"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

type Props = {
  accessToken: string;
  active: boolean;
  onPick: (lng: number, lat: number) => void;
  /** Bias ranking toward this point (Mapbox expects `{ longitude, latitude }`). */
  proximity?: { longitude: number; latitude: number };
};

export function GeocoderSearch({ accessToken, active, onPick, proximity }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const geocoderRef = useRef<InstanceType<typeof MapboxGeocoder> | null>(null);

  const proximityKey = useMemo(
    () =>
      proximity == null
        ? ""
        : `${proximity.longitude.toFixed(3)},${proximity.latitude.toFixed(3)}`,
    [proximity],
  );

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const el = containerRef.current;
    el.innerHTML = "";

    /* MapboxGeocoder supports these fields at runtime; bundled types lag the public API. */
    const geocoder = new MapboxGeocoder({
      accessToken,
      mapboxgl: mapboxgl as never,
      marker: false,
      placeholder: "Hospital, station, suburb, address…",
      countries: "au",
      limit: 10,
      minLength: 2,
      language: "en",
      fuzzyMatch: true,
      autocomplete: true,
      trackProximity: false,
      ...(proximity ? { proximity } : {}),
    } as ConstructorParameters<typeof MapboxGeocoder>[0]);

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
  }, [active, accessToken, onPick, proximityKey]);

  if (!active) return null;

  return <div ref={containerRef} className="map-geocoder-root w-full [&_.mapboxgl-ctrl-geocoder]:max-w-none" />;
}
