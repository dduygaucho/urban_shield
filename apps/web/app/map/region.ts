/**
 * Map is limited to Greater Melbourne + Geelong corridor so the default view
 * is regional (not world-scale) and panning stays local.
 *
 * Coordinates: [longitude, latitude] (Mapbox / GeoJSON order).
 */
import type { LngLatBoundsLike } from "mapbox-gl";

/** Southwest then northeast corners — user cannot pan outside this box. */
export const REGION_MAX_BOUNDS: LngLatBoundsLike = [
  [143.35, -38.72], // SW — past Geelong / Otways edge
  [146.05, -37.35], // NE — past Melbourne NE / Yarra Ranges edge
];

/** Default when geolocation is off, denied, or outside the region. */
export const DEFAULT_CENTER_MELBOURNE: [number, number] = [144.9631, -37.8136];

/** Geelong CBD — optional focus (same bounds still include both cities). */
export const CENTER_GEELONG: [number, number] = [144.3606, -38.1499];

const [[west, south], [east, north]] = REGION_MAX_BOUNDS as [
  [number, number],
  [number, number],
];

export function isInsideRegion(lng: number, lat: number): boolean {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/** If outside region, fall back to `fallback` (Melbourne or Geelong, etc.). */
export function regionCenterOrDefault(
  lng: number,
  lat: number,
  fallback: [number, number] = DEFAULT_CENTER_MELBOURNE
): [number, number] {
  return isInsideRegion(lng, lat) ? [lng, lat] : fallback;
}
