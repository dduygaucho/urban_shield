# Map + Victoria public transport data — collaborator setup

This guide explains how to reproduce a working **UrbanShield map** with **bus/train/tram route polylines** and route-aware reporting. The large **GeoJSON** file is not committed to git by default; you generate it with the ingest pipeline (or point the API at a copy you already have).

For deeper pipeline details, see [scripts/ingest/README_transport_gtfs_vic.md](../scripts/ingest/README_transport_gtfs_vic.md) and [scripts/ingest/agent_E_context.md](../scripts/ingest/agent_E_context.md).

---

## What the map needs

| Piece | Role |
|--------|------|
| `transport_route_geometries_vic.geojson` | `FeatureCollection` of route lines. Each feature’s `properties` must include exactly: `route_type`, `route_external_id`, `route_label`, `geometry_ref` (values: `bus` \| `train` \| `tram` for `route_type`). |
| `transport_routes_vic_normalized.json` | Shipped under `scripts/ingest/` (or regenerated). Route list for autocomplete / lookup in the report sheet. |
| `transport_route_geometry_index_vic.json` | Join index (`by_geometry_ref`, `by_route_external_id`). Imported by the Next.js map page. |
| FastAPI | Serves the GeoJSON at **`GET /data/transport_route_geometries_vic.geojson`** when the file exists on disk (see below). |
| Next.js (`apps/web`) | Fetches GeoJSON from **`NEXT_PUBLIC_API_BASE_URL`** by default, or from an explicit URL if set. |

Incident anchors remain **`lat` / `lng`**; route fields are additive for overlays and transport-mode reports.

---

## 1. Generate transport artifacts (recommended path)

From the **repository root**, with Python available and `services/api` on `PYTHONPATH`:

```bash
export TRANSPORT_DATA_ROOT=/path/to/your/writable/data/root
export PYTHONPATH=services/api
python scripts/ingest/run_transport_ingest_vic.py
```

- **`TRANSPORT_DATA_ROOT`**: directory where GTFS downloads and **`urban_shield/transport_gtfs/`** outputs are written. On shared team machines this is often under `/scratch/...`; on a laptop use e.g. `/tmp/urban_shield_data`.
- The pipeline downloads **Victoria GTFS schedule** material (when network allows), normalizes routes, builds **real** polylines from `trips` + `shapes`, and writes the GeoJSON + index + meta next to other outputs under:

  `TRANSPORT_DATA_ROOT/urban_shield/transport_gtfs/`

  Key filenames:

  - `transport_route_geometries_vic.geojson`
  - `transport_route_geometry_index_vic.json`
  - `transport_route_geometries_vic.meta.json`

- Smaller JSON copies may also appear under **`scripts/ingest/`** (e.g. `transport_routes_vic_normalized.json`, index). The **full GeoJSON is often tens of MB** and may **not** be copied into `scripts/ingest/` if it exceeds the internal size threshold — check `transport_route_geometries_vic.meta.json` for `scratch_geojson` / `repo_geojson` / notes.

**Offline / CI-friendly fallback** (subset routes, geometry may not align with full GTFS):

```bash
PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
```

Read [scripts/ingest/README_transport_fixture.md](../scripts/ingest/README_transport_fixture.md) for fixture limitations.

---

## 2. Point the API at your GeoJSON file

The web map loads polylines from the **API** unless you override with a full URL (see §3).

1. Copy [services/api/.env.example](../services/api/.env.example) to `services/api/.env` if you have not already.
2. Set **`TRANSPORT_ROUTE_GEOJSON_PATH`** to the absolute path of **`transport_route_geometries_vic.geojson`** produced in §1 (or any valid copy).

Example:

```env
TRANSPORT_ROUTE_GEOJSON_PATH=/tmp/urban_shield_data/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson
```

If unset, the API falls back to a **default scratch path** baked into [services/api/main.py](../services/api/main.py) (`_transport_route_geometries_path()`), which will only work on machines that use that same layout.

Start the API (from `services/api`):

```bash
cd services/api
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Sanity check** (replace host/port if needed):

```bash
curl -sI "http://localhost:8000/data/transport_route_geometries_vic.geojson" | head -n 5
```

You want **HTTP 200** and `content-type` appropriate for GeoJSON. **404** means the path is wrong or the file was never generated — fix `TRANSPORT_ROUTE_GEOJSON_PATH` or re-run ingest.

**Optional:** `ENABLE_TRANSPORT_INGEST_ON_STARTUP=true` runs the ingest script in a background thread when the API starts (see `main.py`). Use only if you understand the cost and side effects.

---

## 3. Configure the Next.js map app

1. Copy [apps/web/.env.example](../apps/web/.env.example) to **`apps/web/.env.local`**.
2. Set:
   - **`NEXT_PUBLIC_MAPBOX_TOKEN`**: a **public** Mapbox token (`pk.*`). Do not use a secret `sk.*` token in the browser.
   - **`NEXT_PUBLIC_API_BASE_URL`**: e.g. `http://localhost:8000` (no trailing slash).

**GeoJSON URL resolution** (implemented in `apps/web/app/map/page.tsx`, `resolveTransportGeoJsonFetchUrl()`):

1. If **`NEXT_PUBLIC_VIC_TRANSPORT_ROUTE_GEOJSON_URL`** (or legacy **`NEXT_PUBLIC_VIC_ROUTE_GEOJSON_URL`**) is set → the map fetches that URL directly (static host, CDN, etc.).
2. Else if **`NEXT_PUBLIC_API_BASE_URL`** is set →  
   **`{API}/data/transport_route_geometries_vic.geojson`**
3. Else → empty string (no route polylines; map still runs).

Start the web app:

```bash
cd apps/web
npm install
npm run dev
```

Open the map route in the browser (typically **`/map`**). With API + GeoJSON + token in place, route highlights should appear for incidents that carry matching `geometry_ref` / transport fields.

---

## 4. Optional: serve GeoJSON without the API

If you host the file on a static URL (S3, nginx, `next/public`, etc.):

1. Set **`NEXT_PUBLIC_VIC_TRANSPORT_ROUTE_GEOJSON_URL`** in `apps/web/.env.local` to that full URL.
2. Ensure **CORS** allows the browser origin if the file is on a different host than the Next app.

Example copy into a public folder (paths are illustrative):

```bash
cp "$TRANSPORT_DATA_ROOT/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson" apps/web/public/transport/
# Then set NEXT_PUBLIC_VIC_TRANSPORT_ROUTE_GEOJSON_URL=http://localhost:3000/transport/transport_route_geometries_vic.geojson
```

---

## 5. Quick validation of GeoJSON shape

After ingest, you can validate structure locally (adjust the path):

```bash
python3 - <<'PY'
import json
from pathlib import Path
p = Path("/your/path/transport_route_geometries_vic.geojson")
d = json.loads(p.read_text())
assert d["type"] == "FeatureCollection"
need = {"route_type", "route_external_id", "route_label", "geometry_ref"}
for f in d["features"][:5]:
    assert need <= set(f.get("properties") or {}), f.get("properties")
    assert f["properties"]["route_type"] in ("bus", "train", "tram")
print("ok", len(d["features"]), "features")
PY
```

---

## 6. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Map loads but **no coloured route lines** | `curl` the resolved GeoJSON URL; 404 → API path or ingest. Empty `NEXT_PUBLIC_API_BASE_URL` and no override URL → no fetch. |
| **CORS** errors in the browser console | API [CORSMiddleware](../services/api/main.py) or host GeoJSON on same origin / allowlisted origin. |
| Routes in UI but **geometry never matches** | Fixture fallback IDs vs GTFS-derived `geometry_ref`; see fixture README. Check **`transport_route_geometries_vic.meta.json`** for `geometry_count_missing`. |
| **`transport_routes_vic_normalized.json` missing** | Run ingest or `normalize_transport_routes.py`; ensure `scripts/ingest/` outputs exist for the bundled map imports. |

---

## 7. Related files (for code readers)

- Map page: `apps/web/app/map/page.tsx` (GeoJSON URL, Mapbox source/layer, markers, danger rings).
- Route styling helpers: `apps/web/lib/mapLayers/transportRouteLayer.ts`, `dangerZones.ts`.
- API GeoJSON route: `services/api/main.py` — `GET /data/transport_route_geometries_vic.geojson`.
- Ingest entrypoints: `scripts/ingest/run_transport_ingest_vic.py`, `scripts/ingest/normalize_transport_routes.py`.

---

## 8. Minimal “happy path” checklist

1. Run **`run_transport_ingest_vic.py`** with a writable **`TRANSPORT_DATA_ROOT`** (or use `--with-fallback` normalize only, knowing geometry may be empty).
2. Confirm **`transport_route_geometries_vic.geojson`** exists.
3. Set **`TRANSPORT_ROUTE_GEOJSON_PATH`** in **`services/api/.env`**, start **uvicorn** on port **8000**.
4. Set **`NEXT_PUBLIC_API_BASE_URL`** and **`NEXT_PUBLIC_MAPBOX_TOKEN`** in **`apps/web/.env.local`**, run **`npm run dev`** on port **3000**.
5. Open **`/map`** and verify **`GET .../data/transport_route_geometries_vic.geojson`** returns **200** in Network tab.

That reproduces the transport + map integration path used for this milestone.
