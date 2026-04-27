/**
 * High-contrast palette for concurrent transport route highlights (Mapbox `match` on `geometry_ref`).
 * Order chosen for visual separation on typical map backgrounds.
 */
export const ROUTE_HIGHLIGHT_PALETTE = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#ea580c",
  "#0d9488",
  "#b45309",
  "#7c3aed",
] as const;

/** Mapbox GL expression: distinct color per ref; default for unmatched features. */
export function buildRouteLineColorMatchExpression(
  refs: readonly string[],
  defaultColor: string,
): unknown {
  if (refs.length === 0) return defaultColor;
  const sorted = [...refs].sort();
  const pairs: unknown[] = [];
  sorted.forEach((ref, i) => {
    pairs.push(ref, ROUTE_HIGHLIGHT_PALETTE[i % ROUTE_HIGHLIGHT_PALETTE.length]);
  });
  return ["match", ["get", "geometry_ref"], ...pairs, defaultColor];
}
