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

export type IncidentCreatePayload = {
  category: IncidentCategory;
  description: string;
  lat: number;
  lng: number;
};

export type IncidentRecord = {
  id: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  created_at: string;
};
