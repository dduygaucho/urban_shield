"use client";

import { useMemo, useState } from "react";
import { GeocoderSearch } from "@/app/map/GeocoderSearch";
import type { RouteOption, RouteTravelMode } from "@/lib/routing/contracts";
import { RouteOptionCard } from "@/app/map/components/RouteOptionCard";
import type { RouteSegmentSummaryDisplay } from "@/app/map/components/RouteOptionCard";

/** Explicit UI phase for start / destination (integrator may set; otherwise derived from coords). */
export type RouteEndpointUiState =
  | "empty"
  | "selectingOnMap"
  | "selected"
  | "selectedFromSearch"
  | "selectedFromMapCenter";

/**
 * Marker-related display contract for map integration (parent maps visibility/placement to real markers).
 * All fields optional except where noted — parent can ignore until wired in page.tsx (Duy-F).
 */
export type RouteEndpointMarkerContract = {
  /** Whether the map should show a marker for this endpoint. */
  visible: boolean;
  /** How the current coordinates were chosen (for icon/tooltip parity). */
  placementSource?: "search" | "mapCenter" | "mapPick";
  /** Short label for marker tooltip / accessibility. */
  label?: string;
};

export type RoutePanelDock = "left" | "right" | "bottom";

type Props = {
  open: boolean;
  dock?: RoutePanelDock;
  mapboxToken: string;
  proximity?: { longitude: number; latitude: number };
  mode: RouteTravelMode;
  onModeChange: (mode: RouteTravelMode) => void;
  start: { lng: number; lat: number } | null;
  end: { lng: number; lat: number } | null;
  onStartPick: (lng: number, lat: number) => void;
  onEndPick: (lng: number, lat: number) => void;
  onUseMapCenterForStart: () => void;
  onUseMapCenterForEnd: () => void;
  onFindRoutes: () => void;
  loading: boolean;
  options: RouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  /** When omitted, derived from `start` + optional `startMarker`. */
  startUiState?: RouteEndpointUiState;
  /** When omitted, derived from `end` + optional `endMarker`. */
  destinationUiState?: RouteEndpointUiState;
  startMarker?: RouteEndpointMarkerContract;
  endMarker?: RouteEndpointMarkerContract;
  /**
   * Optional segment summary per option (e.g. from parent state).
   * If omitted, panel may still supply summaries from `option.metadata` (see `segmentSummaryFromRouteMetadata`).
   */
  segmentSummaryForOption?: (option: RouteOption) => RouteSegmentSummaryDisplay | undefined;
};

function formatPoint(p: { lng: number; lat: number } | null): string {
  if (!p) return "Not set";
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

function deriveEndpointUiState(
  coords: { lng: number; lat: number } | null,
  explicit: RouteEndpointUiState | undefined,
  markerPlacement: RouteEndpointMarkerContract["placementSource"] | undefined,
): RouteEndpointUiState {
  if (explicit) return explicit;
  if (!coords) return "empty";
  if (markerPlacement === "mapCenter") return "selectedFromMapCenter";
  if (markerPlacement === "search") return "selectedFromSearch";
  if (markerPlacement === "mapPick") return "selectedFromSearch";
  return "selected";
}

function defaultMarkerContract(coords: { lng: number; lat: number } | null): RouteEndpointMarkerContract {
  return {
    visible: !!coords,
    placementSource: undefined,
    label: undefined,
  };
}

function mergeMarkerContract(
  coords: { lng: number; lat: number } | null,
  override?: RouteEndpointMarkerContract,
): RouteEndpointMarkerContract {
  const base = defaultMarkerContract(coords);
  if (!override) return base;
  return {
    ...base,
    ...override,
    visible: override.visible !== undefined ? override.visible : base.visible,
  };
}

function uiStateLabel(state: RouteEndpointUiState): string {
  switch (state) {
    case "empty":
      return "Not set";
    case "selectingOnMap":
      return "Picking on map";
    case "selected":
      return "Set";
    case "selectedFromSearch":
      return "From search";
    case "selectedFromMapCenter":
      return "Map center";
    default:
      return state;
  }
}

function uiStateChipClass(state: RouteEndpointUiState): string {
  switch (state) {
    case "empty":
      return "bg-slate-200/80 text-slate-700";
    case "selectingOnMap":
      return "bg-amber-100 text-amber-900 ring-1 ring-amber-200";
    case "selected":
      return "bg-slate-300/90 text-slate-800 ring-1 ring-slate-300";
    case "selectedFromSearch":
      return "bg-blue-100 text-blue-900 ring-1 ring-blue-200";
    case "selectedFromMapCenter":
      return "bg-violet-100 text-violet-900 ring-1 ring-violet-200";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

/**
 * Optional convention on `RouteOption.metadata` for segment rows without page changes.
 * Keys are stringly-typed for metadata record compatibility.
 *
 * Walking-only: `segment_display` = `walking_only`, optional `walk_seg_0_label`, `walk_seg_0_m`, `walk_seg_0_min` (repeat index 0..n or single segment from route totals).
 * Bus + final walk: `segment_display` = `bus_final_walk`, `segment_bus_label`, `segment_final_walk_m`, `segment_final_walk_min`, optional `segment_final_walk_label`.
 */
export function segmentSummaryFromRouteMetadata(option: RouteOption): RouteSegmentSummaryDisplay | undefined {
  const m = option.metadata;
  if (!m) return undefined;
  const raw = m.segment_display ?? m.segmentDisplay;
  const display = typeof raw === "string" ? raw.toLowerCase().replace(/-/g, "_") : "";

  if (display === "walking_only" || display === "walkingonly") {
    const label = typeof m.walk_seg_0_label === "string" ? m.walk_seg_0_label : "Walk";
    const dm = typeof m.walk_seg_0_m === "number" ? m.walk_seg_0_m : option.distanceMeters;
    const dur = typeof m.walk_seg_0_min === "number" ? m.walk_seg_0_min : option.durationMinutes;
    return {
      kind: "walking-only",
      segments: [{ label, distanceMeters: dm, durationMinutes: dur }],
    };
  }

  if (display === "bus_final_walk" || display === "bus_plus_final_walk_home") {
    const busSummary =
      typeof m.segment_bus_label === "string" ? m.segment_bus_label : option.label;
    const finalWalkHome = {
      label: typeof m.segment_final_walk_label === "string" ? m.segment_final_walk_label : undefined,
      distanceMeters: typeof m.segment_final_walk_m === "number" ? m.segment_final_walk_m : undefined,
      durationMinutes: typeof m.segment_final_walk_min === "number" ? m.segment_final_walk_min : undefined,
    };
    return {
      kind: "bus_plus_final_walk_home",
      busSummary,
      finalWalkHome,
    };
  }

  return undefined;
}

function resolveSegmentSummary(
  option: RouteOption,
  segmentSummaryForOption: Props["segmentSummaryForOption"],
): RouteSegmentSummaryDisplay | undefined {
  const fromCallback = segmentSummaryForOption?.(option);
  if (fromCallback) return fromCallback;
  return segmentSummaryFromRouteMetadata(option);
}

export function RoutePlanningPanel(props: Props) {
  const {
    open,
    dock = "right",
    mapboxToken,
    proximity,
    mode,
    onModeChange,
    start,
    end,
    onStartPick,
    onEndPick,
    onUseMapCenterForStart,
    onUseMapCenterForEnd,
    onFindRoutes,
    loading,
    options,
    selectedRouteId,
    onSelectRoute,
    startUiState: startUiStateProp,
    destinationUiState: destinationUiStateProp,
    startMarker: startMarkerProp,
    endMarker: endMarkerProp,
    segmentSummaryForOption,
  } = props;

  const [compact, setCompact] = useState(false);

  const startMarkerResolved = useMemo(
    () => mergeMarkerContract(start, startMarkerProp),
    [startMarkerProp, start],
  );
  const endMarkerResolved = useMemo(() => mergeMarkerContract(end, endMarkerProp), [endMarkerProp, end]);

  const startUiState = deriveEndpointUiState(start, startUiStateProp, startMarkerResolved.placementSource);
  const destinationUiState = deriveEndpointUiState(
    end,
    destinationUiStateProp,
    endMarkerResolved.placementSource,
  );

  if (!open) return null;

  const compactSummary = `${mode === "walking" ? "Walk" : "Bus"} · ${start ? "A" : "—"} → ${end ? "B" : "—"} · ${options.length} option${options.length === 1 ? "" : "s"}`;
  const isBottomDock = dock === "bottom";
  const asideClassName = isBottomDock
    ? "pointer-events-auto absolute inset-x-0 bottom-[max(0.25rem,env(safe-area-inset-bottom,0px))] z-30 mx-auto flex w-[calc(100vw-1rem)] max-w-none flex-col px-2 sm:w-[min(92vw,640px)] sm:px-0"
    : `pointer-events-auto absolute ${
        dock === "left" ? "left-3 right-auto" : "right-3 left-auto"
      } z-30 flex w-[min(44vw,560px)] min-w-[360px] max-w-[560px] flex-col`;
  const asideStyle = isBottomDock
    ? {
        top: "auto",
        maxHeight: "min(40dvh, calc(100dvh - max(0.75rem, env(safe-area-inset-top, 0px)) - 0.5rem))",
      }
    : {
        top: "max(6rem, calc(env(safe-area-inset-top, 0px) + 4.5rem))",
        maxHeight:
          "min(78vh, calc(100dvh - max(6rem, calc(env(safe-area-inset-top, 0px) + 4.5rem)) - max(0.75rem, env(safe-area-inset-bottom, 0px)) - 5rem))",
      };

  return (
    <aside className={asideClassName} style={asideStyle}>
      <div className="flex min-h-0 max-h-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-200/60">
        {/* Header: fixed, not inside scroll */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900">Route planning</h3>
            {compact && <p className="truncate text-xs text-slate-500">{compactSummary}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact((c) => !c)}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
              aria-expanded={!compact}
            >
              {compact ? "Expand" : "Compact"}
            </button>
            <div className="flex rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => onModeChange("walking")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  mode === "walking" ? "bg-white text-slate-900 ring-1 ring-slate-200" : "text-slate-600"
                }`}
              >
                Walk
              </button>
              <button
                type="button"
                onClick={() => onModeChange("bus")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  mode === "bus" ? "bg-white text-slate-900 ring-1 ring-slate-200" : "text-slate-600"
                }`}
              >
                Bus
              </button>
            </div>
          </div>
        </div>

        {!compact && (
          <>
            {/* Scrollable body: keeps map usable; overscroll contained */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 sm:px-4">
              <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${uiStateChipClass(startUiState)}`}
                  >
                    {uiStateLabel(startUiState)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-600">{formatPoint(start)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Marker: {startMarkerResolved.visible ? "show" : "hide"}
                  {startMarkerResolved.placementSource
                    ? ` · ${startMarkerResolved.placementSource}`
                    : ""}
                  {startMarkerResolved.label ? ` · ${startMarkerResolved.label}` : ""}
                </p>
                <button
                  type="button"
                  onClick={onUseMapCenterForStart}
                  className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  Use map center
                </button>
                <div className="mt-2">
                  <GeocoderSearch accessToken={mapboxToken} active onPick={onStartPick} proximity={proximity} />
                </div>
              </section>

              <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${uiStateChipClass(destinationUiState)}`}
                  >
                    {uiStateLabel(destinationUiState)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-600">{formatPoint(end)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Marker: {endMarkerResolved.visible ? "show" : "hide"}
                  {endMarkerResolved.placementSource ? ` · ${endMarkerResolved.placementSource}` : ""}
                  {endMarkerResolved.label ? ` · ${endMarkerResolved.label}` : ""}
                </p>
                <button
                  type="button"
                  onClick={onUseMapCenterForEnd}
                  className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  Use map center
                </button>
                <div className="mt-2">
                  <GeocoderSearch accessToken={mapboxToken} active onPick={onEndPick} proximity={proximity} />
                </div>
              </section>

              <button
                type="button"
                disabled={!start || !end || loading}
                onClick={onFindRoutes}
                className="mt-3 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Finding routes..." : "Find safer routes"}
              </button>

              <section className="mt-4 space-y-2 pb-1">
                {options.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    No route options yet. Pick start and destination, then search.
                  </p>
                ) : (
                  options.map((option) => (
                    <RouteOptionCard
                      key={option.id}
                      option={option}
                      selected={selectedRouteId === option.id}
                      onSelect={() => onSelectRoute(option.id)}
                      segmentSummary={resolveSegmentSummary(option, segmentSummaryForOption)}
                    />
                  ))
                )}
              </section>
            </div>

            <p className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-[10px] leading-snug text-slate-400 sm:px-4">
              Integration: pass <code className="rounded bg-slate-100 px-0.5">startMarker</code> /{" "}
              <code className="rounded bg-slate-100 px-0.5">endMarker</code> and optional{" "}
              <code className="rounded bg-slate-100 px-0.5">startUiState</code> from{" "}
              <code className="rounded bg-slate-100 px-0.5">page.tsx</code> to sync map markers (out of scope for
              this lane).
            </p>
          </>
        )}

        {compact && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 sm:px-4">
            <button
              type="button"
              disabled={!start || !end || loading}
              onClick={onFindRoutes}
              className="min-w-0 flex-1 truncate rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Finding…" : "Find routes"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
