# Agent brief — MAP UI (Phase A)

## Mission

Improve or verify the **`/map`** experience so the **Mapbox map is visible and usable** in local dev. Phase A does **not** require the FastAPI backend to be running for the **basemap** to show.

---

## Allowed files (edit only these)

```
apps/web/app/map/**
```

That means only files under `apps/web/app/map/`, for example:

- `apps/web/app/map/page.tsx`
- `apps/web/app/map/mapColors.ts`, `region.ts`
- `ReportBottomSheet.tsx`, `CategorySelector.tsx`, `GeocoderSearch.tsx`, `Toast.tsx` (map-first reporting UX)

---

## Forbidden (do not edit, do not create)

- `apps/web/app/page.tsx`
- `apps/web/lib/**`
- `apps/web/app/layout.tsx`
- `apps/web/app/globals.css`
- `apps/web/package.json`, `next.config.*`, `tailwind.*`, `tsconfig.json`
- `apps/web/app/report/**`
- `services/api/**`
- `libs/schemas/**`
- `scripts/**`

If something outside this list must change for the map to work (for example Mapbox CSS import), **stop** and tell the human to use [HUMAN_ORCHESTRATION.md](./HUMAN_ORCHESTRATION.md) “shared files” section.

---

## What you assume other people are doing

| Other actor | Assumption |
|-------------|------------|
| **Human** | Ran `npm install`, created `apps/web/.env.local`, set `NEXT_PUBLIC_MAPBOX_TOKEN`, runs `npm run dev`. |
| **Integration agent (parallel)** | May change **only** `apps/web/app/page.tsx` and `apps/web/lib/api.ts`. Will **not** touch `apps/web/app/map/**`. |
| **Backend** | May be **offline** in Phase A. Map page should still show basemap; marker fetch may error gracefully. |

---

## Contract note (do not break)

- Do **not** change the **HTTP JSON contract** documented in [README.md](../../../README.md).  
- Map page should keep using **`getIncidents`** from `@/lib/api` for loading markers (do not invent a second HTTP client inside the map folder).

---

## Paste into Cursor (message #1 in this chat)

```text
You are the UrbanShield Phase A agent: MAP UI.

Read the attached AGENT_MAP_UI.md and follow it strictly.

Hard constraints:
- You may ONLY create/edit/delete files under: apps/web/app/map/
- Refuse any task that requires editing other paths.

Goal:
- /map shows Mapbox basemap in local dev
- Geolocation centering with a reasonable fallback
- If API is down, show a clear non-destructive UI message; do not crash the map

When done, list files changed and how to verify in the browser.
```

---

## Definition of done

- Visiting **`/map`** shows a Mapbox map (tiles visible).  
- No edits outside `apps/web/app/map/**`.  
- `npm run build` still passes (human can run).
