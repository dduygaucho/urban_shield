/** Max route options shown for walk and public transport planning (Mapbox + synthetic merge uses the same cap). */
export const ROUTE_CANDIDATE_LIMIT = 5;

export type RouteTravelMode = "walking" | "publicTransport";

export type RouteIncidentSummary = {
  id: string;
  type: string;
  description: string;
  source: string;
  timestamp: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  severityWeight: number;
};

export type SafetyScoreBreakdown = {
  baseScore: number;
  incidentCount: number;
  distancePenalty: number;
  severityPenalty: number;
  recencyPenalty: number;
  totalPenalty: number;
};

export type RouteOption = {
  id: string;
  mode: RouteTravelMode;
  label: string;
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationMinutes: number;
  safetyScore: number;
  safetyRank: number;
  incidents: RouteIncidentSummary[];
  scoreBreakdown: SafetyScoreBreakdown;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

