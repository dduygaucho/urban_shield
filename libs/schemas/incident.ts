/**
 * Shared incident types — mirrors fixed API contract (do not change shapes).
 * Owner: Integration (Person 4). Consumers: map + report pages.
 */

export const INCIDENT_CATEGORIES = [
  "crime",
  "harassment",
  "intoxication",
  "suspicious",
  "violence",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentType = IncidentCategory;

export const DURATION_CLASSES = ["short_term", "long_term"] as const;
export type DurationClass = (typeof DURATION_CLASSES)[number];

export type CanonicalIncidentRecord = {
  id: string;
  source: string;
  type: IncidentType;
  timestamp: string;
  lat: number;
  lng: number;
  duration_class: DurationClass;
  confidence?: number | null;
  /** Optional transport route metadata; point-only incidents omit these. */
  route_type?: string | null;
  route_external_id?: string | null;
  route_label?: string | null;
  geometry_ref?: string | null;
};

export type IncidentCreatePayload = {
  source?: string;
  type?: IncidentType;
  timestamp?: string;
  duration_class?: DurationClass;
  confidence?: number | null;
  category?: IncidentCategory;
  description?: string;
  lat: number;
  lng: number;
  route_type?: string | null;
  route_external_id?: string | null;
  route_label?: string | null;
  geometry_ref?: string | null;
};

export type IncidentRecord = Partial<CanonicalIncidentRecord> & {
  // Compatibility fields retained for the existing map UI.
  id: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  created_at: string;
};
