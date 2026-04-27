import type { IncidentRecord } from "@schemas/incident";
import type { RouteIncidentSummary, RouteOption, SafetyScoreBreakdown } from "@/lib/routing/contracts";

type LngLat = [number, number];

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

function severityWeightFromIncident(inc: IncidentRecord): number {
  const category = String(inc.type ?? inc.category ?? "suspicious").toLowerCase();
  if (category.includes("violence")) return 1.0;
  if (category.includes("crime")) return 0.9;
  if (category.includes("harassment")) return 0.75;
  if (category.includes("intoxication")) return 0.6;
  return 0.5;
}

function recencyFactor(timestamp: string): number {
  const timeMs = Date.parse(timestamp);
  if (!Number.isFinite(timeMs)) return 0.55;
  const ageHours = Math.max(0, (Date.now() - timeMs) / 3_600_000);
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.8;
  if (ageHours <= 72) return 0.65;
  return 0.45;
}

function pointToSegmentDistanceMeters(point: LngLat, a: LngLat, b: LngLat): number {
  const avgLat = (a[1] + b[1] + point[1]) / 3;
  const latScale = 111_320;
  const lngScale = Math.max(1, 111_320 * Math.cos(toRadians(avgLat)));

  const px = point[0] * lngScale;
  const py = point[1] * latScale;
  const ax = a[0] * lngScale;
  const ay = a[1] * latScale;
  const bx = b[0] * lngScale;
  const by = b[1] * latScale;

  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.hypot(dx, dy);
  }
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return Math.hypot(px - qx, py - qy);
}

export function distancePointToRouteMeters(point: LngLat, line: GeoJSON.LineString): number {
  const coords = line.coordinates as LngLat[];
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) return haversineMeters(point, coords[0]);

  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < coords.length; i += 1) {
    const d = pointToSegmentDistanceMeters(point, coords[i - 1], coords[i]);
    if (d < min) min = d;
  }
  return min;
}

function incidentTimestamp(inc: IncidentRecord): string {
  return String(inc.timestamp ?? inc.created_at ?? new Date().toISOString());
}

function incidentSource(inc: IncidentRecord): string {
  return String(inc.source ?? "user-report");
}

function incidentType(inc: IncidentRecord): string {
  return String(inc.type ?? inc.category ?? "suspicious");
}

function incidentDescription(inc: IncidentRecord): string {
  return String(inc.description ?? "No details provided");
}

export function summarizeIncidentsNearRoute(params: {
  routeGeometry: GeoJSON.LineString;
  incidents: IncidentRecord[];
  radiusMeters: number;
}): RouteIncidentSummary[] {
  const { routeGeometry, incidents, radiusMeters } = params;

  const summaries: RouteIncidentSummary[] = [];
  for (const inc of incidents) {
    if (typeof inc.lat !== "number" || typeof inc.lng !== "number") continue;
    const distanceMeters = distancePointToRouteMeters([inc.lng, inc.lat], routeGeometry);
    if (!Number.isFinite(distanceMeters) || distanceMeters > radiusMeters) continue;
    summaries.push({
      id: String(inc.id),
      type: incidentType(inc),
      description: incidentDescription(inc),
      source: incidentSource(inc),
      timestamp: incidentTimestamp(inc),
      lat: inc.lat,
      lng: inc.lng,
      distanceMeters,
      severityWeight: severityWeightFromIncident(inc),
    });
  }

  return summaries.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function scoreRouteFromIncidents(incidents: RouteIncidentSummary[]): {
  safetyScore: number;
  scoreBreakdown: SafetyScoreBreakdown;
} {
  const baseScore = 100;
  let distancePenalty = 0;
  let severityPenalty = 0;
  let recencyPenalty = 0;

  for (const incident of incidents) {
    const distanceFactor = Math.max(0.15, 1 - incident.distanceMeters / 1_000);
    const severityFactor = incident.severityWeight;
    const recency = recencyFactor(incident.timestamp);
    distancePenalty += distanceFactor * 5;
    severityPenalty += severityFactor * 4;
    recencyPenalty += recency * 3;
  }

  const totalPenalty = distancePenalty + severityPenalty + recencyPenalty;
  const safetyScore = Math.max(0, Math.min(100, Math.round(baseScore - totalPenalty)));

  return {
    safetyScore,
    scoreBreakdown: {
      baseScore,
      incidentCount: incidents.length,
      distancePenalty: Number(distancePenalty.toFixed(2)),
      severityPenalty: Number(severityPenalty.toFixed(2)),
      recencyPenalty: Number(recencyPenalty.toFixed(2)),
      totalPenalty: Number(totalPenalty.toFixed(2)),
    },
  };
}

export function enrichAndRankRoutes(params: {
  routes: RouteOption[];
  incidents: IncidentRecord[];
  radiusMeters: number;
}): RouteOption[] {
  const { routes, incidents, radiusMeters } = params;
  const scored = routes.map((route) => {
    const nearby = summarizeIncidentsNearRoute({
      routeGeometry: route.geometry,
      incidents,
      radiusMeters,
    });
    const { safetyScore, scoreBreakdown } = scoreRouteFromIncidents(nearby);
    return {
      ...route,
      incidents: nearby,
      safetyScore,
      scoreBreakdown,
    };
  });

  return scored
    .sort((a, b) => b.safetyScore - a.safetyScore)
    .map((route, index) => ({ ...route, safetyRank: index + 1 }));
}

