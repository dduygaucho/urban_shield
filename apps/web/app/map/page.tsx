"use client";

/**
 * Map view (Person 2 — map UI).
 * Fetches incidents via integration layer; renders Mapbox GL markers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { getIncidents } from "@/lib/api";
import type { IncidentRecord } from "@schemas/incident";
import { colorForCategory } from "./mapColors";

const DEFAULT_CENTER: [number, number] = [-74.006, 40.7128];
const FETCH_RADIUS_M = 15_000;
const FETCH_HOURS = 168;

export default function MapPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  const loadIncidents = useCallback(async (lat: number, lng: number) => {
    setError(null);
    try {
      const data = await getIncidents({
        lat,
        lng,
        radius: FETCH_RADIUS_M,
        hours: FETCH_HOURS,
      });
      setIncidents(data);
    } catch (e) {
      setIncidents([]);
      setError(e instanceof Error ? e.message : "Failed to load incidents");
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCenter(DEFAULT_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.longitude, pos.coords.latitude]);
      },
      () => setCenter(DEFAULT_CENTER),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  useEffect(() => {
    if (!center || !mapEl.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setError("Missing NEXT_PUBLIC_MAPBOX_TOKEN. Copy apps/web/.env.example to .env.local.");
      return;
    }
    mapboxgl.accessToken = token;

    if (mapRef.current) return;

    setMapReady(false);
    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: 13,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.once("load", () => {
      new mapboxgl.Marker({ color: "#0f172a" }).setLngLat(center).addTo(map);
      setMapReady(true);
    });

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [center]);

  useEffect(() => {
    if (!center) return;
    void loadIncidents(center[1], center[0]);
  }, [center, loadIncidents]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    clearMarkers();
    for (const inc of incidents) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "9999px";
      el.style.background = colorForCategory(inc.category);
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
      el.title = `${inc.category}: ${inc.description}`;

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([inc.lng, inc.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [incidents, mapReady]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/" className="text-sm font-medium text-slate-700 hover:text-slate-900">
          ← Home
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Map</h1>
        <button
          type="button"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
          onClick={() => center && void loadIncidents(center[1], center[0])}
        >
          Refresh
        </button>
      </header>
      {error && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{error}</div>
      )}
      <div ref={mapEl} className="min-h-0 flex-1 w-full" />
    </div>
  );
}
