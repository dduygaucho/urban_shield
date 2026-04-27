"use client";

/**
 * Map-first reporting: fullscreen Mapbox + FAB + bottom sheet.
 * Transport mode + route danger layers use Agent-F artifacts (see scripts/ingest/agent_E_context.md).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { createIncident, getIncidents } from "@/lib/api";
import type { IncidentCategory, IncidentCreatePayload, IncidentRecord } from "@schemas/incident";
import { buildDangerZoneRenderModel, type MapLayerIncident } from "@/lib/mapLayers/dangerZones";
import {
  buildTransportRouteRenderModel,
  hasTransportRouteLink,
} from "@/lib/mapLayers/transportRouteLayer";
import type { NormalizedRouteMetadata, RouteIndexEntry, TransportRouteType } from "@/lib/reporting/routeLookup";
import type { TransportReportFields } from "@/lib/reporting/transportReport";
import { createIncidentMarkerElement } from "./incidentMarker";
import { buildRouteLineColorMatchExpression } from "./routeHighlightPalette";
import {
  CENTER_GEELONG,
  DEFAULT_CENTER_MELBOURNE,
  REGION_MAX_BOUNDS,
  regionCenterOrDefault,
} from "./region";
import {
  ReportBottomSheet,
  type LocationMode,
  type ReportMode,
  type TransportStateSnapshot,
} from "./ReportBottomSheet";
import { Toast } from "./Toast";

/** Agent-F normalized route list (metadata only). */
import vicRoutesNormalized from "../../../../scripts/ingest/transport_routes_vic_normalized.json";
/** Agent-F join index: by_geometry_ref, by_route_external_id. */
import vicGeometryIndex from "../../../../scripts/ingest/transport_route_geometry_index_vic.json";

function defaultCenterFromEnv(): [number, number] {
  const v = process.env.NEXT_PUBLIC_MAP_DEFAULT?.toLowerCase();
  return v === "geelong" ? CENTER_GEELONG : DEFAULT_CENTER_MELBOURNE;
}

const FETCH_RADIUS_M = 15_000;
const FETCH_HOURS = 168;

const DESCRIPTION_FALLBACK = "Reported from UrbanShield map";

const SOURCE_TRANSPORT = "vic-transport-routes";
const LAYER_TRANSPORT = "vic-transport-routes-highlight";
const SOURCE_DANGER = "incident-danger-zones";
const LAYER_DANGER = "incident-danger-zones-circles";

/** GeoJSON for route polylines: explicit env wins; else same host as API (served by FastAPI). */
function resolveTransportGeoJsonFetchUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_VIC_TRANSPORT_ROUTE_GEOJSON_URL?.trim() ||
    process.env.NEXT_PUBLIC_VIC_ROUTE_GEOJSON_URL?.trim();
  if (explicit) return explicit;
  const api = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (api) return `${api}/data/transport_route_geometries_vic.geojson`;
  return "";
}

type VicNormalizedDoc = { routes?: RouteIndexEntry[] };
type VicGeometryIndexDoc = {
  by_geometry_ref?: Record<string, RouteIndexEntry>;
  by_route_external_id?: Record<string, RouteIndexEntry>;
};

function metersToPixelsAtLatitude(meters: number, lat: number, zoom: number): number {
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return mpp > 0 ? meters / mpp : 0;
}

function toMapLayerIncident(inc: IncidentRecord): MapLayerIncident {
  return inc as MapLayerIncident;
}

function resolveGeometryRefForIncident(
  inc: IncidentRecord,
  index: VicGeometryIndexDoc,
): string | null {
  const g = String(inc.geometry_ref ?? "").trim();
  if (g) return g;
  const ext = String(inc.route_external_id ?? "").trim();
  if (!ext) return null;
  const row = index.by_route_external_id?.[ext];
  return row?.geometry_ref ? String(row.geometry_ref).trim() : null;
}

function buildHighlightGeometryRefs(
  incidents: IncidentRecord[],
  index: VicGeometryIndexDoc,
  geometryRefPresent: ReadonlySet<string>,
  previewRef: string | null,
): string[] {
  const out = new Set<string>();
  if (previewRef && geometryRefPresent.has(previewRef)) {
    out.add(previewRef);
  }
  for (const inc of incidents) {
    const ref = resolveGeometryRefForIncident(inc, index);
    if (ref && geometryRefPresent.has(ref) && hasTransportRouteLink(toMapLayerIncident(inc))) {
      out.add(ref);
    }
  }
  return Array.from(out);
}

function pickTransportCreateExtras(
  mode: ReportMode,
  fields: Partial<TransportReportFields>,
): Partial<
  Pick<IncidentCreatePayload, "route_type" | "route_external_id" | "route_label" | "geometry_ref">
> {
  if (mode !== "transport") return {};
  const out: Partial<
    Pick<IncidentCreatePayload, "route_type" | "route_external_id" | "route_label" | "geometry_ref">
  > = {};
  const rt = fields.route_type;
  if (rt === "bus" || rt === "train" || rt === "tram") {
    out.route_type = rt;
  }
  const ext = fields.route_external_id?.trim();
  if (ext) out.route_external_id = ext;
  const label = fields.route_label?.trim();
  if (label) out.route_label = label;
  const geom = fields.geometry_ref?.trim();
  if (geom) out.geometry_ref = geom;
  return out;
}

export default function MapPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const geometryRefPresentRef = useRef<Set<string>>(new Set());

  /** Start at env default so the map mounts immediately; GPS refines via flyTo. */
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => defaultCenterFromEnv());
  const [mapReady, setMapReady] = useState(false);
  const [mapZoom, setMapZoom] = useState(11);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [transportGeoReady, setTransportGeoReady] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  /** Full sheet hidden so the map receives pan/zoom while placing the pin. */
  const [pinAdjustingMap, setPinAdjustingMap] = useState(false);
  const [changeLocationOpen, setChangeLocationOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<LocationMode>("current");
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [reportingLngLat, setReportingLngLat] = useState<{ lng: number; lat: number } | null>(null);
  const [category, setCategory] = useState<IncidentCategory>("suspicious");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const [reportMode, setReportMode] = useState<ReportMode>("location");
  const [transportRouteType, setTransportRouteType] = useState<TransportRouteType>("bus");
  const [routeQuery, setRouteQuery] = useState("");
  const [transportFields, setTransportFields] = useState<Partial<TransportReportFields>>({});
  const [previewResolvedRoute, setPreviewResolvedRoute] = useState<NormalizedRouteMetadata | null>(
    null,
  );

  /** Map viewport center for geocoder proximity (updates on pan/zoom). */
  const [geocoderBias, setGeocoderBias] = useState<{ longitude: number; latitude: number } | null>(
    null,
  );

  const token = useMemo(() => process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "", []);

  const geocoderProximity = useMemo(() => {
    if (geocoderBias) return geocoderBias;
    return { longitude: mapCenter[0], latitude: mapCenter[1] };
  }, [geocoderBias, mapCenter]);

  const routeIndex = useMemo((): readonly RouteIndexEntry[] => {
    const doc = vicRoutesNormalized as VicNormalizedDoc;
    const routes = doc.routes ?? [];
    return routes.filter(
      (r) =>
        r &&
        (r.route_type === "bus" || r.route_type === "train" || r.route_type === "tram") &&
        typeof r.route_external_id === "string" &&
        typeof r.route_label === "string" &&
        typeof r.geometry_ref === "string",
    );
  }, []);

  const geometryIndex = useMemo(() => vicGeometryIndex as VicGeometryIndexDoc, []);

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
      { enableHighAccuracy: true, timeout: 10_000 },
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
        "Use a public Mapbox token (pk.*) in NEXT_PUBLIC_MAPBOX_TOKEN, not a secret token (sk.*).",
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

    const onZoomMove = () => {
      setMapZoom(map.getZoom());
    };
    map.on("zoom", onZoomMove);
    map.on("moveend", onZoomMove);

    map.once("load", () => {
      map.resize();
      setMapZoom(map.getZoom());
      setMapReady(true);
      const c = map.getCenter();
      setGeocoderBias({ longitude: c.lng, latitude: c.lat });
    });

    const onMoveEndBias = () => {
      const c = map.getCenter();
      setGeocoderBias({ longitude: c.lng, latitude: c.lat });
    };
    map.on("moveend", onMoveEndBias);

    return () => {
      setMapReady(false);
      map.off("zoom", onZoomMove);
      map.off("moveend", onZoomMove);
      map.off("moveend", onMoveEndBias);
      map.remove();
      mapRef.current = null;
      geometryRefPresentRef.current = new Set();
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
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }, [sheetOpen]);

  /** Load Agent-F route GeoJSON from URL (large file; not bundled). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const url = resolveTransportGeoJsonFetchUrl();

    if (!url) {
      setTransportGeoReady(false);
      return;
    }

    let cancelled = false;

    const setup = (data: GeoJSON.FeatureCollection) => {
      if (cancelled || !mapRef.current) return;
      const present = new Set<string>();
      for (const f of data.features ?? []) {
        const props = f.properties as Record<string, unknown> | null | undefined;
        const ref = props && typeof props.geometry_ref === "string" ? props.geometry_ref.trim() : "";
        if (ref) present.add(ref);
      }
      geometryRefPresentRef.current = present;

      if (!map.getSource(SOURCE_TRANSPORT)) {
        map.addSource(SOURCE_TRANSPORT, { type: "geojson", data });
        map.addLayer({
          id: LAYER_TRANSPORT,
          type: "line",
          source: SOURCE_TRANSPORT,
          filter: ["in", ["get", "geometry_ref"], ["literal", []]],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#d97706",
            "line-opacity": 0.88,
            "line-width": 4,
          },
        });
        if (map.getLayer(LAYER_DANGER)) {
          map.moveLayer(LAYER_DANGER);
        }
      } else {
        (map.getSource(SOURCE_TRANSPORT) as mapboxgl.GeoJSONSource).setData(data);
      }
      setTransportGeoReady(true);
    };

    void fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`GeoJSON fetch ${r.status}`);
        return r.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((data) => {
        if (data.type !== "FeatureCollection") throw new Error("GeoJSON must be FeatureCollection");
        setup(data);
      })
      .catch(() => {
        if (!cancelled) {
          geometryRefPresentRef.current = new Set();
          setTransportGeoReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps -- load once when map ready; filter updated elsewhere

  /** Ensure danger source/layer exists after style load. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getSource(SOURCE_DANGER)) return;

    const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    map.addSource(SOURCE_DANGER, { type: "geojson", data: empty });
    map.addLayer({
      id: LAYER_DANGER,
      type: "circle",
      source: SOURCE_DANGER,
      paint: {
        "circle-radius": ["get", "radiusPx"],
        "circle-color": ["get", "fillColor"],
        "circle-opacity": ["get", "fillOpacity"],
        "circle-stroke-width": ["get", "strokeWidth"],
        "circle-stroke-color": ["get", "strokeColor"],
        "circle-stroke-opacity": ["get", "strokeOpacity"],
      },
    });
  }, [mapReady]);

  /** Update danger zone GeoJSON from incidents + zoom. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource(SOURCE_DANGER) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const z = mapZoom;
    const features: GeoJSON.Feature[] = [];
    for (const inc of incidents) {
      const m = toMapLayerIncident(inc);
      const model = buildDangerZoneRenderModel(m, z);
      const radiusPx = Math.max(
        10,
        Math.min(220, metersToPixelsAtLatitude(model.style.radiusMeters, model.lat, z)),
      );
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [model.lng, model.lat] },
        properties: {
          radiusPx,
          fillColor: model.style.fillColor,
          fillOpacity: model.style.fillOpacity,
          strokeColor: model.style.strokeColor,
          strokeOpacity: model.style.strokeOpacity,
          strokeWidth: model.style.strokeWidth,
        },
      });
    }
    src.setData({ type: "FeatureCollection", features });
  }, [incidents, mapReady, mapZoom]);

  /** Update transport line highlight filter (real geometry only; no fake lines). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(LAYER_TRANSPORT)) return;

    const present = geometryRefPresentRef.current;
    const previewRef =
      sheetOpen && reportMode === "transport" && previewResolvedRoute?.geometry_ref
        ? previewResolvedRoute.geometry_ref
        : null;

    const refs = buildHighlightGeometryRefs(incidents, geometryIndex, present, previewRef);
    map.setFilter(LAYER_TRANSPORT, ["in", ["get", "geometry_ref"], ["literal", refs]]);

    /** Line width/opacity: max across highlighted routes; color is per-geometry_ref via `match`. */
    if (refs.length === 0) return;
    let lineWidth = 4;
    let lineOpacity = 0.88;
    for (const ref of refs) {
      const inc = incidents.find((i) => resolveGeometryRefForIncident(i, geometryIndex) === ref);
      if (inc) {
        const rm = buildTransportRouteRenderModel(toMapLayerIncident(inc), mapZoom);
        if (rm) {
          lineWidth = Math.max(lineWidth, rm.style.lineWidth);
          lineOpacity = Math.max(lineOpacity, rm.style.lineOpacity);
        }
      }
    }
    if (previewRef && refs.includes(previewRef)) {
      const previewInc: MapLayerIncident = {
        id: "preview",
        category,
        description: "",
        lat: reportingLngLat?.lat ?? 0,
        lng: reportingLngLat?.lng ?? 0,
        created_at: "",
        route_type: previewResolvedRoute?.route_type ?? null,
        route_external_id: previewResolvedRoute?.route_external_id ?? null,
        route_label: previewResolvedRoute?.route_label ?? null,
        geometry_ref: previewResolvedRoute?.geometry_ref ?? null,
        duration_class: "short_term",
      };
      const rm = buildTransportRouteRenderModel(previewInc, mapZoom);
      if (rm) {
        lineWidth = Math.max(lineWidth, rm.style.lineWidth);
        lineOpacity = Math.max(lineOpacity, rm.style.lineOpacity);
      }
    }
    const defaultLineColor = "#94a3b8";
    map.setPaintProperty(LAYER_TRANSPORT, "line-width", lineWidth);
    map.setPaintProperty(
      LAYER_TRANSPORT,
      "line-color",
      buildRouteLineColorMatchExpression(refs, defaultLineColor) as mapboxgl.ExpressionSpecification,
    );
    map.setPaintProperty(LAYER_TRANSPORT, "line-opacity", lineOpacity);
  }, [
    incidents,
    mapReady,
    mapZoom,
    sheetOpen,
    reportMode,
    previewResolvedRoute,
    geometryIndex,
    category,
    reportingLngLat,
    transportGeoReady,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    clearMarkers();
    for (const inc of incidents) {
      const el = createIncidentMarkerElement(inc.category, inc.description);
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([inc.lng, inc.lat])
        .addTo(map);
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
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }, []);

  const handleRefreshIncidents = useCallback(() => {
    const map = mapRef.current;
    const c = map?.getCenter();
    if (c) void loadIncidents(c.lat, c.lng);
    else void loadIncidents(mapCenter[1], mapCenter[0]);
  }, [mapCenter, loadIncidents]);

  const resetTransportForm = useCallback(() => {
    setReportMode("location");
    setTransportRouteType("bus");
    setRouteQuery("");
    setTransportFields({});
    setPreviewResolvedRoute(null);
  }, []);

  const onTransportStateChange = useCallback((state: TransportStateSnapshot) => {
    setTransportFields(state.transportFields);
    if (state.reportMode === "transport") {
      setPreviewResolvedRoute(state.resolvedRoute);
    } else {
      setPreviewResolvedRoute(null);
    }
  }, []);

  const handleSubmitReport = useCallback(async () => {
    if (!reportingLngLat) return;
    const desc = description.trim() || DESCRIPTION_FALLBACK;
    const tempId = `temp-${Date.now()}`;

    const transportExtras = pickTransportCreateExtras(reportMode, transportFields);

    const optimistic: IncidentRecord = {
      id: tempId,
      category,
      description: desc,
      lat: reportingLngLat.lat,
      lng: reportingLngLat.lng,
      created_at: new Date().toISOString(),
      ...transportExtras,
    };
    setIncidents((prev) => [optimistic, ...prev]);
    setSubmitting(true);
    try {
      const payload: IncidentCreatePayload = {
        category,
        description: desc,
        lat: reportingLngLat.lat,
        lng: reportingLngLat.lng,
        ...transportExtras,
      };
      const rec = await createIncident(payload);
      setIncidents((prev) => prev.map((i) => (i.id === tempId ? rec : i)));
      setToast({ message: "Incident reported", variant: "success" });
      setSheetOpen(false);
      setChangeLocationOpen(false);
      setPinAdjustingMap(false);
      setDescription("");
      setLocationMode("current");
      setPickedLabel(null);
      resetTransportForm();
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
  }, [
    reportingLngLat,
    description,
    category,
    reportMode,
    transportFields,
    handleRefreshIncidents,
    resetTransportForm,
  ]);

  const openReportSheet = () => {
    setChangeLocationOpen(false);
    setPinAdjustingMap(false);
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
            setPinAdjustingMap(false);
            resetTransportForm();
          }}
          locationMode={locationMode}
          onLocationModeChange={(m) => {
            setLocationMode(m);
            if (m === "search" || m === "current") {
              setPinAdjustingMap(false);
            }
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
          pinAdjustingMap={pinAdjustingMap}
          onEnterPinAdjustMode={() => setPinAdjustingMap(true)}
          onPinAdjustDone={() => setPinAdjustingMap(false)}
          geocoderProximity={geocoderProximity}
          reportMode={reportMode}
          onReportModeChange={setReportMode}
          transportRouteType={transportRouteType}
          onTransportRouteTypeChange={setTransportRouteType}
          routeQuery={routeQuery}
          onRouteQueryChange={setRouteQuery}
          routeIndex={routeIndex}
          onTransportStateChange={onTransportStateChange}
        />
      ) : null}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
