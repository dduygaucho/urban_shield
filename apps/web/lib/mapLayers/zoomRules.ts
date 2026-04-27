/**
 * Prototype-only zoom band rules for danger zones and transport route layers.
 * Deterministic thresholds match transport incident UX plan: detail at z>=14, overview z<11.
 */

export type ZoomBand = "detail" | "normal" | "overview";

const ZOOM_MIN = 0;
const ZOOM_MAX = 24;
/** Aligned with map default zoom in map page: neighborhood scale. */
const ZOOM_FALLBACK = 11;

/**
 * Clamps zoom to a sane range; NaN/Inf fall back to {@link ZOOM_FALLBACK}.
 */
export function clampZoom(zoom: number): number {
  if (typeof zoom !== "number" || !Number.isFinite(zoom)) return ZOOM_FALLBACK;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * - `detail`: z >= 14 (markers, rings, labels)
 * - `normal`: 11 <= z < 14
 * - `overview`: z < 11 (broad zones / persistent route stroke)
 */
export function getZoomBand(zoom: number): ZoomBand {
  const z = clampZoom(zoom);
  if (z >= 14) return "detail";
  if (z >= 11) return "normal";
  return "overview";
}

/** Short text hints are only shown in the detail band. */
export function isLabelVisible(zoom: number): boolean {
  return getZoomBand(zoom) === "detail";
}

/**
 * Scales visual intensity for fill/stroke/radius. Deterministic, no randomness.
 * - detail: slightly stronger (readable when zoomed in)
 * - overview: softer (avoid visual noise when zoomed out)
 */
export function getZoomIntensityMultiplier(zoom: number): number {
  const band = getZoomBand(zoom);
  if (band === "detail") return 1.15;
  if (band === "normal") return 1.0;
  return 0.75;
}
