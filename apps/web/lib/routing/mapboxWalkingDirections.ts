/**
 * Mapbox Directions API — `walking` profile (pedestrian network only).
 * Combines direct requests (alternatives) with extra start→via→end requests using
 * lateral waypoints so we can surface ≥3 distinct walkable paths without chord shortcuts.
 */
import { ROUTE_CANDIDATE_LIMIT, type RouteOption } from "@/lib/routing/contracts";
import { createWalkingRouteOption } from "@/lib/routing/routePlanner";

type LngLat = [number, number];

type MapboxDirectionsResponse = {
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: GeoJSON.LineString;
  }>;
};

const METERS_PER_DEGREE_LAT = 111_320;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLng * sinDLng;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(x));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function chordTangentDegrees(a: LngLat, b: LngLat): { dx: number; dy: number; len: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return { dx, dy, len };
}

function offsetPerpendicularAlongChord(a: LngLat, b: LngLat, mid: LngLat, offsetMeters: number): LngLat {
  const { dx, dy, len } = chordTangentDegrees(a, b);
  if (len === 0) return mid;
  const nx = -dy / len;
  const ny = dx / len;
  const latScale = METERS_PER_DEGREE_LAT;
  const lngScale = METERS_PER_DEGREE_LAT * Math.cos(toRadians(mid[1]));
  const safeLngScale = Math.abs(lngScale) > 1 ? lngScale : 1;
  const offLng = (offsetMeters * nx) / safeLngScale;
  const offLat = (offsetMeters * ny) / latScale;
  return [mid[0] + offLng, mid[1] + offLat];
}

/** Point at fraction t along chord a→b, shifted perpendicular by perpMeters (+ = left of forward). */
function waypointChordPerturbed(a: LngLat, b: LngLat, t: number, perpMeters: number): LngLat {
  const p: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return offsetPerpendicularAlongChord(a, b, p, perpMeters);
}

/** Stable signature to drop near-duplicate Mapbox geometries. */
function polylineDedupeKey(geometry: GeoJSON.LineString, distanceMeters: number): string {
  const c = geometry.coordinates as number[][];
  if (!c?.length) return `d:${Math.round(distanceMeters)}`;
  const idx = [0, Math.floor(c.length / 4), Math.floor(c.length / 2), Math.floor((3 * c.length) / 4), c.length - 1];
  const samples = idx.map((i) => `${c[i][0].toFixed(5)},${c[i][1].toFixed(5)}`).join("|");
  return `${samples}|d:${Math.round(distanceMeters)}`;
}

function mapboxRouteToOption(
  r: NonNullable<MapboxDirectionsResponse["routes"]>[0],
  ordinal: number,
): RouteOption | null {
  const geom = r.geometry;
  if (!geom || geom.type !== "LineString") return null;
  const coordinates = geom.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const distanceMeters = typeof r.distance === "number" && Number.isFinite(r.distance) ? r.distance : 0;
  const durationMinutes =
    typeof r.duration === "number" && Number.isFinite(r.duration)
      ? Math.max(1, Math.round(r.duration / 60))
      : Math.max(3, Math.round(distanceMeters / 80));

  const label = ordinal === 0 ? "Walking · Primary" : `Walking · Option ${ordinal + 1}`;

  return createWalkingRouteOption({
    id: `mapbox-walking-${ordinal}`,
    label,
    geometry: geom,
    distanceMeters,
    durationMinutes,
  });
}

async function fetchWalkingDirectionsJson(
  token: string,
  coordPath: string,
  alternatives: boolean,
): Promise<MapboxDirectionsResponse | null> {
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/walking/${coordPath}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("alternatives", alternatives ? "true" : "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as MapboxDirectionsResponse;
  } catch {
    return null;
  }
}

/** Minimum distinct network paths before stopping extra via requests. */
const MIN_WALKING_NETWORK_OPTIONS = 3;

function buildViaCandidates(start: LngLat, end: LngLat): LngLat[] {
  const chordM = haversineMeters(start, end);
  if (!Number.isFinite(chordM) || chordM < 5) return [];
  const base = clamp(chordM * 0.11, 70, 420);

  const raw: LngLat[] = [
    waypointChordPerturbed(start, end, 0.5, base),
    waypointChordPerturbed(start, end, 0.5, -base),
    waypointChordPerturbed(start, end, 0.42, base * 0.85),
    waypointChordPerturbed(start, end, 0.58, -base * 0.88),
    waypointChordPerturbed(start, end, 0.35, base * 1.05),
    waypointChordPerturbed(start, end, 0.65, -base * 0.95),
    waypointChordPerturbed(start, end, 0.5, base * 1.35),
    waypointChordPerturbed(start, end, 0.5, -base * 1.25),
  ];

  const seen = new Set<string>();
  const out: LngLat[] = [];
  for (const p of raw) {
    const k = `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export async function fetchWalkingRoutesFromMapbox(
  accessToken: string,
  start: [number, number],
  end: [number, number],
  maxRoutes = ROUTE_CANDIDATE_LIMIT,
): Promise<RouteOption[]> {
  const token = accessToken.trim();
  if (!token) return [];

  const cap = Math.min(maxRoutes, ROUTE_CANDIDATE_LIMIT);
  const seenKeys = new Set<string>();
  const collected: RouteOption[] = [];

  const pushUniqueFromResponse = (json: MapboxDirectionsResponse | null): void => {
    if (!json?.routes?.length) return;
    for (const r of json.routes) {
      const geom = r.geometry;
      if (!geom || geom.type !== "LineString") continue;
      const distanceMeters =
        typeof r.distance === "number" && Number.isFinite(r.distance) ? r.distance : 0;
      const key = polylineDedupeKey(geom, distanceMeters);
      if (seenKeys.has(key)) continue;
      const opt = mapboxRouteToOption(r, collected.length);
      if (!opt) continue;
      seenKeys.add(key);
      collected.push(opt);
      if (collected.length >= cap) return;
    }
  };

  const directPath = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const directJson = await fetchWalkingDirectionsJson(token, directPath, true);
  pushUniqueFromResponse(directJson);

  const vias = buildViaCandidates(start, end);
  for (const via of vias) {
    if (collected.length >= cap) break;
    if (collected.length >= MIN_WALKING_NETWORK_OPTIONS) break;
    const viaPath = `${start[0]},${start[1]};${via[0]},${via[1]};${end[0]},${end[1]}`;
    const viaJson = await fetchWalkingDirectionsJson(token, viaPath, false);
    pushUniqueFromResponse(viaJson);
  }

  return collected.slice(0, cap).map((opt, i) => ({
    ...opt,
    id: `mapbox-walking-${i}`,
    label: i === 0 ? "Walking · Primary" : `Walking · Option ${i + 1}`,
  }));
}
