"use client";

import { useEffect, useMemo, useState } from "react";
import type { IncidentCategory } from "@schemas/incident";
import {
  type NormalizedRouteMetadata,
  type RouteIndexEntry,
  type TransportRouteType,
  listRouteCandidates,
  lookupRoute,
} from "@/lib/reporting/routeLookup";
import {
  type ReportMode,
  buildTransportReportFields,
} from "@/lib/reporting/transportReport";
import { CategorySelector } from "./CategorySelector";
import { GeocoderSearch } from "./GeocoderSearch";

export type LocationMode = "current" | "pin" | "search";

/** Snapshot for parent to consume (transport route reporting). */
export type TransportStateSnapshot = {
  reportMode: ReportMode;
  transportRouteType: TransportRouteType;
  routeQuery: string;
  /** Normalized match from `routeIndex`, or null. */
  resolvedRoute: NormalizedRouteMetadata | null;
  /** Which strategy found `resolvedRoute`, or null. */
  lookupStrategy: "exact" | "startsWith" | "contains" | null;
  /** Optional fields aligned with `IncidentCreatePayload` transport keys (partial). */
  transportFields: ReturnType<typeof buildTransportReportFields>;
};

export type { ReportMode };

export function ReportBottomSheet({
  open,
  onClose,
  locationMode,
  onLocationModeChange,
  locationSummary,
  changeLocationOpen,
  onToggleChangeLocation,
  mapboxToken,
  onGeocoderPick,
  category,
  onCategoryChange,
  description,
  onDescriptionChange,
  submitting,
  locationReady,
  onSubmit,
  onUseCurrentLocation,
  pinModeActive,
  reportMode: reportModeProp,
  onReportModeChange,
  transportRouteType: transportRouteTypeProp,
  onTransportRouteTypeChange,
  routeQuery: routeQueryProp,
  onRouteQueryChange,
  routeIndex = [],
  onTransportStateChange,
  onRouteLookupResult,
  /** When set, also requires this in transport mode for the submit button (parent-driven readiness). */
  transportSubmitReady: transportSubmitReadyProp,
}: {
  open: boolean;
  onClose: () => void;
  locationMode: LocationMode;
  onLocationModeChange: (m: LocationMode) => void;
  locationSummary: string;
  changeLocationOpen: boolean;
  onToggleChangeLocation: () => void;
  mapboxToken: string;
  onGeocoderPick: (lng: number, lat: number) => void;
  category: IncidentCategory;
  onCategoryChange: (c: IncidentCategory) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  submitting: boolean;
  /** False until GPS / map has produced coordinates for this report */
  locationReady: boolean;
  onSubmit: () => void;
  onUseCurrentLocation: () => void;
  pinModeActive: boolean;
  reportMode?: ReportMode;
  onReportModeChange?: (m: ReportMode) => void;
  transportRouteType?: TransportRouteType;
  onTransportRouteTypeChange?: (t: TransportRouteType) => void;
  /** Free-text route number or name. */
  routeQuery?: string;
  onRouteQueryChange?: (q: string) => void;
  routeIndex?: ReadonlyArray<RouteIndexEntry>;
  onTransportStateChange?: (state: TransportStateSnapshot) => void;
  onRouteLookupResult?: (
    match: NormalizedRouteMetadata | null,
    strategy: TransportStateSnapshot["lookupStrategy"],
  ) => void;
  /** Override whether transport form allows submit; default: route type + non-empty query, or a resolved index match. */
  transportSubmitReady?: boolean;
}) {
  const reportModeIsControlled = reportModeProp !== undefined;
  const [reportModeState, setReportModeState] = useState<ReportMode>("location");
  const reportMode = reportModeIsControlled ? (reportModeProp as ReportMode) : reportModeState;
  const setReportMode = (m: ReportMode) => {
    onReportModeChange?.(m);
    if (!reportModeIsControlled) {
      setReportModeState(m);
    }
  };

  const trtControlled = transportRouteTypeProp !== undefined;
  const [trtState, setTrtState] = useState<TransportRouteType>("bus");
  const transportRouteType = trtControlled
    ? (transportRouteTypeProp as TransportRouteType)
    : trtState;
  const setTransportRouteType = (t: TransportRouteType) => {
    onTransportRouteTypeChange?.(t);
    if (!trtControlled) {
      setTrtState(t);
    }
  };

  const rqControlled = routeQueryProp !== undefined;
  const [routeQueryState, setRouteQueryState] = useState("");
  const routeQuery = rqControlled ? (routeQueryProp as string) : routeQueryState;
  const setRouteQuery = (q: string) => {
    onRouteQueryChange?.(q);
    if (!rqControlled) {
      setRouteQueryState(q);
    }
  };

  /** User picked a row from the suggestion list (takes precedence over automatic first match). */
  const [manualRoutePick, setManualRoutePick] = useState<NormalizedRouteMetadata | null>(null);

  useEffect(() => {
    setManualRoutePick(null);
  }, [transportRouteType, reportMode]);

  const { match: autoResolvedRoute, strategy: lookupStrategy } = lookupRoute({
    query: routeQuery,
    routeType: reportMode === "transport" ? transportRouteType : undefined,
    entries: reportMode === "transport" ? routeIndex : [],
  });

  const resolvedRoute =
    reportMode === "transport" ? (manualRoutePick ?? autoResolvedRoute) : null;

  const routeCandidates = useMemo(
    () =>
      reportMode === "transport"
        ? listRouteCandidates({
            query: routeQuery,
            routeType: transportRouteType,
            entries: routeIndex,
            limit: 15,
          })
        : [],
    [reportMode, routeQuery, transportRouteType, routeIndex],
  );

  const showRouteSuggestions =
    reportMode === "transport" &&
    !submitting &&
    routeQuery.trim().length > 0 &&
    routeCandidates.length > 0;

  const transportFields = useMemo(
    () =>
      buildTransportReportFields({
        reportMode: reportMode === "transport" ? "transport" : "location",
        resolvedRoute: reportMode === "transport" ? resolvedRoute : null,
        routeTypeInput: reportMode === "transport" ? transportRouteType : null,
        routeQueryText: reportMode === "transport" ? routeQuery : undefined,
        useQueryAsLabelWhenUnresolved: true,
      }),
    [reportMode, resolvedRoute, transportRouteType, routeQuery],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (reportMode === "transport") {
      onRouteLookupResult?.(resolvedRoute, lookupStrategy);
    } else {
      onRouteLookupResult?.(null, null);
    }
  }, [open, reportMode, resolvedRoute, lookupStrategy, onRouteLookupResult]);

  useEffect(() => {
    if (!open || !onTransportStateChange) {
      return;
    }
    onTransportStateChange({
      reportMode,
      transportRouteType,
      routeQuery,
      resolvedRoute: reportMode === "transport" ? resolvedRoute : null,
      lookupStrategy: reportMode === "transport" ? lookupStrategy : null,
      transportFields,
    });
  }, [
    open,
    onTransportStateChange,
    reportMode,
    transportRouteType,
    routeQuery,
    resolvedRoute,
    lookupStrategy,
    transportFields,
  ]);

  const transportFormReady =
    reportMode !== "transport" ||
    resolvedRoute != null ||
    (Boolean(transportRouteType) && routeQuery.trim().length > 0);
  const transportExtraReady = transportSubmitReadyProp ?? transportFormReady;

  const canSubmit = !submitting && locationReady && transportExtraReady;

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close report"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200"
        onClick={onClose}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88vh,640px)] flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-sheet-title"
      >
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col pt-2">
          <div className="mx-auto mb-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 px-4" aria-hidden />

          <div className="mb-3 flex shrink-0 items-center justify-between gap-2 px-4">
            <h2 id="report-sheet-title" className="text-lg font-bold text-slate-900">
              Report incident
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Close
            </button>
          </div>

          <div className="mb-4 shrink-0 px-4" role="group" aria-label="What to report">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What to report</p>
            <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200/80">
              <button
                type="button"
                aria-pressed={reportMode === "location"}
                onClick={() => setReportMode("location")}
                className={`min-h-[2.75rem] flex-1 rounded-xl px-2 text-sm font-semibold transition ${
                  reportMode === "location" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                }`}
              >
                Report at location
              </button>
              <button
                type="button"
                aria-pressed={reportMode === "transport"}
                onClick={() => setReportMode("transport")}
                className={`min-h-[2.75rem] flex-1 rounded-xl px-2 text-sm font-semibold transition ${
                  reportMode === "transport" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                }`}
              >
                Report on transport route
              </button>
            </div>
          </div>

          {reportMode === "transport" && (
            <section
              className="mb-2 shrink-0 overflow-visible px-4"
              aria-label="Transport route"
            >
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3 ring-1 ring-slate-200/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transport route</p>
              <label className="mt-2 block" htmlFor="report-route-type">
                <span className="text-xs font-medium text-slate-600">Route type</span>
                <select
                  id="report-route-type"
                  value={transportRouteType}
                  onChange={(e) => setTransportRouteType(e.target.value as TransportRouteType)}
                  disabled={submitting}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="bus">bus</option>
                  <option value="train">train</option>
                  <option value="tram">tram</option>
                </select>
              </label>
              <label className="mt-2 block" htmlFor="report-route-query">
                <span className="text-xs font-medium text-slate-600">Route number or name</span>
                <div className="relative z-[70] mt-1">
                  <input
                    id="report-route-query"
                    type="text"
                    value={routeQuery}
                    onChange={(e) => {
                      setManualRoutePick(null);
                      setRouteQuery(e.target.value);
                    }}
                    disabled={submitting}
                    placeholder="e.g. 402, 96, Craigieburn"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={showRouteSuggestions}
                    aria-controls="report-route-suggestions"
                  />
                  {showRouteSuggestions ? (
                    <ul
                      id="report-route-suggestions"
                      role="listbox"
                      className="absolute left-0 right-0 z-[80] mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/80"
                    >
                      {routeCandidates.map((c) => (
                        <li key={c.route_external_id} role="option" aria-selected={resolvedRoute?.route_external_id === c.route_external_id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2.5 text-left text-sm text-slate-900 hover:bg-slate-100 active:bg-slate-200"
                            onClick={() => {
                              setManualRoutePick(c);
                              setRouteQuery(c.route_label);
                            }}
                          >
                            <span className="font-medium">{c.route_label}</span>
                            <span className="ml-2 text-xs font-normal text-slate-500">({c.route_type})</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </label>
              {routeIndex.length > 0 && (
                <p className="mt-2 text-xs text-slate-600" aria-live="polite">
                  {resolvedRoute ? (
                    <span>
                      Selected: <span className="font-medium text-slate-800">{resolvedRoute.route_label}</span>
                      {manualRoutePick ? (
                        <span className="text-slate-500"> (from list)</span>
                      ) : lookupStrategy ? (
                        <span className="text-slate-500"> ({lookupStrategy})</span>
                      ) : null}
                    </span>
                  ) : (
                    <span>
                      {routeQuery.trim()
                        ? "No match in the route list — pick a suggestion or submit the text you entered."
                        : ""}
                    </span>
                  )}
                </p>
              )}
              </div>
            </section>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-2" data-report-sheet-scroll>
          {pinModeActive && (
            <div className="mb-3 rounded-2xl bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-950 ring-1 ring-amber-200">
              Move the map to place the pin
            </div>
          )}

          <section className="mb-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/80">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{locationSummary}</p>
            <button
              type="button"
              onClick={onToggleChangeLocation}
              className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              {changeLocationOpen ? "Hide options" : "Change location"}
            </button>

            {changeLocationOpen && (
              <div className="mt-3 flex flex-col gap-2 border-t border-slate-200/80 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    onLocationModeChange("current");
                    onUseCurrentLocation();
                    onToggleChangeLocation();
                  }}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <span aria-hidden>📍</span> Use current location
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLocationModeChange("pin");
                    onToggleChangeLocation();
                  }}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <span aria-hidden>📌</span> Move pin on map
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLocationModeChange("search");
                    onToggleChangeLocation();
                  }}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <span aria-hidden>🔍</span> Search place
                </button>
              </div>
            )}

            {locationMode === "search" && (
              <div className="mt-3">
                <GeocoderSearch accessToken={mapboxToken} active onPick={onGeocoderPick} />
              </div>
            )}
          </section>

          <section className="mb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
            <CategorySelector value={category} onChange={onCategoryChange} disabled={submitting} />
          </section>

          <label className="mb-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              disabled={submitting}
              placeholder="What's happening? (optional)"
              className="resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </label>
          </div>

          <div className="shrink-0 border-t border-slate-200/90 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="w-full min-h-[3.25rem] rounded-2xl bg-slate-900 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/25 transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50"
          >
            {submitting
              ? "Sending…"
              : !locationReady
                ? "Getting location…"
                : reportMode === "transport" && !transportExtraReady
                  ? "Set route and location"
                  : "Report incident"}
          </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Re-exports for parents wiring `routeIndex` / payload helpers
export type {
  NormalizedRouteMetadata,
  RouteIndexEntry,
  TransportRouteType,
} from "@/lib/reporting/routeLookup";
export {
  listRouteCandidates,
  lookupRoute,
  normalizeRouteQuery,
  TRANSPORT_ROUTE_TYPES,
} from "@/lib/reporting/routeLookup";
export { buildTransportReportFields, type TransportReportFields } from "@/lib/reporting/transportReport";
