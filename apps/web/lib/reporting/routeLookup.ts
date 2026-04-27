/**
 * Client-side route query → normalized route metadata.
 * Data-source agnostic: pass static index via `entries` from a parent or fixture later.
 */

export const TRANSPORT_ROUTE_TYPES = ["bus", "train", "tram"] as const;
export type TransportRouteType = (typeof TRANSPORT_ROUTE_TYPES)[number];

/** One row in a static route index (aligns with incident `route_*` + `geometry_ref`). */
export type RouteIndexEntry = {
  route_type: TransportRouteType;
  route_external_id: string;
  route_label: string;
  geometry_ref: string;
};

/** Subset of fields used for display / payload; equals RouteIndexEntry for the prototype index. */
export type NormalizedRouteMetadata = {
  route_type: TransportRouteType;
  route_external_id: string;
  route_label: string;
  geometry_ref: string;
};

export type RouteLookupOptions = {
  query: string;
  /** If set, only consider entries of this type. */
  routeType?: TransportRouteType;
  /** Candidate routes (e.g. static index). */
  entries: readonly RouteIndexEntry[];
  /**
   * Matching order: exact on id/label, then `startsWith`, then `contains`.
   * @default "exact"
   */
  matchStrategy?: "exact" | "startsWith" | "contains" | "all";
};

/**
 * Normalizes a user-typed query for comparison (trim + case-fold).
 */
export function normalizeRouteQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Resolves a route query to normalized route metadata using the provided index.
 * Returns the first best match; no match if query is empty or nothing matches.
 */
export function lookupRoute(
  options: RouteLookupOptions,
): { match: NormalizedRouteMetadata | null; strategy: "exact" | "startsWith" | "contains" | null } {
  const { query, routeType, entries, matchStrategy = "all" } = options;
  const q = normalizeRouteQuery(query);
  if (!q) {
    return { match: null, strategy: null };
  }

  const list = routeType
    ? entries.filter((e) => e.route_type === routeType)
    : [...entries];

  const toComparable = (e: RouteIndexEntry) => ({
    type: e.route_type,
    id: normalizeRouteQuery(e.route_external_id),
    label: normalizeRouteQuery(e.route_label),
  });

  const tryExact = (): NormalizedRouteMetadata | null => {
    for (const e of list) {
      const c = toComparable(e);
      if (c.id === q || c.label === q) {
        return {
          route_type: e.route_type,
          route_external_id: e.route_external_id,
          route_label: e.route_label,
          geometry_ref: e.geometry_ref,
        };
      }
    }
    return null;
  };

  const tryStartsWith = (): NormalizedRouteMetadata | null => {
    for (const e of list) {
      const c = toComparable(e);
      if (c.id.startsWith(q) || c.label.startsWith(q)) {
        return {
          route_type: e.route_type,
          route_external_id: e.route_external_id,
          route_label: e.route_label,
          geometry_ref: e.geometry_ref,
        };
      }
    }
    return null;
  };

  const tryContains = (): NormalizedRouteMetadata | null => {
    for (const e of list) {
      const c = toComparable(e);
      if (c.id.includes(q) || c.label.includes(q)) {
        return {
          route_type: e.route_type,
          route_external_id: e.route_external_id,
          route_label: e.route_label,
          geometry_ref: e.geometry_ref,
        };
      }
    }
    return null;
  };

  if (matchStrategy === "exact" || matchStrategy === "all") {
    const m = tryExact();
    if (m) return { match: m, strategy: "exact" };
  }
  if (matchStrategy === "startsWith" || matchStrategy === "all") {
    const m = tryStartsWith();
    if (m) return { match: m, strategy: "startsWith" };
  }
  if (matchStrategy === "contains" || matchStrategy === "all") {
    const m = tryContains();
    if (m) return { match: m, strategy: "contains" };
  }

  return { match: null, strategy: null };
}

export type RouteCandidateListOptions = RouteLookupOptions & {
  /** Max suggestions (default 15). */
  limit?: number;
};

function entryToMetadata(e: RouteIndexEntry): NormalizedRouteMetadata {
  return {
    route_type: e.route_type,
    route_external_id: e.route_external_id,
    route_label: e.route_label,
    geometry_ref: e.geometry_ref,
  };
}

/**
 * Returns ranked route suggestions for autocomplete (exact → startsWith → contains), deduped by `route_external_id`.
 */
export function listRouteCandidates(options: RouteCandidateListOptions): NormalizedRouteMetadata[] {
  const { query, routeType, entries, limit = 15 } = options;
  const q = normalizeRouteQuery(query);
  if (!q) {
    return [];
  }

  const list = routeType ? entries.filter((e) => e.route_type === routeType) : [...entries];

  const toComparable = (e: RouteIndexEntry) => ({
    id: normalizeRouteQuery(e.route_external_id),
    label: normalizeRouteQuery(e.route_label),
  });

  const seen = new Set<string>();
  const out: NormalizedRouteMetadata[] = [];

  const pushUnique = (e: RouteIndexEntry) => {
    if (seen.has(e.route_external_id)) return;
    seen.add(e.route_external_id);
    out.push(entryToMetadata(e));
  };

  for (const e of list) {
    const c = toComparable(e);
    if (c.id === q || c.label === q) {
      pushUnique(e);
    }
  }
  if (out.length >= limit) return out.slice(0, limit);

  for (const e of list) {
    const c = toComparable(e);
    if (c.id.startsWith(q) || c.label.startsWith(q)) {
      pushUnique(e);
    }
  }
  if (out.length >= limit) return out.slice(0, limit);

  for (const e of list) {
    const c = toComparable(e);
    if (c.id.includes(q) || c.label.includes(q)) {
      pushUnique(e);
    }
  }

  return out.slice(0, limit);
}
