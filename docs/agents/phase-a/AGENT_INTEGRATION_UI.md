# Agent brief — INTEGRATION UI (Phase A)

## Mission

Make the **entry experience** clear for Phase A: a new developer can open the app and reach **`/map`** without guesswork. You work on **home** and **shared API client** only.

---

## Allowed files (edit only these)

```
apps/web/app/page.tsx
apps/web/lib/api.ts
```

---

## Forbidden (do not edit, do not create)

- `apps/web/app/map/**` (owned by MAP agent in parallel)
- `apps/web/app/report/**`
- `apps/web/app/layout.tsx`
- `apps/web/app/globals.css`
- `apps/web/package.json`, `next.config.*`, `tailwind.*`, `tsconfig.json`
- `services/api/**`
- `libs/schemas/**` *(Phase A: avoid; not needed to see the map)*
- `scripts/**`

If `libs/schemas/incident.ts` truly must change, **stop parallel work** and coordinate with the human (that file is normally Person 4 / integration long-term).

---

## What you assume other people are doing

| Other actor | Assumption |
|-------------|------------|
| **Human** | Ran `npm install`, created `apps/web/.env.local`, set `NEXT_PUBLIC_MAPBOX_TOKEN` and `NEXT_PUBLIC_API_BASE_URL`, runs `npm run dev`. |
| **MAP agent (parallel)** | Improves **only** `apps/web/app/map/**`. Will **not** touch `page.tsx` or `lib/api.ts`. |
| **Backend** | May be **offline** in Phase A. The home page should still be truthful: map can work without API; markers need API later. |

---

## Contract note (do not break)

- Do **not** rename or reshape **`createIncident`** / **`getIncidents`** payloads vs [README.md](../../../README.md).  
- `NEXT_PUBLIC_API_BASE_URL` must remain the single place the client builds URLs from (no hard-coded `http://localhost:8000` scattered in new files — you only have `apps/web/lib/api.ts` anyway).

---

## Paste into Cursor (message #1 in this chat)

```text
You are the UrbanShield Phase A agent: INTEGRATION UI.

Read the attached AGENT_INTEGRATION_UI.md and follow it strictly.

Hard constraints:
- You may ONLY edit: apps/web/app/page.tsx and apps/web/lib/api.ts
- Refuse any task that requires editing other paths.

Goal:
- Home page clearly tells a beginner how to run the web app for Phase A
- Prominent navigation to /map (and /report is fine, but Phase A priority is /map)
- lib/api.ts: keep fetch logic centralized; improve user-facing error strings if API is unreachable

When done, list files changed and what the human should click in the browser to verify.
```

---

## Definition of done

- `http://localhost:3000` explains (briefly) env setup pointers **by variable name** (not secret values).  
- Clear navigation to **`/map`**.  
- No edits outside the two allowed files.  
- `npm run build` still passes (human can run).
