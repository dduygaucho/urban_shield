/**
 * Frontend ↔ backend integration (Person 4).
 * Uses NEXT_PUBLIC_API_BASE_URL (see apps/web/.env.example).
 */
import type { IncidentCreatePayload, IncidentRecord } from "@schemas/incident";

const base = () => {
  const b = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (!b && typeof window !== "undefined") {
    console.warn("NEXT_PUBLIC_API_BASE_URL is not set; API calls will fail.");
  }
  return b;
};

export async function createIncident(payload: IncidentCreatePayload): Promise<IncidentRecord> {
  const res = await fetch(`${base()}/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to create incident (${res.status})`);
  }
  return res.json() as Promise<IncidentRecord>;
}

export type GetIncidentsParams = {
  lat: number;
  lng: number;
  radius: number;
  hours: number;
};

export async function getIncidents(params: GetIncidentsParams): Promise<IncidentRecord[]> {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radius: String(params.radius),
    hours: String(params.hours),
  });
  const res = await fetch(`${base()}/incidents?${q.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to fetch incidents (${res.status})`);
  }
  return res.json() as Promise<IncidentRecord[]>;
}
