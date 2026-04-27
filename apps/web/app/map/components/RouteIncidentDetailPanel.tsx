"use client";

import type { IncidentRecord } from "@schemas/incident";
import type { RoutePanelDock } from "@/app/map/components/RoutePlanningPanel";

function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString();
}

/** Matches API / ingest: JSON array string, comma-separated, or opaque tags. */
function parseSourceLinks(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p)) return p.map((v) => String(v).trim()).filter(Boolean);
  } catch {
    /* fall through */
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type RouteIncidentDetailPanelProps = {
  open: boolean;
  dock: Exclude<RoutePanelDock, "bottom">;
  incident: IncidentRecord | null;
  onClose: () => void;
};

/**
 * Side panel for a single incident while planning a route: full description + source / news links.
 * Position {@link dock} should be opposite the route planner panel when both are side-docked.
 */
export function RouteIncidentDetailPanel({ open, dock, incident, onClose }: RouteIncidentDetailPanelProps) {
  if (!open || !incident) return null;

  const primaryUrl = incident.source_url?.trim() || null;
  const extraRefs = parseSourceLinks(incident.evidence_sources);
  const linkCandidates = [
    ...(primaryUrl && isHttpUrl(primaryUrl) ? [primaryUrl] : []),
    ...extraRefs.filter(isHttpUrl),
  ];
  const seen = new Set<string>();
  const uniqueLinks = linkCandidates.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  const opaqueTags = extraRefs.filter((r) => !isHttpUrl(r));
  const tagSeen = new Set<string>();
  const uniqueOpaqueTags = opaqueTags.filter((t) => {
    if (tagSeen.has(t)) return false;
    tagSeen.add(t);
    return true;
  });

  const headingType = incident.type ?? incident.category;
  const when = formatWhen(incident.timestamp ?? incident.created_at);

  const asideClass =
    dock === "left"
      ? "pointer-events-auto absolute left-3 right-auto z-30 flex w-[min(42vw,400px)] min-w-[280px] max-w-[400px] flex-col"
      : "pointer-events-auto absolute right-3 left-auto z-30 flex w-[min(42vw,400px)] min-w-[280px] max-w-[400px] flex-col";

  const topStyle = {
    top: "max(6rem, calc(env(safe-area-inset-top, 0px) + 4.5rem))",
    maxHeight:
      "min(72vh, calc(100dvh - max(6rem, calc(env(safe-area-inset-top, 0px) + 4.5rem)) - max(0.75rem, env(safe-area-inset-bottom, 0px)) - 5rem))",
  };

  return (
    <aside className={asideClass} style={topStyle}>
      <div className="flex min-h-0 max-h-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-200/60">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Activity report</p>
            <h3 className="mt-0.5 text-base font-semibold capitalize leading-snug text-slate-900">{headingType}</h3>
            <p className="mt-1 text-xs text-slate-500">{when}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 sm:px-4">
          <section className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {incident.description?.trim() ? incident.description : "No description provided."}
            </p>
          </section>

          <section className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Details</p>
            <dl className="mt-2 space-y-1.5">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-slate-600">Source</dt>
                <dd className="min-w-0">{incident.source ?? "—"}</dd>
              </div>
              {incident.source_category ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-slate-600">Source type</dt>
                  <dd>{incident.source_category}</dd>
                </div>
              ) : null}
              {incident.verification_status ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-slate-600">Verification</dt>
                  <dd className="capitalize">{incident.verification_status}</dd>
                </div>
              ) : null}
              {incident.verification_reason ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="font-medium text-slate-600">Verification note</dt>
                  <dd className="text-slate-600">{incident.verification_reason}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-slate-600">Coordinates</dt>
                <dd className="font-mono text-[11px]">
                  {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}
                </dd>
              </div>
            </dl>
          </section>

          {(uniqueLinks.length > 0 || (primaryUrl && !isHttpUrl(primaryUrl)) || uniqueOpaqueTags.length > 0) && (
            <section className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Links & references</p>
              <ul className="mt-2 space-y-2">
                {uniqueLinks.map((href) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm font-medium text-blue-700 underline-offset-2 hover:text-blue-900 hover:underline"
                    >
                      {href}
                    </a>
                  </li>
                ))}
                {primaryUrl && !isHttpUrl(primaryUrl) ? (
                  <li className="text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Reference: </span>
                    {primaryUrl}
                  </li>
                ) : null}
                {uniqueOpaqueTags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-lg bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}
