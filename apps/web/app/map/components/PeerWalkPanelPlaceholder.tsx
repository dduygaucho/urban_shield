"use client";

export function PeerWalkPanelPlaceholder({ open }: { open: boolean }) {
  if (!open) return null;
  // Panel sizing matches RoutePlanningPanel; max-h caps vertical map obstruction.
  return (
    <aside className="pointer-events-auto absolute left-3 right-3 top-24 z-30 mx-auto max-h-[70vh] w-[min(95vw,560px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <h3 className="text-base font-semibold text-slate-900">Walk With Peer</h3>
      <p className="mt-2 text-sm text-slate-600">
        Coming soon. This panel is reserved for future peer-to-peer walking support.
      </p>
    </aside>
  );
}

