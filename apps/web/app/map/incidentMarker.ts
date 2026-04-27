/**
 * DOM marker for incidents: category-colored map pin with distinct inner glyph.
 */
import { colorForCategory } from "./mapColors";

const PIN_W = 48;
const PIN_H = 56;

type GlyphDef = { path: string; viewBox: string; transform?: string };

/** Simple paths (Heroicons-style) centered in ~24×24 icon area inside pin bulb. */
const GLYPHS: Record<string, GlyphDef> & { default: GlyphDef } = {
  violence: {
    viewBox: "0 0 24 24",
    path: "M13 10V3L4 14h7v7l9-11h-7z",
    transform: "translate(24,19) scale(0.9) translate(-12,-12)",
  },
  crime: {
    viewBox: "0 0 24 24",
    path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    transform: "translate(24,19) scale(0.82) translate(-12,-12)",
  },
  harassment: {
    viewBox: "0 0 24 24",
    path: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z",
    transform: "translate(24,19) scale(0.78) translate(-12,-12)",
  },
  intoxication: {
    viewBox: "0 0 24 24",
    path: "M7 2h10v2h-3v14h2v2H8v-2h2V4H7V2z",
    transform: "translate(24,19) scale(0.88) translate(-12,-12)",
  },
  suspicious: {
    viewBox: "0 0 24 24",
    path: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    transform: "translate(24,19) scale(0.8) translate(-12,-12)",
  },
  default: {
    viewBox: "0 0 24 24",
    path: "M12 5v8h2V5h-2zm0 12h2v2h-2v-2z",
    transform: "translate(24,19) scale(1) translate(-12,-12)",
  },
};

function glyphForCategory(category: string): GlyphDef {
  const k = (category || "").toLowerCase().trim();
  if (k in GLYPHS && k !== "default") return GLYPHS[k]!;
  return GLYPHS.default;
}

export function createIncidentMarkerElement(category: string, description: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "incident-map-marker";
  wrap.style.width = `${PIN_W}px`;
  wrap.style.height = `${PIN_H}px`;
  wrap.style.cursor = "pointer";
  wrap.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.35))";
  wrap.setAttribute("role", "img");
  wrap.setAttribute(
    "aria-label",
    `${category || "incident"}: ${description || "no details"}`.slice(0, 200),
  );

  const fill = colorForCategory(category);
  const g = glyphForCategory(category);
  const tf = g.transform ?? "translate(24,19) translate(-12,-12)";

  wrap.innerHTML = `
    <svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M24 52C24 52 44 32 44 20C44 11.16 36.84 4 28 4H20C11.16 4 4 11.16 4 20C4 32 24 52 24 52Z"
        fill="${fill}"
        stroke="white"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <g transform="${tf}">
        <path d="${g.path}" fill="white" fill-opacity="0.95" />
      </g>
    </svg>
  `.trim();

  wrap.title = `${category || "incident"}: ${description || ""}`.slice(0, 500);

  return wrap;
}
