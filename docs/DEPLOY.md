# Deploy UrbanShield (24h demo)

Two free hosts: **API (Render)** + **web (Vercel)**. Repository: **`deploy`** branch.

## Prerequisites

- [Mapbox](https://www.mapbox.com/) account and a **public** token (`pk.…`).
- Large **VIC route GeoJSON** is tracked with **Git LFS** ([`.gitattributes`](../.gitattributes)). Clone and CI must fetch LFS objects (`git lfs pull`).

### Vercel: one app vs “Services” preset

The dashboard may auto-detect **two** services (`apps/web` + `services/api`) and show **“vercel.json required”**. Two valid approaches:

| Approach | What to do |
|----------|------------|
| **A. Next on Vercel + API on Render** (sections 1–2 below) | In Vercel, set **Root Directory** to **`apps/web`** only (or pick the **Next.js** preset so only one service deploys). **Do not** require root multi-service config. Use **`NEXT_PUBLIC_API_BASE_URL`** = your Render API URL. |
| **B. Vercel “Services” (experimental)** | Keep **Root Directory** `./` and commit **[`vercel.json`](../vercel.json)** at the repo root (`experimentalServices` for `web` + `api`). Set **`NEXT_PUBLIC_API_BASE_URL`** to `https://<your-project>.vercel.app/_/api` (matches the **`routePrefix`**; no trailing slash). Browser and API share the same origin, so **CORS** is usually simple. Prefer **A** if this preset fails to build (experimental). |

## 1. API on Render

1. [Render](https://render.com) → **New** → **Blueprint** → connect `dduygaucho/urban_shield`.
2. Use [`render.yaml`](../render.yaml) from the repo root (default). **Branch:** `deploy`.
3. When prompted, set **`CORS_ORIGINS`** to your future frontend URL, e.g. `https://<project>.vercel.app` (no trailing slash). You can edit this after Vercel gives you the URL.
4. Wait for deploy; note the API URL (e.g. `https://urban-shield-api.onrender.com`).

**Git LFS:** The build runs `git lfs install && git lfs pull` so `scripts/ingest/transport_route_geometries_vic.geojson` exists for `GET /data/transport_route_geometries_vic.geojson`.

**SQLite:** Lives on the service disk; avoid frequent redeploys during a short demo if you care about persisted incidents.

## 2. Web on Vercel

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory:** **`apps/web`** for approach **A** above; **`./`** if you use root **`vercel.json`** Services preset (approach **B**).
3. **Production Branch:** `deploy` (Project → Settings → Git).
4. **Environment variables** (Production):

| Name | Example |
|------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://urban-shield-api.onrender.com` (no trailing slash) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | your `pk.…` token |
| `NEXT_PUBLIC_MAP_DEFAULT` | `melbourne` or `geelong` (optional) |

5. Enable **Git LFS** if the Vercel project supports it (so `scripts/ingest` JSON imports resolve on build). If the build fails missing files, run ingest locally, commit artifacts to `deploy`, or copy the required JSON into the branch.

**Optional:** `NEXT_PUBLIC_VIC_TRANSPORT_ROUTE_GEOJSON_URL` to bypass the API and load GeoJSON from a CDN (full URL).

## 3. CORS (API)

[`CORS_ORIGINS`](../services/api/database.py) must match the **exact** browser `Origin` (scheme + host, no path). Trailing slashes are stripped automatically, but do not include one in Render.

```text
CORS_ORIGINS=https://urban-shield-xxxxx.vercel.app
```

**Preview deployments** use a different host (e.g. `urban-shield-git-feature-user.vercel.app`). Either add each origin comma-separated in `CORS_ORIGINS`, or set **`CORS_ORIGIN_REGEX`** on Render to cover all Vercel hosts you use, for example:

```text
CORS_ORIGIN_REGEX=https://.*\.vercel\.app
```

If you use a **custom domain** for the web app, include that full origin in `CORS_ORIGINS` as well (regex above does not match arbitrary domains).

Update in **Render → Service → Environment**; **Save** and **Manual Deploy** (or wait for restart) so new env vars load.

## 4. Smoke checks

After both are live:

```bash
# Replace with your API URL
curl -sS "https://YOUR-API.onrender.com/health"
curl -sS -o /dev/null -w "%{http_code}\\n" --range 0-0 "https://YOUR-API.onrender.com/data/transport_route_geometries_vic.geojson"
```

Expect **`200`** for `/health`. For GeoJSON use a **small ranged GET** (`206`/`200`), not **`HEAD`** (FastAPI **`FileResponse`** may respond with **405** to `HEAD`).

Local smoke (API on port 8000):

```bash
./scripts/smoke_deploy_local.sh
# or:
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 ./scripts/smoke_deploy_local.sh
```

Then open `https://YOUR-VERCEL-URL/map`, submit a test report, refresh.

## Troubleshooting

| Issue | Action |
|-------|--------|
| **`git: 'lfs' is not a git command`** on Render | Fixed in [`render.yaml`](../render.yaml): build downloads the **Git LFS binary** before `git lfs pull`. Redeploy after pulling latest; or install `git-lfs` in a custom Dockerfile. |
| GeoJSON **404** on API | Confirm LFS file present on Render build logs; set `TRANSPORT_ROUTE_GEOJSON_PATH` to an absolute path if layout differs. |
| Next **build** fails missing `scripts/ingest/*.json` | Commit those files on `deploy` or run ingest in CI before `npm run build`. |
| Browser **CORS** errors | `CORS_ORIGINS` must match the tab’s origin (production vs preview URL differ). Add `CORS_ORIGIN_REGEX` for `*.vercel.app` previews, or list multiple origins comma-separated. |
| Mapbox blank | Use a **public** `pk.` token; check Mapbox URL restrictions for your domain. |
