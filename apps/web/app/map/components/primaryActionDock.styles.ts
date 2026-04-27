/**
 * Tailwind class tokens for PrimaryActionDock only.
 * Keeps layout/visual variants in one place for compact dock UX.
 */

/** Outer shell: safe-area bottom, centered, no pointer events on wrapper. */
export const dockOuterClass =
  "pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-30 w-[min(94vw,560px)] -translate-x-1/2 px-1.5";

/** Inner bar: lighter footprint on the map. */
export const dockInnerClass =
  "pointer-events-auto grid grid-cols-3 gap-1.5 rounded-2xl bg-white/80 p-1.5 shadow-lg ring-1 ring-slate-200/70 backdrop-blur-md";

/** Shared button chrome: compact height, small type, stacked label support. */
export const dockButtonBase =
  "flex min-h-[2.5rem] flex-col items-center justify-center gap-0 rounded-xl px-1 py-1 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

/** Default (inactive) pill. */
export const dockButtonInactive =
  "bg-white/95 text-slate-800 ring-1 ring-slate-200/80 hover:bg-white active:scale-[0.98]";

/** Active: report or peer placeholder — clear but neutral. */
export const dockButtonActiveStandard =
  "bg-slate-900 text-white shadow-md ring-1 ring-slate-800/80";

/**
 * Active: route planning — high contrast so route mode entry is obvious.
 */
export const dockButtonActiveRoute =
  "bg-blue-950 text-white shadow-lg ring-2 ring-blue-400 ring-offset-1 ring-offset-white/70";

/** Primary line inside a dock button (compact). */
export const dockLabelPrimaryClass = "text-[11px] font-semibold leading-tight sm:text-xs";

/** Secondary line (e.g. Coming soon). */
export const dockLabelSecondaryClass =
  "text-[9px] font-medium leading-none text-slate-500 sm:text-[10px]";

/** Secondary line when route button is active (blue chrome). */
export const dockLabelSecondaryOnRouteActiveClass =
  "text-[9px] font-medium leading-none text-blue-100/90 sm:text-[10px]";

/** Secondary line on slate active buttons (report / peer). */
export const dockLabelSecondaryOnStandardActiveClass =
  "text-[9px] font-medium leading-none text-slate-200/95 sm:text-[10px]";
