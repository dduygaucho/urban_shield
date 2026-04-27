/**
 * Transport route warning highlight rules (affected line geometry).
 * Use when an incident includes optional route linkage fields; point danger zones can be rendered separately.
 */

import type { DurationClass } from "@schemas/incident";
import type { MapLayerIncident } from "./dangerZones";
import { getZoomBand, getZoomIntensityMultiplier, isLabelVisible, type ZoomBand } from "./zoomRules";

export type RouteHighlightLevel = "activeDanger" | "caution" | "inactive";

export type TransportRouteStyle = {
  lineColor: string;
  lineOpacity: number;
  lineWidth: number;
  /** Secondary stroke for contrast on basemap. */
  outlineColor: string;
  outlineOpacity: number;
  outlineWidth: number;
  showLabel: boolean;
};

export type TransportRouteRenderModel = {
  incidentId: string;
  /** Human-readable route name/number for optional map labels. */
  routeLabel: string;
  /** Resolved highlight level; `inactive` still draws a dim line for context when linked. */
  highlightLevel: RouteHighlightLevel;
  zoomBand: ZoomBand;
  style: TransportRouteStyle;
};

const LEVEL_STYLES: Record<
  RouteHighlightLevel,
  { line: string; outline: string; lineOpacity: number; outlineOpacity: number; width: number }
> = {
  /** "Red" active / long-term disruption emphasis. */
  activeDanger: {
    line: "#dc2626",
    outline: "#7f1d1d",
    lineOpacity: 0.95,
    outlineOpacity: 0.55,
    width: 5.2,
  },
  /** "Amber" recent / short-term caution. */
  caution: {
    line: "#d97706",
    outline: "#78350f",
    lineOpacity: 0.88,
    outlineOpacity: 0.48,
    width: 4.2,
  },
  /** Dim reference when route is linked but not emphasized. */
  inactive: {
    line: "#94a3b8",
    outline: "#475569",
    lineOpacity: 0.45,
    outlineOpacity: 0.3,
    width: 2.0,
  },
};

function isNonEmpty(s: string | null | undefined): boolean {
  return String(s || "").trim().length > 0;
}

/**
 * True when the incident is intended to be linked to a static transport route / geometry.
 */
export function hasTransportRouteLink(incident: MapLayerIncident): boolean {
  if (isNonEmpty(incident.geometry_ref)) return true;
  if (isNonEmpty(incident.route_external_id)) return true;
  const rt = String(incident.route_type || "").trim();
  const label = String(incident.route_label || "").trim();
  return rt.length > 0 && label.length > 0;
}

function durationValue(incident: MapLayerIncident): DurationClass | undefined {
  const d = incident.duration_class;
  if (d === "short_term" || d === "long_term") return d;
  return undefined;
}

/**
 * Maps duration + transport presence to a highlight tier. If no transport link, returns `inactive`
 * (caller should usually skip layer via {@link buildTransportRouteRenderModel} which returns `null` first).
 */
export function getRouteHighlightLevel(incident: MapLayerIncident): RouteHighlightLevel {
  if (!hasTransportRouteLink(incident)) return "inactive";
  const dur = durationValue(incident);
  if (dur === "long_term") return "activeDanger";
  if (dur === "short_term") return "caution";
  // Missing duration: default to caution (prototype-safe).
  return "caution";
}

const BAND_WIDTH_FACTOR: Record<ZoomBand, number> = {
  overview: 1.2,
  normal: 1.0,
  detail: 0.95,
};

/**
 * Stroke styling for a route highlight at a map zoom and logical level.
 */
export function getTransportRouteStyle(input: { zoom: number; level: RouteHighlightLevel }): TransportRouteStyle {
  const { zoom, level } = input;
  const def = LEVEL_STYLES[level];
  const band = getZoomBand(zoom);
  const wMult = BAND_WIDTH_FACTOR[band] * getZoomIntensityMultiplier(zoom);
  const lineWidth = def.width * wMult;
  const outlineWidth = def.width * wMult * 0.45;

  return {
    lineColor: def.line,
    lineOpacity: Math.round(def.lineOpacity * 1000) / 1000,
    lineWidth: Math.round(lineWidth * 100) / 100,
    outlineColor: def.outline,
    outlineOpacity: Math.round(def.outlineOpacity * 1000) / 1000,
    outlineWidth: Math.round(outlineWidth * 100) / 100,
    showLabel: isLabelVisible(zoom) && level !== "inactive",
  };
}

/**
 * Resolves a short label for tooltips / line annotations.
 */
function resolveRouteLabel(incident: MapLayerIncident): string {
  const label = String(incident.route_label || "").trim();
  const id = String(incident.route_external_id || "").trim();
  const mode = String(incident.route_type || "").trim();
  if (label && mode) return `${label} (${mode})`;
  if (label) return label;
  if (id && mode) return `${id} (${mode})`;
  if (id) return id;
  if (isNonEmpty(incident.geometry_ref)) return "Route";
  return "Route";
}

/**
 * When {@link hasTransportRouteLink} is false, returns `null` (no route overlay).
 */
export function buildTransportRouteRenderModel(
  incident: MapLayerIncident,
  zoom: number
): TransportRouteRenderModel | null {
  if (!hasTransportRouteLink(incident)) return null;
  const highlightLevel = getRouteHighlightLevel(incident);
  const style = getTransportRouteStyle({ zoom, level: highlightLevel });
  return {
    incidentId: incident.id,
    routeLabel: resolveRouteLabel(incident),
    highlightLevel,
    zoomBand: getZoomBand(zoom),
    style,
  };
}
