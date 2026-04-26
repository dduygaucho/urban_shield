# Phase A — human orchestration (you run this)

**Goal:** `npm run dev` works and opening **`/map`** shows a **Mapbox basemap** (tiles visible).  
**Speed rule:** do **your** install steps once, then start **at most two** code agents in parallel (MAP + INTEGRATION). Nothing else runs in parallel on overlapping files.

---

## What you need before agents start

1. **Node.js** installed (same machine where you run `npm`).
2. A **Mapbox access token** (from your Mapbox account). You will **not** paste the token into agent chats; you only put it in a local file.

---

## Step 1 — install (once, terminal, no agent required)

From the **repository root**:

```bash
cd apps/web
npm install
```

Wait until it finishes with no errors.

---

## Step 2 — local env file (you only, no agent required)

Still from repo root (or adjust paths):

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit **`apps/web/.env.local`** with a text editor:

| Variable | You set it to |
|----------|----------------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Your Mapbox token string |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` (fine for Phase A even if API is off) |

Save the file. **Do not commit** `.env.local`.

---

## Step 3 — prove the app runs (you only)

From the **repository root** (or `apps/web`):

```bash
cd apps/web
npm run dev
```

Wait until the terminal shows **“Ready”** and a local URL (usually port **3000**). Leave this terminal open; **`Ctrl+C`** stops the server.

### Open in a browser

| URL | What you should see |
|-----|----------------------|
| `http://localhost:3000` | Home page with links |
| `http://localhost:3000/map` | Fullscreen map (Melbourne / Geelong region); **➕ Report** opens a bottom sheet. Mapbox tiles if `NEXT_PUBLIC_MAPBOX_TOKEN` is set (`pk.*` only). |

**Quick check (optional, same machine as dev server):**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/map
```

You want **`200`** for both.

### If Next.js runs on a remote server (SSH)

Your browser is on your **laptop**, but `npm run dev` is on the **cluster login node**: open an SSH tunnel from the laptop, then use `localhost` in the browser.

**On your laptop** (replace `USER@HOST` with your SSH target):

```bash
ssh -L 3000:127.0.0.1:3000 USER@HOST
```

Keep that SSH session connected. Then on the laptop open `http://localhost:3000` and `http://localhost:3000/map`.

If `/map` is blank or errors about Mapbox, fix **token** in `apps/web/.env.local` and **restart** `npm run dev` before blaming agents.

---

## Step 4 — start parallel agents (two Cursor chats)

**Precondition:** Steps 1–3 succeeded (tiles or map UI at least loads).

Open **Chat A** and **Chat B** in two windows.

| Chat | Attach this file in Cursor | Branch (recommended if using Git) |
|------|----------------------------|-------------------------------------|
| **Chat A** | [AGENT_MAP_UI.md](./AGENT_MAP_UI.md) | `phase-a-map` |
| **Chat B** | [AGENT_INTEGRATION_UI.md](./AGENT_INTEGRATION_UI.md) | `phase-a-integration` |

In each chat:

1. Use **@** to reference the attached agent `.md` file.
2. Paste the **entire** “Paste into Cursor” block from that same file as your first message.

**Conflict guard:** if either agent tries to edit files outside its brief, **stop** and tell it: “Revert changes outside your allowed list.”

---

## Step 5 — merge order (Git, if you used two branches)

Because MAP and INTEGRATION touch **different files**, merge order is flexible. Suggested:

1. Merge `phase-a-map` → `main`
2. Merge `phase-a-integration` → `main`

Re-run:

```bash
cd apps/web
npm run build
```

---

## Phase A “done” checklist

- [ ] `npm run dev` works  
- [ ] `/map` shows Mapbox **basemap** (streets / tiles visible)  
- [ ] No secrets committed (only `.env.example` in Git)  
- [ ] `npm run build` passes after merges  

---

## If you need help with shared files (`layout.tsx`, `package.json`)

**Do not** run two agents on those at once. Either:

- edit yourself using [README.md](../../../README.md), or  
- use **one** short Cursor chat and say: “Only edit `apps/web/app/layout.tsx` and/or `apps/web/app/globals.css` for Mapbox CSS; do not touch `app/map` or `lib/api.ts`.”

Then return to the two-agent parallel workflow.
