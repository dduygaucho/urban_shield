/** Marker colors by incident category (Person 2 — map UI). */

export const CATEGORY_COLORS: Record<string, string> = {
  crime: "#dc2626",
  harassment: "#ea580c",
  intoxication: "#ca8a04",
  suspicious: "#7c3aed",
  violence: "#991b1b",
};

export function colorForCategory(category: string): string {
  return CATEGORY_COLORS[category] ?? "#64748b";
}
