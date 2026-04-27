import type { TransportRouteType } from "@/lib/reporting/routeLookup";
import type { RouteOption } from "@/lib/routing/contracts";

export function isTransportRouteType(s: string | undefined | null): s is TransportRouteType {
  return s === "bus" || s === "train" || s === "tram";
}

/** Short heading for PT leg (segments row title). */
export function transitKindShortLabel(rt: TransportRouteType): string {
  switch (rt) {
    case "tram":
      return "Tram";
    case "train":
      return "Train";
    default:
      return "Bus";
  }
}

/** Footer text on route cards: `walk`, specific `route_type`, or fallback phrase. */
export function routeOptionFooterModeLabel(option: RouteOption): string {
  if (option.mode === "walking") return "walk";
  const raw = option.metadata?.route_type;
  if (typeof raw === "string" && isTransportRouteType(raw)) return raw;
  return "public transport";
}
