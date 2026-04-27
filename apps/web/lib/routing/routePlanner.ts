import type { RouteIndexEntry, TransportRouteType } from "@/lib/reporting/routeLookup";
import { ROUTE_CANDIDATE_LIMIT, type RouteOption } from "@/lib/routing/contracts";
import { transitKindShortLabel } from "@/lib/routing/transitDisplay";

type LngLat = [number, number];

const METERS_PER_DEGREE_LAT = 111_320;
const METERS_PER_DEGREE_LNG_AT_EQUATOR = 111_320;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

function polylineLengthMeters(coords: LngLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i += 1) {
    sum += haversineMeters(coords[i - 1], coords[i]);
  }
  return sum;
}

function estimateWalkingMinutes(distanceMeters: number): number {
  return Math.max(3, Math.round(distanceMeters / 80));
}

function estimateBusMinutes(distanceMeters: number): number {
  return Math.max(6, Math.round(distanceMeters / 260));
}

function midpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Unit tangent from a→b in degree space; zero vector if degenerate. */
function chordTangentDegrees(a: LngLat, b: LngLat): { dx: number; dy: number; len: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return { dx, dy, len };
}

/** Left normal (degrees) scaled so lateral offsetMeters maps to degree delta at mid latitude. */
function offsetPerpendicularAlongChord(
  a: LngLat,
  b: LngLat,
  mid: LngLat,
  offsetMeters: number,
): LngLat {
  const { dx, dy, len } = chordTangentDegrees(a, b);
  if (len === 0) return mid;
  const nx = -dy / len;
  const ny = dx / len;
  const latScale = METERS_PER_DEGREE_LAT;
  const lngScale = METERS_PER_DEGREE_LNG_AT_EQUATOR * Math.cos(toRadians(mid[1]));
  const safeLngScale = Math.abs(lngScale) > 1 ? lngScale : 1;
  const offLng = (offsetMeters * nx) / safeLngScale;
  const offLat = (offsetMeters * ny) / latScale;
  return [mid[0] + offLng, mid[1] + offLat];
}

/**
 * Point at fraction `t` along chord a→b (0=a, 1=b), then shifted perpendicular by `perpMeters`
 * (positive = left of forward direction a→b).
 */
function waypointChordPerturbed(a: LngLat, b: LngLat, t: number, perpMeters: number): LngLat {
  const p: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return offsetPerpendicularAlongChord(a, b, p, perpMeters);
}

function toLineString(coords: LngLat[]): GeoJSON.LineString {
  return { type: "LineString", coordinates: coords };
}

function emptyScoreBreakdown() {
  return {
    baseScore: 100,
    incidentCount: 0,
    distancePenalty: 0,
    severityPenalty: 0,
    recencyPenalty: 0,
    totalPenalty: 0,
  };
}

function emptyRouteOption(
  id: string,
  mode: RouteOption["mode"],
  label: string,
  geometry: GeoJSON.LineString,
  distanceMeters: number,
  durationMinutes: number,
  metadata?: RouteOption["metadata"],
): RouteOption {
  return {
    id,
    mode,
    label,
    geometry,
    distanceMeters,
    durationMinutes,
    safetyScore: 100,
    safetyRank: 0,
    incidents: [],
    scoreBreakdown: emptyScoreBreakdown(),
    metadata,
  };
}

function parseTransitRouteTypeFromProps(props: Record<string, unknown>): TransportRouteType | undefined {
  const raw = props.route_type;
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (s === "bus" || s === "train" || s === "tram") return s;
  return undefined;
}

function resolveTransitRouteType(
  routeRow: RouteIndexEntry | undefined,
  props: Record<string, unknown>,
): TransportRouteType {
  if (routeRow?.route_type) return routeRow.route_type;
  const fromProps = parseTransitRouteTypeFromProps(props);
  if (fromProps) return fromProps;
  return "bus";
}

function walkingSegmentMetadata(distanceMeters: number, durationMinutes: number, label: string): RouteOption["metadata"] {
  return {
    segment_display: "walking_only",
    walk_seg_0_label: label,
    walk_seg_0_m: distanceMeters,
    walk_seg_0_min: durationMinutes,
  };
}

/** Build a walking {@link RouteOption} (shared by synthetic candidates and Mapbox Directions). */
export function createWalkingRouteOption(params: {
  id: string;
  label: string;
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationMinutes: number;
}): RouteOption {
  return emptyRouteOption(
    params.id,
    "walking",
    params.label,
    params.geometry,
    params.distanceMeters,
    params.durationMinutes,
    walkingSegmentMetadata(params.distanceMeters, params.durationMinutes, "Walk"),
  );
}

/** True if polyline is exactly two points (straight chord) — excluded from walking MVP output. */
function isStraightLineTwoPoint(coords: LngLat[]): boolean {
  return coords.length === 2;
}

/**
 * Deterministic walking alternatives (chord-offset polylines). Every candidate has ≥3 vertices (no straight-line-only).
 */
export function buildWalkingRouteCandidates(start: LngLat, end: LngLat): RouteOption[] {
  const chordM = haversineMeters(start, end);
  if (!Number.isFinite(chordM) || chordM < 1) {
    const tiny = 0.00005;
    const end2: LngLat = [end[0] + tiny, end[1] + tiny];
    return buildWalkingRouteCandidates(start, end2);
  }

  const basePerp = clamp(chordM * 0.14, 90, 650);
  const perpA = basePerp;
  const perpB = -basePerp * 0.85;
  const perpC = basePerp * 0.55;
  const perpD = basePerp * 0.72;
  const perpE = -basePerp * 0.62;

  const variants: Array<{ id: string; label: string; coords: LngLat[] }> = [
    {
      id: "walk-shape-a",
      label: "Walking - Via side corridor",
      coords: [
        start,
        waypointChordPerturbed(start, end, 0.28, perpA),
        waypointChordPerturbed(start, end, 0.62, perpA * 0.35),
        end,
      ],
    },
    {
      id: "walk-shape-b",
      label: "Walking - Balanced alternative",
      coords: [
        start,
        waypointChordPerturbed(start, end, 0.22, perpB),
        waypointChordPerturbed(start, end, 0.5, perpB * 0.5),
        waypointChordPerturbed(start, end, 0.78, perpB * 0.25),
        end,
      ],
    },
    {
      id: "walk-shape-c",
      label: "Walking - Longer arc",
      coords: [
        start,
        waypointChordPerturbed(start, end, 0.35, perpC),
        midpoint(start, end),
        waypointChordPerturbed(start, end, 0.72, perpC * 0.4),
        end,
      ],
    },
    {
      id: "walk-shape-d",
      label: "Walking - Riverside offset",
      coords: [
        start,
        waypointChordPerturbed(start, end, 0.33, perpD),
        waypointChordPerturbed(start, end, 0.58, perpD * 0.45),
        end,
      ],
    },
    {
      id: "walk-shape-e",
      label: "Walking - Wide detour",
      coords: [
        start,
        waypointChordPerturbed(start, end, 0.18, perpE),
        midpoint(start, end),
        waypointChordPerturbed(start, end, 0.82, perpE * 0.3),
        end,
      ],
    },
  ];

  const seen = new Set<string>();
  const out: RouteOption[] = [];

  for (const variant of variants) {
    const distance = polylineLengthMeters(variant.coords);
    if (isStraightLineTwoPoint(variant.coords)) continue;
    const key = variant.coords.map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const durationMinutes = estimateWalkingMinutes(distance);
    out.push(
      emptyRouteOption(
        variant.id,
        "walking",
        variant.label,
        toLineString(variant.coords),
        distance,
        durationMinutes,
        walkingSegmentMetadata(distance, durationMinutes, "Walk"),
      ),
    );
    if (out.length >= ROUTE_CANDIDATE_LIMIT) break;
  }

  return out.slice(0, ROUTE_CANDIDATE_LIMIT);
}

function asLineString(geometry: GeoJSON.Geometry): GeoJSON.LineString | null {
  if (geometry.type === "LineString") {
    return geometry as GeoJSON.LineString;
  }
  if (geometry.type === "MultiLineString") {
    const lines = (geometry as GeoJSON.MultiLineString).coordinates;
    if (!Array.isArray(lines) || lines.length === 0) return null;
    const longest = [...lines].sort((a, b) => b.length - a.length)[0];
    return longest ? { type: "LineString", coordinates: longest } : null;
  }
  return null;
}

/** Cumulative distance from coords[0] along polyline to each vertex. */
function cumulativeVertexMeters(coords: LngLat[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cum.push(cum[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  return cum;
}

type NearestOnPolyline = {
  point: LngLat;
  distanceMeters: number;
  segIndex: number;
  /** Parameter 0..1 on segment coords[segIndex]→coords[segIndex+1] */
  t: number;
  cumM: number;
};

function nearestPointOnPolyline(point: LngLat, coords: LngLat[]): NearestOnPolyline | null {
  if (coords.length < 2) return null;
  const cum = cumulativeVertexMeters(coords);
  let bestDist = Number.POSITIVE_INFINITY;
  let best: NearestOnPolyline | null = null;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    const segLen = haversineMeters(a, b);
    const { proj, t } = projectPointOntoSegmentDegrees(point, a, b);
    const d = haversineMeters(point, proj);
    if (d < bestDist) {
      const cumM = cum[i] + t * segLen;
      bestDist = d;
      best = { point: proj, distanceMeters: d, segIndex: i, t: clamp(t, 0, 1), cumM };
    }
  }
  return best;
}

function projectPointOntoSegmentDegrees(
  p: LngLat,
  a: LngLat,
  b: LngLat,
): { proj: LngLat; t: number } {
  const avgLat = (a[1] + b[1] + p[1]) / 3;
  const latScale = METERS_PER_DEGREE_LAT;
  const lngScale = Math.max(1, METERS_PER_DEGREE_LNG_AT_EQUATOR * Math.cos(toRadians(avgLat)));

  const px = p[0] * lngScale;
  const py = p[1] * latScale;
  const ax = a[0] * lngScale;
  const ay = a[1] * latScale;
  const bx = b[0] * lngScale;
  const by = b[1] * latScale;

  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { proj: a, t: 0 };
  const apx = px - ax;
  const apy = py - ay;
  const t = (apx * abx + apy * aby) / ab2;
  const tClamped = clamp(t, 0, 1);
  return {
    proj: [a[0] + tClamped * (b[0] - a[0]), a[1] + tClamped * (b[1] - a[1])],
    t: tClamped,
  };
}

/** Minimum distance from point to any segment of the polyline (for suitability / filtering). */
function minDistancePointToPolylineMeters(point: LngLat, coords: LngLat[]): number {
  const n = nearestPointOnPolyline(point, coords);
  return n ? n.distanceMeters : Number.POSITIVE_INFINITY;
}

/**
 * Ordered coords from board to drop along `coords` (forward). Assumes board.cumM <= drop.cumM.
 */
function extractSubpolylineForward(coords: LngLat[], board: NearestOnPolyline, drop: NearestOnPolyline): LngLat[] {
  const { segIndex: i, t: tb } = board;
  const { segIndex: j, t: td } = drop;
  const out: LngLat[] = [board.point];

  if (i === j) {
    if (tb < td - 1e-9) out.push(drop.point);
    else if (tb > td + 1e-9) {
      out.length = 0;
      out.push(drop.point, board.point);
    } else {
      out.push(drop.point);
    }
    return dedupeConsecutive(out);
  }

  for (let k = i + 1; k <= j; k += 1) {
    out.push(coords[k]);
  }
  if (haversineMeters(out[out.length - 1], drop.point) > 0.5) {
    out.push(drop.point);
  } else {
    out[out.length - 1] = drop.point;
  }
  return dedupeConsecutive(out);
}

function dedupeConsecutive(ring: LngLat[]): LngLat[] {
  const r: LngLat[] = [];
  for (const p of ring) {
    const prev = r[r.length - 1];
    if (!prev || haversineMeters(prev, p) > 0.3) r.push(p);
  }
  return r;
}

/**
 * Composite line for map + safety: bus subline then final walk chord drop→end.
 */
function mergeBusGeometryWithFinalWalk(busPart: GeoJSON.LineString, end: LngLat): GeoJSON.LineString {
  const bc = busPart.coordinates as LngLat[];
  if (bc.length === 0) return { type: "LineString", coordinates: [end, end] };
  const last = bc[bc.length - 1];
  if (haversineMeters(last, end) < 2) return busPart;
  return { type: "LineString", coordinates: [...bc, end] };
}

/** Lower is better. Weights are deterministic constants (MVP proxy). */
function busCompositeRankScore(params: {
  accessWalkM: number;
  finalWalkM: number;
  busSegmentM: number;
  destToCorridorM: number;
}): number {
  const { accessWalkM, finalWalkM, busSegmentM, destToCorridorM } = params;
  return (
    1.0 * accessWalkM +
    1.15 * finalWalkM +
    0.22 * busSegmentM +
    0.35 * destToCorridorM
  );
}

export function buildBusRouteCandidatesFromGeoJson(params: {
  start: LngLat;
  end: LngLat;
  geojson: GeoJSON.FeatureCollection;
  routeIndexByGeometryRef: Readonly<Record<string, RouteIndexEntry>>;
  limit?: number;
}): RouteOption[] {
  const { start, end, geojson, routeIndexByGeometryRef, limit = ROUTE_CANDIDATE_LIMIT } = params;

  type Scored = { option: RouteOption; rankScore: number };
  const candidates: Scored[] = [];

  for (const feature of geojson.features ?? []) {
    if (!feature.geometry) continue;
    const line = asLineString(feature.geometry);
    if (!line || line.coordinates.length < 2) continue;

    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const geometryRef = typeof props.geometry_ref === "string" ? props.geometry_ref.trim() : "";
    if (!geometryRef) continue;

    const routeRow = routeIndexByGeometryRef[geometryRef];
    const routeLabel =
      (typeof props.route_label === "string" && props.route_label.trim()) ||
      routeRow?.route_label ||
      geometryRef;
    const routeExternalId =
      (typeof props.route_external_id === "string" && props.route_external_id.trim()) ||
      routeRow?.route_external_id ||
      geometryRef;

    let coords = line.coordinates as LngLat[];
    let nearStart = nearestPointOnPolyline(start, coords);
    let nearEnd = nearestPointOnPolyline(end, coords);
    if (!nearStart || !nearEnd) continue;

    if (nearStart.cumM > nearEnd.cumM) {
      coords = [...coords].reverse();
      nearStart = nearestPointOnPolyline(start, coords);
      nearEnd = nearestPointOnPolyline(end, coords);
      if (!nearStart || !nearEnd) continue;
    }

    const accessWalkM = haversineMeters(start, nearStart.point);
    const finalWalkM = haversineMeters(nearEnd.point, end);
    const busCoords = extractSubpolylineForward(coords, nearStart, nearEnd);
    const busSegmentM = polylineLengthMeters(busCoords);
    if (busSegmentM < 30) continue;

    const destToCorridorM = minDistancePointToPolylineMeters(end, coords);
    const originToCorridorM = minDistancePointToPolylineMeters(start, coords);

    if (finalWalkM > 3_500 || accessWalkM > 3_000) continue;

    const rankScore = busCompositeRankScore({
      accessWalkM,
      finalWalkM,
      busSegmentM,
      destToCorridorM,
    });

    const busLineOnly = toLineString(busCoords);
    const geometryMerged = mergeBusGeometryWithFinalWalk(busLineOnly, end);
    const totalMeters = accessWalkM + busSegmentM + finalWalkM;
    const durationMinutes =
      estimateWalkingMinutes(accessWalkM + finalWalkM) + estimateBusMinutes(busSegmentM);

    const transitRouteType = resolveTransitRouteType(routeRow, props);
    const transitPrefix = transitKindShortLabel(transitRouteType);
    const segmentTransitLabel = `${transitPrefix} ${routeLabel}`;

    const option = emptyRouteOption(
      `bus-${geometryRef}`,
      "publicTransport",
      segmentTransitLabel,
      geometryMerged,
      totalMeters,
      durationMinutes,
      {
        route_type: transitRouteType,
        route_external_id: routeExternalId,
        route_label: routeLabel,
        geometry_ref: geometryRef,
        segment_display: "bus_final_walk",
        segment_bus_label: routeLabel,
        segment_final_walk_label: "Walk to destination",
        segment_final_walk_m: finalWalkM,
        segment_final_walk_min: estimateWalkingMinutes(finalWalkM),
        segment_origin_access_m: accessWalkM,
        segment_bus_m: busSegmentM,
        segment_total_burden_m: totalMeters,
        segment_destination_proximity_m: finalWalkM,
        segment_dest_to_corridor_m: destToCorridorM,
        segment_origin_to_corridor_m: originToCorridorM,
        segment_rank_score: rankScore,
      },
    );

    candidates.push({ option, rankScore });
  }

  candidates.sort((a, b) => a.rankScore - b.rankScore);

  const out: RouteOption[] = [];
  const seenGeom = new Set<string>();
  for (const row of candidates) {
    const key = row.option.metadata?.geometry_ref as string;
    if (seenGeom.has(key)) continue;
    seenGeom.add(key);
    out.push(row.option);
    if (out.length >= limit) break;
  }

  return out;
}
