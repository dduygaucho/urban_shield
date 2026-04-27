/** Canonical list of map top-level action modes (order is not semantic). */
export const MAP_ACTION_MODES = ["browse", "report", "route", "peerWalkFuture"] as const;

export type MapActionMode = (typeof MAP_ACTION_MODES)[number];

/** Runtime guard for parsing external values (URL, storage) into {@link MapActionMode}. */
export function isMapActionMode(value: unknown): value is MapActionMode {
  return typeof value === "string" && (MAP_ACTION_MODES as readonly string[]).includes(value);
}

