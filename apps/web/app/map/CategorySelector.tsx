"use client";

import type { IncidentCategory } from "@schemas/incident";

const OPTIONS: { id: IncidentCategory; label: string; emoji: string }[] = [
  { id: "crime", label: "Crime", emoji: "🚨" },
  { id: "intoxication", label: "Intoxicated", emoji: "🍺" },
  { id: "suspicious", label: "Suspicious", emoji: "⚠️" },
  { id: "harassment", label: "Harassment", emoji: "🗣️" },
  { id: "violence", label: "Violence", emoji: "🔪" },
];

export function CategorySelector({
  value,
  onChange,
  disabled,
}: {
  value: IncidentCategory;
  onChange: (c: IncidentCategory) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              selected
                ? "border-slate-900 bg-slate-900 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300 hover:shadow"
            } disabled:opacity-50`}
          >
            <span className="text-2xl leading-none" aria-hidden>
              {opt.emoji}
            </span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
