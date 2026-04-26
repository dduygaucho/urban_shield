"use client";

import type { IncidentCategory } from "@schemas/incident";
import { CategorySelector } from "./CategorySelector";
import { GeocoderSearch } from "./GeocoderSearch";

export type LocationMode = "current" | "pin" | "search";

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
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close report"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200"
        onClick={onClose}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-50 max-h-[min(88vh,640px)] rounded-t-3xl bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-sheet-title"
      >
        <div className="mx-auto flex w-full max-w-lg flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto mb-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" aria-hidden />

          <div className="mb-3 flex items-center justify-between gap-2">
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
              rows={2}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              disabled={submitting}
              placeholder="What's happening? (optional)"
              className="resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <button
            type="button"
            disabled={submitting || !locationReady}
            onClick={onSubmit}
            className="mb-1 min-h-[3.25rem] rounded-2xl bg-slate-900 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/25 transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? "Sending…" : !locationReady ? "Getting location…" : "Report incident"}
          </button>
        </div>
      </div>
    </>
  );
}
