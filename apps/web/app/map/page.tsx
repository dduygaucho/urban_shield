"use client";

/**
 * Map-first reporting: fullscreen Mapbox + FAB + bottom sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { createIncident, getIncidents } from "@/lib/api";
import type { IncidentCategory, IncidentRecord } from "@schemas/incident";
import { colorForCategory } from "./mapColors";
import {
  CENTER_GEELONG,
  DEFAULT_CENTER_MELBOURNE,
  REGION_MAX_BOUNDS,
  regionCenterOrDefault,
} from "./region";
import { ReportBottomSheet, type LocationMode } from "./ReportBottomSheet";
import { Toast } from "./Toast";

function defaultCenterFromEnv(): [number, number] {
  const v = process.env.NEXT_PUBLIC_MAP_DEFAULT?.toLowerCase();
  return v === "geelong" ? CENTER_GEELONG : DEFAULT_CENTER_MELBOURNE;
}

const FETCH_RADIUS_M = 15_000;
const FETCH_HOURS = 168;

const DESCRIPTION_FALLBACK = "Reported from UrbanShield map";

export default function MapPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  /** Start at env default so the map mounts immediately; GPS refines via flyTo. */
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => defaultCenterFromEnv());
  const [mapReady, setMapReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [changeLocationOpen, setChangeLocationOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<LocationMode>("current");
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [reportingLngLat, setReportingLngLat] = useState<{ lng: number; lat: number } | null>(null);
  const [category, setCategory] = useState<IncidentCategory>("suspicious");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const token = useMemo(() => process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "", []);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  const loadIncidents = useCallback(async (lat: number, lng: number) => {
    setLoadError(null);
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
      setLoadError(e instanceof Error ? e.message : "Failed to load incidents");
    }
  }, []);

  useEffect(() => {
    const fallback = defaultCenterFromEnv();
    if (!navigator.geolocation) {
      setMapCenter(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const pair = regionCenterOrDefault(lng, lat, fallback);
        setMapCenter(pair);
        mapRef.current?.flyTo({ center: pair, essential: true, duration: 1100 });
      },
      () => {
        setMapCenter(fallback);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    if (!token) {
      setConfigError("Missing NEXT_PUBLIC_MAPBOX_TOKEN. Copy apps/web/.env.example to .env.local.");
      return;
    }
    if (token.startsWith("sk.")) {
      setConfigError(
        "Use a public Mapbox token (pk.*) in NEXT_PUBLIC_MAPBOX_TOKEN, not a secret token (sk.*)."
      );
      return;
    }
    mapboxgl.accessToken = token;

    if (mapRef.current) return;

    setMapReady(false);
    const map = new mapboxgl.Map({
      container: el,
      style: "mapbox://styles/mapbox/streets-v12",
      center: mapCenter,
      zoom: 11,
      minZoom: 9,
      maxZoom: 19,
      maxBounds: REGION_MAX_BOUNDS,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("error", (e) => {
      const msg = e.error?.message ?? String(e);
      setLoadError((prev) => (prev ? `${prev} · Map: ${msg}` : `Map: ${msg}`));
    });

    map.once("load", () => {
      map.resize();
      setMapReady(true);
    });

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps -- map mounts once per token; GPS uses flyTo

  useEffect(() => {
    void loadIncidents(mapCenter[1], mapCenter[0]);
  }, [mapCenter, loadIncidents]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !sheetOpen || locationMode !== "pin") return;

    const sync = () => {
      const c = map.getCenter();
      const pair = regionCenterOrDefault(c.lng, c.lat, defaultCenterFromEnv());
      setReportingLngLat({ lng: pair[0], lat: pair[1] });
    };

    map.on("moveend", sync);
    sync();
    return () => {
      map.off("moveend", sync);
    };
  }, [mapReady, sheetOpen, locationMode]);

  useEffect(() => {
    if (!sheetOpen) return;
    const fallback = defaultCenterFromEnv();
    if (!navigator.geolocation) {
      const c = mapRef.current?.getCenter();
      if (c) {
        const pair = regionCenterOrDefault(c.lng, c.lat, fallback);
        setReportingLngLat({ lng: pair[0], lat: pair[1] });
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pair = regionCenterOrDefault(pos.coords.longitude, pos.coords.latitude, fallback);
        setReportingLngLat({ lng: pair[0], lat: pair[1] });
        setPickedLabel(null);
        setLocationMode("current");
        mapRef.current?.flyTo({ center: pair, essential: true, duration: 900 });
      },
      () => {
        const c = mapRef.current?.getCenter();
        if (c) {
          const pair = regionCenterOrDefault(c.lng, c.lat, fallback);
          setReportingLngLat({ lng: pair[0], lat: pair[1] });
        }
        setPickedLabel(null);
      },
      { enableHighAccuracy: true, timeout: 12_000 }
    );
  }, [sheetOpen]);

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

  const locationSummary = useMemo(() => {
    if (locationMode === "pin") {
      return "📌 Reporting where the pin is — move the map to adjust";
    }
    if (locationMode === "search") {
      return "🔍 Search for a place, then choose a result";
    }
    if (pickedLabel) {
      return `📍 ${pickedLabel}`;
    }
    return "📍 Reporting at your current location";
  }, [locationMode, pickedLabel]);

  const handleGeocoderPick = useCallback((lng: number, lat: number) => {
    const fallback = defaultCenterFromEnv();
    const pair = regionCenterOrDefault(lng, lat, fallback);
    setReportingLngLat({ lng: pair[0], lat: pair[1] });
    setLocationMode("current");
    setPickedLabel("Selected place");
    mapRef.current?.flyTo({ center: pair, essential: true, duration: 900 });
  }, []);

  const refreshReportingFromGps = useCallback(() => {
    const fallback = defaultCenterFromEnv();
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pair = regionCenterOrDefault(pos.coords.longitude, pos.coords.latitude, fallback);
        setReportingLngLat({ lng: pair[0], lat: pair[1] });
        setPickedLabel(null);
        mapRef.current?.flyTo({ center: pair, essential: true, duration: 900 });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12_000 }
    );
  }, []);

  const handleRefreshIncidents = useCallback(() => {
    const map = mapRef.current;
    const c = map?.getCenter();
    if (c) void loadIncidents(c.lat, c.lng);
    else void loadIncidents(mapCenter[1], mapCenter[0]);
  }, [mapCenter, loadIncidents]);

  const handleSubmitReport = useCallback(async () => {
    if (!reportingLngLat) return;
    const desc = description.trim() || DESCRIPTION_FALLBACK;
    const tempId = `temp-${Date.now()}`;
    const optimistic: IncidentRecord = {
      id: tempId,
      category,
      description: desc,
      lat: reportingLngLat.lat,
      lng: reportingLngLat.lng,
      created_at: new Date().toISOString(),
    };
    setIncidents((prev) => [optimistic, ...prev]);
    setSubmitting(true);
    try {
      const rec = await createIncident({
        category,
        description: desc,
        lat: reportingLngLat.lat,
        lng: reportingLngLat.lng,
      });
      setIncidents((prev) => prev.map((i) => (i.id === tempId ? rec : i)));
      setToast({ message: "Incident reported", variant: "success" });
      setSheetOpen(false);
      setChangeLocationOpen(false);
      setDescription("");
      setLocationMode("current");
      setPickedLabel(null);
      handleRefreshIncidents();
    } catch (e) {
      setIncidents((prev) => prev.filter((i) => i.id !== tempId));
      setToast({
        message: e instanceof Error ? e.message : "Could not report incident",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [reportingLngLat, description, category, handleRefreshIncidents]);

  const openReportSheet = () => {
    setChangeLocationOpen(false);
    setLocationMode("current");
    setPickedLabel(null);
    setSheetOpen(true);
  };

  const bannerError = configError ?? loadError;

  return (
    <div className="fixed inset-0 z-0 bg-slate-900">
      <div ref={mapEl} className="map-page-map-root absolute inset-0 z-[1] min-h-0 min-w-0" />

      {sheetOpen && locationMode === "pin" && (
        <div
          className="pointer-events-none absolute left-1/2 top-[42%] z-20 -translate-x-1/2 -translate-y-1/2"
          aria-hidden
        >
          <div className="flex flex-col items-center drop-shadow-lg">
            <div className="h-0 w-0 border-x-[10px] border-x-transparent border-b-[14px] border-b-red-500" />
            <div className="-mt-0.5 h-4 w-4 rounded-full border-2 border-white bg-red-500 shadow-md" />
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-0 top-0 z-30 flex flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="pointer-events-auto rounded-full bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-md ring-1 ring-slate-200/80 backdrop-blur-sm transition hover:bg-white"
        >
          Home
        </Link>
        <button
          type="button"
          onClick={handleRefreshIncidents}
          className="pointer-events-auto rounded-full bg-white/95 px-3 py-2 text-sm font-semibold text-blue-700 shadow-md ring-1 ring-slate-200/80 backdrop-blur-sm transition hover:bg-white"
        >
          Refresh
        </button>
      </div>

      {bannerError && (
        <div className="absolute left-3 right-3 top-16 z-30 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow-md ring-1 ring-amber-200">
          {bannerError}
        </div>
      )}

      <button
        type="button"
        onClick={openReportSheet}
        className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-14 min-w-[7.5rem] items-center justify-center gap-2 rounded-full bg-slate-900 px-5 text-base font-bold text-white shadow-xl shadow-slate-900/40 transition hover:bg-slate-800 active:scale-95"
        aria-label="Report incident"
      >
        <span className="text-xl" aria-hidden>
          ➕
        </span>
        Report
      </button>

      {token ? (
        <ReportBottomSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false);
            setChangeLocationOpen(false);
          }}
          locationMode={locationMode}
          onLocationModeChange={(m) => {
            setLocationMode(m);
            if (m === "pin") {
              setPickedLabel(null);
              const c = mapRef.current?.getCenter();
              const fb = defaultCenterFromEnv();
              if (c) {
                const pair = regionCenterOrDefault(c.lng, c.lat, fb);
                setReportingLngLat({ lng: pair[0], lat: pair[1] });
              }
            }
            if (m === "search") {
              setPickedLabel(null);
            }
          }}
          locationSummary={locationSummary}
          changeLocationOpen={changeLocationOpen}
          onToggleChangeLocation={() => setChangeLocationOpen((v) => !v)}
          mapboxToken={token}
          onGeocoderPick={handleGeocoderPick}
          category={category}
          onCategoryChange={setCategory}
          description={description}
          onDescriptionChange={setDescription}
          submitting={submitting}
          locationReady={!!reportingLngLat}
          onSubmit={() => void handleSubmitReport()}
          onUseCurrentLocation={refreshReportingFromGps}
          pinModeActive={sheetOpen && locationMode === "pin"}
        />
      ) : null}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
