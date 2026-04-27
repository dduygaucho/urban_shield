/**
 * Point-incident danger zone style rules: severity × zoom, pure helpers for map integration.
 * Map-library-agnostic: consumers apply these values to Mapbox/Leaflet/etc.
 */

import type { IncidentRecord } from "@schemas/incident";
import {
  getZoomBand,
  getZoomIntensityMultiplier,
  isLabelVisible,
  type ZoomBand,
} from "./zoomRules";

export type DangerSeverity = "high" | "medium" | "low";

/**
 * Extended incident input for layer rendering. Optional fields may arrive after transport contract merge.
 * Keeps compatibility with current {@link IncidentRecord} while allowing confidence-based tuning.
 */
export type MapLayerIncident = IncidentRecord & {
  /** Optional 0..1; when set, drives severity before category heuristics. */
  confidence?: number | null;
  route_type?: string | null;
  route_external_id?: string | null;
  route_label?: string | null;
  geometry_ref?: string | null;
};

export type DangerZoneStyle = {
  radiusMeters: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
  showLabel: boolean;
  labelMaxChars: number;
};

export type DangerZoneRenderModel = {
  incidentId: string;
  lat: number;
  lng: number;
  severity: DangerSeverity;
  zoomBand: ZoomBand;
  style: DangerZoneStyle;
  labelText: string;
};

const BASE_RADIUS_M: Record<DangerSeverity, number> = {
  high: 210,
  medium: 150,
  low: 95,
};

/** Prototype red scale; fill uses alpha via fillOpacity. */
const FILL_COLOR = "#ef4444";
const STROKE_COLOR = "#b91c1c";

type SeverityStyleBase = {
  fillOpacity: number;
  strokeOpacity: number;
  strokeWidth: number;
};

const SEVERITY_BASE: Record<DangerSeverity, SeverityStyleBase> = {
  high: { fillOpacity: 0.38, strokeOpacity: 0.95, strokeWidth: 3.0 },
  medium: { fillOpacity: 0.28, strokeOpacity: 0.8, strokeWidth: 2.5 },
  low: { fillOpacity: 0.18, strokeOpacity: 0.65, strokeWidth: 2.0 },
};

const BAND_RADIUS_FACTOR: Record<ZoomBand, number> = {
  /** Larger soft zones when zoomed out so radar reads clearly. */
  overview: 1.38,
  normal: 1.12,
  /** Street level: still readable without dominating. */
  detail: 1.05,
};

const BAND_OPACITY_FACTOR: Record<ZoomBand, number> = {
  overview: 0.72,
  normal: 0.9,
  detail: 1.0,
};

/**
 * Deterministic severity: prefer numeric confidence when finite; else category keyword rules; else medium.
 */
export function inferDangerSeverity(incident: MapLayerIncident): DangerSeverity {
  const c = incident.confidence;
  if (typeof c === "number" && Number.isFinite(c)) {
    if (c >= 0.72) return "high";
    if (c >= 0.38) return "medium";
    return "low";
  }

  const cat = (incident.category || "").toLowerCase();
  if (cat === "violence" || cat === "crime") return "high";
  if (cat === "harassment" || cat === "intoxication") return "medium";
  if (cat === "suspicious") return "low";
  return "medium";
}

function applyOpacityScale(base: number, zoom: number): number {
  const m = getZoomIntensityMultiplier(zoom);
  return Math.min(1, Math.max(0, base * m));
}

/**
 * Core style for a point danger zone at a given map zoom and severity.
 */
export function getDangerZoneStyle(input: { zoom: number; severity: DangerSeverity }): DangerZoneStyle {
  const { zoom, severity } = input;
  const band = getZoomBand(zoom);
  const sev = SEVERITY_BASE[severity];
  const bandOp = BAND_OPACITY_FACTOR[band];
  const bandR = BAND_RADIUS_FACTOR[band];
  const radiusMeters = BASE_RADIUS_M[severity] * bandR * getZoomIntensityMultiplier(zoom);

  const fillOpacity = applyOpacityScale(sev.fillOpacity * bandOp, zoom);
  const strokeOpacity = applyOpacityScale(sev.strokeOpacity * bandOp, zoom);
  const strokeWidth = sev.strokeWidth * (band === "detail" ? 1.05 : band === "overview" ? 0.92 : 1.0);

  return {
    radiusMeters: Math.round(radiusMeters * 10) / 10,
    fillColor: FILL_COLOR,
    fillOpacity: Math.round(fillOpacity * 1000) / 1000,
    strokeColor: STROKE_COLOR,
    strokeOpacity: Math.round(strokeOpacity * 1000) / 1000,
    strokeWidth: Math.round(strokeWidth * 100) / 100,
    showLabel: isLabelVisible(zoom),
    labelMaxChars: band === "detail" ? 48 : 0,
  };
}

function truncateLabel(s: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  const t = s.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

/**
 * Full render model for one incident: geometry anchor + style + label hint for integrators.
 */
export function buildDangerZoneRenderModel(incident: MapLayerIncident, zoom: number): DangerZoneRenderModel {
  const severity = inferDangerSeverity(incident);
  const style = getDangerZoneStyle({ zoom, severity });
  const category = (incident.category || "incident").trim();
  const labelText = style.showLabel ? truncateLabel(category, style.labelMaxChars) : "";

  return {
    incidentId: incident.id,
    lat: incident.lat,
    lng: incident.lng,
    severity,
    zoomBand: getZoomBand(zoom),
    style,
    labelText,
  };
}
