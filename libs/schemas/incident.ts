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

/** VIC transport route mode; matches normalized GTFS pipeline + API validation. */
export const TRANSPORT_ROUTE_TYPES = ["bus", "train", "tram"] as const;
export type TransportRouteType = (typeof TRANSPORT_ROUTE_TYPES)[number];

export type CanonicalIncidentRecord = {
  id: string;
  source: string;
  type: IncidentType;
  timestamp: string;
  lat: number;
  lng: number;
  duration_class: DurationClass;
  confidence?: number | null;
  /**
   * Optional transport route metadata; point-only incidents omit these.
   * route_external_id: stable unique join key; route_label: display only; geometry_ref: client geometry pointer.
   */
  route_type?: TransportRouteType | null;
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
  route_type?: TransportRouteType | null;
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
  /** GET /incidents — optional enrichment (news ingest, verification). */
  source_url?: string | null;
  evidence_sources?: string | null;
  verification_status?: string | null;
  verification_reason?: string | null;
  source_category?: string | null;
};
