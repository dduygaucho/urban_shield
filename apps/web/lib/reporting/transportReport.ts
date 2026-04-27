import type { NormalizedRouteMetadata, TransportRouteType } from "./routeLookup";

/**
 * Optional incident payload fields for transport-linked reports
 * (mirrors `IncidentCreatePayload` in `@schemas/incident`).
 */
export type TransportReportFields = {
  route_type: string;
  route_external_id: string;
  route_label: string;
  geometry_ref: string;
};

export type ReportMode = "location" | "transport";

type BuildInput = {
  reportMode: ReportMode;
  /** Set when lookup resolved a row from the static index, or from future parent wiring. */
  resolvedRoute?: NormalizedRouteMetadata | null;
  /**
   * If no resolved row yet, you may still want to tag type + free-text label from the form.
   * Omitted `geometry_ref` / `route_external_id` unless you pass them.
   */
  routeTypeInput?: TransportRouteType | null;
  routeQueryText?: string;
  /** If true, `routeQueryText` is used as a provisional `route_label` when no `resolvedRoute`. */
  useQueryAsLabelWhenUnresolved?: boolean;
};

/**
 * Builds only optional transport fields for an incident create payload.
 * Returns `{}` when not in transport mode, or when there is nothing to include.
 * Pure (no I/O).
 */
export function buildTransportReportFields(
  input: BuildInput,
): Partial<TransportReportFields> {
  if (input.reportMode !== "transport") {
    return {};
  }

  if (input.resolvedRoute) {
    const r = input.resolvedRoute;
    return {
      route_type: r.route_type,
      route_external_id: r.route_external_id,
      route_label: r.route_label,
      geometry_ref: r.geometry_ref,
    };
  }

  const out: Partial<TransportReportFields> = {};
  const t = input.routeTypeInput;
  if (t) {
    out.route_type = t;
  }
  if (input.useQueryAsLabelWhenUnresolved) {
    const q = (input.routeQueryText ?? "").trim();
    if (q) {
      out.route_label = q;
    }
  }
  return out;
}
