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
  type LocationMode,
  type ReportMode,
  type TransportStateSnapshot,
} from "./ReportBottomSheet";
import { Toast } from "./Toast";
import { PrimaryActionDock } from "@/app/map/components/PrimaryActionDock";
import { PeerWalkPanelPlaceholder } from "@/app/map/components/PeerWalkPanelPlaceholder";
import {
  type RouteEndpointMarkerContract,
  type RoutePanelDock,
  RoutePlanningPanel,
} from "@/app/map/components/RoutePlanningPanel";
import { ReportPanelContainer } from "@/app/map/components/ReportPanelContainer";
import { useMapActionMode } from "@/app/map/hooks/useMapActionMode";
import {
  buildBusRouteCandidatesFromGeoJson,
  buildWalkingRouteCandidates,
} from "@/lib/routing/routePlanner";
import type { RouteOption, RouteTravelMode } from "@/lib/routing/contracts";
import { enrichAndRankRoutes } from "@/lib/safety/scoreRoute";

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
const SOURCE_ROUTE_OPTIONS = "route-options";
const LAYER_ROUTE_OPTIONS = "route-options-line";
const LAYER_ROUTE_SELECTED = "route-selected-line";
const ROUTE_PANEL_SIDE_BREAKPOINT_PX = 900;

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
type MarkerPlacementSource = RouteEndpointMarkerContract["placementSource"] | "none";

function boundsForRoute(route: RouteOption): mapboxgl.LngLatBounds | null {
  const coords = route.geometry.coordinates as [number, number][];
  if (coords.length === 0) return null;
  return coords.reduce(
    (bounds, coord) => bounds.extend(coord as mapboxgl.LngLatLike),
    new mapboxgl.LngLatBounds(coords[0], coords[0]),
  );
}

function metersToPixelsAtLatitude(meters: number, lat: number, zoom: number): number {
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return mpp > 0 ? meters / mpp : 0;
}

function toMapLayerIncident(inc: IncidentRecord): MapLayerIncident {
  return inc as MapLayerIncident;
}

function createRouteEndpointMarkerElement(kind: "start" | "destination"): HTMLElement {
  const marker = document.createElement("div");
  marker.className =
    "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md";
  marker.style.backgroundColor = kind === "start" ? "#16a34a" : "#dc2626";
  marker.textContent = kind === "start" ? "S" : "D";
  marker.setAttribute("aria-hidden", "true");
  return marker;
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
  const startMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const geometryRefPresentRef = useRef<Set<string>>(new Set());

  /** Start at env default so the map mounts immediately; GPS refines via flyTo. */
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => defaultCenterFromEnv());
  const [mapReady, setMapReady] = useState(false);
  const [mapZoom, setMapZoom] = useState(11);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [transportGeoReady, setTransportGeoReady] = useState(false);
  const [transportGeoJson, setTransportGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);

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
  const { mode: mapActionMode, enterBrowseMode, enterReportMode, enterRouteMode, enterPeerWalkMode } =
    useMapActionMode("browse");

  const [routeTravelMode, setRouteTravelMode] = useState<RouteTravelMode>("walking");
  const [routeStart, setRouteStart] = useState<{ lng: number; lat: number } | null>(null);
  const [routeEnd, setRouteEnd] = useState<{ lng: number; lat: number } | null>(null);
  const [startPlacementSource, setStartPlacementSource] = useState<MarkerPlacementSource>("none");
  const [endPlacementSource, setEndPlacementSource] = useState<MarkerPlacementSource>("none");
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

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
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight,
  }));

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

  const selectedRoute = useMemo(
    () => routeOptions.find((route) => route.id === selectedRouteId) ?? null,
    [routeOptions, selectedRouteId],
  );

  const routePanelDock = useMemo<RoutePanelDock>(() => {
    if (viewportSize.width < ROUTE_PANEL_SIDE_BREAKPOINT_PX) {
      return "bottom";
    }
    if (!mapReady || !selectedRoute || !mapRef.current) {
      return "right";
    }
    const routeBounds = boundsForRoute(selectedRoute);
    if (!routeBounds) return "right";
    const projected = mapRef.current.project(routeBounds.getCenter());
    const normalizedX = projected.x / Math.max(viewportSize.width, 1);
    if (normalizedX > 0.58) {
      return "left";
    }
    return "right";
  }, [mapReady, selectedRoute, viewportSize.width]);

  const displayedIncidents = useMemo(() => {
    if (mapActionMode !== "route" || !selectedRoute) {
      return incidents;
    }
    const ids = new Set(selectedRoute.incidents.map((incident) => incident.id));
    return incidents.filter((incident) => ids.has(incident.id));
  }, [incidents, mapActionMode, selectedRoute]);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  const clearRouteEndpointMarkers = useCallback(() => {
    startMarkerRef.current?.remove();
    destinationMarkerRef.current?.remove();
    startMarkerRef.current = null;
    destinationMarkerRef.current = null;
  }, []);

  const clearRouteResults = useCallback(() => {
    setRouteOptions([]);
    setSelectedRouteId(null);
  }, []);

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
      clearMarkers();
      clearRouteEndpointMarkers();
      map.remove();
      mapRef.current = null;
      geometryRefPresentRef.current = new Set();
    };
  }, [clearRouteEndpointMarkers, token]); // eslint-disable-line react-hooks/exhaustive-deps -- map mounts once per token; GPS uses flyTo

  useEffect(() => {
    void loadIncidents(mapCenter[1], mapCenter[0]);
  }, [mapCenter, loadIncidents]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

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
      setTransportGeoJson(data);
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
          setTransportGeoJson(null);
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

  /** Ensure route option source/layers exist so planning paths can be rendered. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getSource(SOURCE_ROUTE_OPTIONS)) return;
    const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    map.addSource(SOURCE_ROUTE_OPTIONS, { type: "geojson", data: empty });
    map.addLayer({
      id: LAYER_ROUTE_OPTIONS,
      type: "line",
      source: SOURCE_ROUTE_OPTIONS,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#64748b",
        "line-opacity": 0.65,
        "line-width": 4,
      },
      filter: ["!=", ["get", "routeId"], ""],
    });
    map.addLayer({
      id: LAYER_ROUTE_SELECTED,
      type: "line",
      source: SOURCE_ROUTE_OPTIONS,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#0f172a",
        "line-opacity": 0.95,
        "line-width": 6,
      },
      filter: ["==", ["get", "routeId"], ""],
    });
    if (map.getLayer(LAYER_DANGER)) {
      map.moveLayer(LAYER_DANGER);
    }
  }, [mapReady]);

  /** Update danger zone GeoJSON from incidents + zoom. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource(SOURCE_DANGER) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const z = mapZoom;
    const features: GeoJSON.Feature[] = [];
    for (const inc of displayedIncidents) {
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
  }, [displayedIncidents, mapReady, mapZoom]);

  /** Render planned route options and selected route emphasis. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource(SOURCE_ROUTE_OPTIONS) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = routeOptions.map((route) => ({
      type: "Feature",
      geometry: route.geometry,
      properties: { routeId: route.id },
    }));
    src.setData({ type: "FeatureCollection", features });

    if (map.getLayer(LAYER_ROUTE_SELECTED)) {
      map.setFilter(
        LAYER_ROUTE_SELECTED,
        selectedRouteId
          ? ["==", ["get", "routeId"], selectedRouteId]
          : ["==", ["get", "routeId"], ""],
      );
    }
    if (map.getLayer(LAYER_ROUTE_OPTIONS)) {
      map.setFilter(
        LAYER_ROUTE_OPTIONS,
        selectedRouteId
          ? ["!=", ["get", "routeId"], selectedRouteId]
          : ["!=", ["get", "routeId"], ""],
      );
    }
  }, [mapReady, routeOptions, selectedRouteId]);

  /** Update transport line highlight filter (real geometry only; no fake lines). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(LAYER_TRANSPORT)) return;

    const present = geometryRefPresentRef.current;
    const previewRef =
      sheetOpen && reportMode === "transport" && previewResolvedRoute?.geometry_ref
        ? previewResolvedRoute.geometry_ref
        : null;

    const refs = buildHighlightGeometryRefs(displayedIncidents, geometryIndex, present, previewRef);
    map.setFilter(LAYER_TRANSPORT, ["in", ["get", "geometry_ref"], ["literal", refs]]);

    /** Line width/opacity: max across highlighted routes; color is per-geometry_ref via `match`. */
    if (refs.length === 0) return;
    let lineWidth = 4;
    let lineOpacity = 0.88;
    for (const ref of refs) {
      const inc = displayedIncidents.find((i) => resolveGeometryRefForIncident(i, geometryIndex) === ref);
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
    displayedIncidents,
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
    for (const inc of displayedIncidents) {
      const el = createIncidentMarkerElement(inc.category, inc.description);
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([inc.lng, inc.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [displayedIncidents, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mapActionMode !== "route") {
      clearRouteEndpointMarkers();
      return;
    }

    if (routeStart) {
      if (!startMarkerRef.current) {
        startMarkerRef.current = new mapboxgl.Marker({
          element: createRouteEndpointMarkerElement("start"),
          anchor: "bottom",
        })
          .setLngLat([routeStart.lng, routeStart.lat])
          .addTo(map);
      } else {
        startMarkerRef.current.setLngLat([routeStart.lng, routeStart.lat]);
      }
    } else {
      startMarkerRef.current?.remove();
      startMarkerRef.current = null;
    }

    if (routeEnd) {
      if (!destinationMarkerRef.current) {
        destinationMarkerRef.current = new mapboxgl.Marker({
          element: createRouteEndpointMarkerElement("destination"),
          anchor: "bottom",
        })
          .setLngLat([routeEnd.lng, routeEnd.lat])
          .addTo(map);
      } else {
        destinationMarkerRef.current.setLngLat([routeEnd.lng, routeEnd.lat]);
      }
    } else {
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
    }
  }, [clearRouteEndpointMarkers, mapActionMode, mapReady, routeEnd, routeStart]);

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

  const routeFitPadding = useMemo<mapboxgl.PaddingOptions>(() => {
    const sidePanelWidth = Math.round(Math.min(Math.max(viewportSize.width * 0.4, 340), 580));
    const mobilePanelHeight = Math.round(Math.min(Math.max(viewportSize.height * 0.4, 220), 420));
    if (routePanelDock === "bottom") {
      return {
        top: 96,
        right: 72,
        bottom: Math.max(170, mobilePanelHeight + 16),
        left: 72,
      };
    }
    if (routePanelDock === "left") {
      return {
        top: 96,
        right: 104,
        bottom: 124,
        left: sidePanelWidth + 44,
      };
    }
    return {
      top: 96,
      right: sidePanelWidth + 44,
      bottom: 124,
      left: 104,
    };
  }, [routePanelDock, viewportSize.height, viewportSize.width]);

  const fitRouteInVisibleViewport = useCallback(
    (route: RouteOption, durationMs: number) => {
      const map = mapRef.current;
      if (!map) return;
      const bounds = boundsForRoute(route);
      if (!bounds) return;
      map.fitBounds(bounds, {
        padding: routeFitPadding,
        duration: durationMs,
        essential: true,
      });
    },
    [routeFitPadding],
  );

  const useMapCenterForStart = useCallback(() => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    setRouteStart({ lng: c.lng, lat: c.lat });
    setStartPlacementSource("mapCenter");
    clearRouteResults();
  }, [clearRouteResults]);

  const useMapCenterForEnd = useCallback(() => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    setRouteEnd({ lng: c.lng, lat: c.lat });
    setEndPlacementSource("mapCenter");
    clearRouteResults();
  }, [clearRouteResults]);

  const handleFindRoutes = useCallback(() => {
    if (!routeStart || !routeEnd) {
      setToast({ message: "Select start and destination first.", variant: "error" });
      return;
    }
    const start: [number, number] = [routeStart.lng, routeStart.lat];
    const end: [number, number] = [routeEnd.lng, routeEnd.lat];

    setRouteLoading(true);
    try {
      const baseRoutes =
        routeTravelMode === "walking"
          ? buildWalkingRouteCandidates(start, end)
          : buildBusRouteCandidatesFromGeoJson({
              start,
              end,
              geojson: transportGeoJson ?? { type: "FeatureCollection", features: [] },
              routeIndexByGeometryRef: geometryIndex.by_geometry_ref ?? {},
              limit: 3,
            });

      if (baseRoutes.length === 0) {
        setRouteOptions([]);
        setSelectedRouteId(null);
        setToast({ message: "No route found with current inputs.", variant: "error" });
        return;
      }

      const ranked = enrichAndRankRoutes({
        routes: baseRoutes,
        incidents,
        radiusMeters: 900,
      });
      setRouteOptions(ranked);
      setSelectedRouteId(null);
    } finally {
      setRouteLoading(false);
    }
  }, [routeStart, routeEnd, routeTravelMode, transportGeoJson, geometryIndex.by_geometry_ref, incidents]);

  const handleSelectRoute = useCallback(
    (routeId: string) => {
      setSelectedRouteId(routeId);
      const route = routeOptions.find((item) => item.id === routeId);
      if (!route) return;
      fitRouteInVisibleViewport(route, 900);
    },
    [fitRouteInVisibleViewport, routeOptions],
  );

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

  useEffect(() => {
    setRouteOptions((prev) =>
      prev.length === 0
        ? prev
        : enrichAndRankRoutes({
            routes: prev,
            incidents,
            radiusMeters: 900,
          }),
    );
  }, [incidents]);

  useEffect(() => {
    if (!selectedRouteId) return;
    if (routeOptions.some((option) => option.id === selectedRouteId)) return;
    setSelectedRouteId(routeOptions[0]?.id ?? null);
  }, [routeOptions, selectedRouteId]);

  useEffect(() => {
    if (!mapReady || mapActionMode !== "route" || !selectedRoute) return;
    fitRouteInVisibleViewport(selectedRoute, 500);
  }, [fitRouteInVisibleViewport, mapActionMode, mapReady, routePanelDock, selectedRoute, viewportSize]);

  const startMarkerContract = useMemo<RouteEndpointMarkerContract>(
    () => ({
      visible: mapActionMode === "route" && !!routeStart,
      placementSource: routeStart && startPlacementSource !== "none" ? startPlacementSource : undefined,
    }),
    [mapActionMode, routeStart, startPlacementSource],
  );

  const endMarkerContract = useMemo<RouteEndpointMarkerContract>(
    () => ({
      visible: mapActionMode === "route" && !!routeEnd,
      placementSource: routeEnd && endPlacementSource !== "none" ? endPlacementSource : undefined,
    }),
    [endPlacementSource, mapActionMode, routeEnd],
  );

  const handleSubmitReport = useCallback(async () => {
    if (!reportingLngLat) return;
    const desc = description.trim() || DESCRIPTION_FALLBACK;
    const tempId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const transportExtras = pickTransportCreateExtras(reportMode, transportFields);

    const optimistic: IncidentRecord = {
      id: tempId,
      source: "user-report",
      type: category,
      timestamp: nowIso,
      category,
      description: desc,
      lat: reportingLngLat.lat,
      lng: reportingLngLat.lng,
      created_at: nowIso,
      ...transportExtras,
    };
    setIncidents((prev) => [optimistic, ...prev]);
    setSubmitting(true);
    try {
      const payload: IncidentCreatePayload = {
        source: "user-report",
        type: category,
        timestamp: nowIso,
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
      enterBrowseMode();
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
    enterBrowseMode,
    resetTransportForm,
  ]);

  const openReportSheet = () => {
    enterReportMode();
    clearRouteEndpointMarkers();
    setChangeLocationOpen(false);
    setPinAdjustingMap(false);
    setLocationMode("current");
    setPickedLabel(null);
    setSheetOpen(true);
  };

  const openRoutePanel = () => {
    enterRouteMode();
    setSheetOpen(false);
    setChangeLocationOpen(false);
    setPinAdjustingMap(false);
    resetTransportForm();
    const c = mapRef.current?.getCenter();
    if (c && !routeStart) {
      setRouteStart({ lng: c.lng, lat: c.lat });
      setStartPlacementSource("mapCenter");
    }
  };

  const openPeerWalkPanel = () => {
    enterPeerWalkMode();
    setSheetOpen(false);
    setChangeLocationOpen(false);
    setPinAdjustingMap(false);
  };

  const bannerError = configError ?? loadError;
  const reportPanelOpen = sheetOpen && mapActionMode === "report";
 
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

      <RoutePlanningPanel
        open={mapActionMode === "route"}
        dock={routePanelDock}
        mapboxToken={token}
        proximity={geocoderProximity}
        mode={routeTravelMode}
        onModeChange={(mode) => {
          setRouteTravelMode(mode);
          clearRouteResults();
        }}
        start={routeStart}
        end={routeEnd}
        onStartPick={(lng, lat) => {
          setRouteStart({ lng, lat });
          setStartPlacementSource("search");
          clearRouteResults();
        }}
        onEndPick={(lng, lat) => {
          setRouteEnd({ lng, lat });
          setEndPlacementSource("search");
          clearRouteResults();
        }}
        onUseMapCenterForStart={useMapCenterForStart}
        onUseMapCenterForEnd={useMapCenterForEnd}
        onFindRoutes={handleFindRoutes}
        loading={routeLoading}
        options={routeOptions}
        selectedRouteId={selectedRouteId}
        onSelectRoute={handleSelectRoute}
        startMarker={startMarkerContract}
        endMarker={endMarkerContract}
      />

      <PeerWalkPanelPlaceholder open={mapActionMode === "peerWalkFuture"} />

      {!reportPanelOpen ? (
        <PrimaryActionDock
          mode={mapActionMode}
          onReport={openReportSheet}
          onRoute={openRoutePanel}
          onPeerWalk={openPeerWalkPanel}
        />
      ) : null}

      {token ? (
        <ReportPanelContainer
          open={reportPanelOpen}
          onClose={() => {
            setSheetOpen(false);
            setChangeLocationOpen(false);
            setPinAdjustingMap(false);
            enterBrowseMode();
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
