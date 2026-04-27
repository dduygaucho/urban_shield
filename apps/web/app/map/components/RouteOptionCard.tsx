"use client";

import { useMemo, useState } from "react";
import type { RouteOption } from "@/lib/routing/contracts";

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatRecordedTime(timestamp: string): string {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return timestamp;
  return new Date(ms).toLocaleString();
}

/** Display-only: one or more walking legs (e.g. entire walking route). */
export type RouteSegmentWalkingOnlySummary = {
  kind: "walking-only";
  segments: Array<{
    label: string;
    distanceMeters?: number;
    durationMinutes?: number;
  }>;
};

/** Display-only: bus leg plus final walk to destination (e.g. home). */
export type RouteSegmentBusPlusFinalWalkSummary = {
  kind: "bus_plus_final_walk_home";
  busSummary: string;
  finalWalkHome: {
    label?: string;
    distanceMeters?: number;
    durationMinutes?: number;
  };
};

/** Contract for optional segment summary row(s) on route cards (no routing logic). */
export type RouteSegmentSummaryDisplay =
  | RouteSegmentWalkingOnlySummary
  | RouteSegmentBusPlusFinalWalkSummary;

export type RouteOptionCardProps = {
  option: RouteOption;
  selected: boolean;
  onSelect: () => void;
  /** When set, renders segment summary scaffold (walking-only or bus + final walk). */
  segmentSummary?: RouteSegmentSummaryDisplay;
};

function SegmentSummaryBlock({ summary }: { summary: RouteSegmentSummaryDisplay }) {
  if (summary.kind === "walking-only") {
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Segments</p>
        <ul className="mt-1 space-y-1">
          {summary.segments.map((seg, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-700">
              <span className="font-medium text-slate-800">{seg.label}</span>
              {seg.distanceMeters != null && <span>{formatDistance(seg.distanceMeters)}</span>}
              {seg.durationMinutes != null && <span>{seg.durationMinutes} min</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Segments</p>
      <div className="mt-1 space-y-1 text-xs text-slate-700">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-800">Bus</span>
          <span>{summary.busSummary}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 border-t border-slate-200/80 pt-1">
          <span className="font-medium text-slate-800">{summary.finalWalkHome.label ?? "Walk to destination"}</span>
          {summary.finalWalkHome.distanceMeters != null && (
            <span>{formatDistance(summary.finalWalkHome.distanceMeters)}</span>
          )}
          {summary.finalWalkHome.durationMinutes != null && (
            <span>{summary.finalWalkHome.durationMinutes} min</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function RouteOptionCard({ option, selected, onSelect, segmentSummary }: RouteOptionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const topIncidents = useMemo(() => option.incidents.slice(0, 8), [option.incidents]);

  return (
    <article
      className={`rounded-2xl border p-3 shadow-sm transition ${
        selected ? "border-slate-900 bg-slate-50 ring-1 ring-slate-300" : "border-slate-200 bg-white"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              #{option.safetyRank} {option.label}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {formatDistance(option.distanceMeters)} • {option.durationMinutes} min • {option.mode}
            </p>
          </div>
          <div className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Safety {option.safetyScore}
          </div>
        </div>
      </button>

      {segmentSummary ? <SegmentSummaryBlock summary={segmentSummary} /> : null}

      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{option.incidents.length} nearby activity reports</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-semibold text-blue-700 hover:text-blue-900"
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>

      {expanded && (
        <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2">
          {topIncidents.length === 0 ? (
            <li className="text-xs text-slate-500">No nearby incidents found for this route.</li>
          ) : (
            topIncidents.map((incident) => (
              <li key={incident.id} className="mb-2 rounded-lg bg-white p-2 last:mb-0">
                <p className="text-xs font-semibold text-slate-900">{incident.type}</p>
                <p className="mt-0.5 text-xs text-slate-700">{incident.description}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatRecordedTime(incident.timestamp)} • {incident.source}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </article>
  );
}
