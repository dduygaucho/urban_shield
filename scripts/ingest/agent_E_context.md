# Agent E context — transport routes & geometries (post Agent-F)

This file is for **Agent E (integrator / map UX)**. It summarizes what **Agent F** produced so you can wire the web map without re-reading the full ingestion codebase.

After you read this, you can **ask your human orchestrator for feedback** (gaps, file locations, performance limits). They can paste that feedback back to Agent F in a later chat. When the orchestrator is happy with the handoff, Agent F’s transport lane is considered complete for this MVP slice.

---

## 1) What Agent F built (your inputs)

### One-command pipeline (reproducible)

From repo root, with data under `/scratch/s224714149/sidework`:

```bash
TRANSPORT_DATA_ROOT=/scratch/s224714149/sidework PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py
```

That run (via `fetch_transport_gtfs_vic.py` → `normalize_transport_routes.py`):

1. Downloads Victoria **GTFS Schedule** to scratch (not the git repo).
2. Extracts nested mode archives for inspection.
3. Normalizes **routes** to stable join keys.
4. Builds **real** route polylines from GTFS `trips.txt` + `shapes.txt` (no synthetic geometry).
5. Writes **GeoJSON** + **join index** + **coverage meta** (see paths below).
6. Can fall back to a small fixture route list if GTFS is unavailable (`--with-fallback` on the fetch step).

Full runbook and constraints: [README_transport_gtfs_vic.md](./README_transport_gtfs_vic.md).

---

## 2) Key semantics (do not change names or meaning)

These field names are **frozen** for incidents and route artifacts:

| Field | Values / role |
|--------|----------------|
| `route_type` | `bus` \| `train` \| `tram` only |
| `route_external_id` | Stable unique **join key** for route rows and incidents |
| `route_label` | **Display only** — not a join key |
| `geometry_ref` | Stable **pointer** to geometry bundle (join GeoJSON / index here) |
| `lat`, `lng` | **Canonical** incident anchors — unchanged; route geometry is additive |

Backend + shared TS alignment notes (if you touch API types): see [AGENT_A_CONTEXT.md](./AGENT_A_CONTEXT.md).

---

## 3) Artifact paths (what to load in the app)

### Scratch (authoritative large files)

Default GTFS working directory:

```text
/scratch/s224714149/sidework/urban_shield/transport_gtfs/
```

| File | Purpose |
|------|---------|
| `transport_route_geometries_vic.geojson` | `FeatureCollection` of `LineString` / `MultiLineString` routes. Each `Feature.properties` has exactly: `route_type`, `route_external_id`, `route_label`, `geometry_ref`. |
| `transport_route_geometry_index_vic.json` | Lookup maps: `by_geometry_ref`, `by_route_external_id` → same four keys (for quick client joins). |
| `transport_route_geometries_vic.meta.json` | Coverage report: `geometry_count_resolved`, `geometry_count_missing`, `missing_geometry_examples`, `fallback_used`, `source`, `data_root`, optional `repo_geojson_note`. |

### Repo (small handoffs; **gitignored** like normalized outputs)

Under `scripts/ingest/` (generated after a successful local run):

| File | Purpose |
|------|---------|
| `transport_routes_vic_normalized.json` | Route list: `routes[]` with the four keys above. |
| `transport_routes_vic_normalized.meta.json` | Normalization provenance. |
| `transport_route_geometries_vic.meta.json` | Same schema as scratch geometry meta (for CI/docs without reading scratch). |
| `transport_route_geometry_index_vic.json` | Same as scratch index (small). |

**GeoJSON in repo:** the full `transport_route_geometries_vic.geojson` is often **tens of MB**. If it exceeds the internal threshold, it is **not** copied into `scripts/ingest/`; meta includes `repo_geojson: null` and `repo_geojson_note` with the scratch path. For production map bundling, either:

- copy GeoJSON into `apps/web/public/...` during deploy, or  
- add a static file/API route (Agent A lane) to serve it.

Copy command (when needed):

```bash
cp /scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson /path/to/web/public/transport/
```

---

## 4) What you (Agent E) still need to implement

Agent F does **not** wire the Next.js map. Your typical tasks:

1. **Load** `transport_routes_vic_normalized.json` (or a trimmed build artifact) for route autocomplete / lookup — same shape as existing `RouteIndexEntry` in `apps/web/lib/reporting/routeLookup.ts`.
2. **Load** `transport_route_geometry_index_vic.json` at runtime (or build-time import if you shard).
3. **Load** `transport_route_geometries_vic.geojson` (from scratch or `public/`) and add a map source/layer (Mapbox/MapLibre/Leaflet — whatever the app uses).
4. **Join** incidents that include `geometry_ref` / `route_external_id` to the GeoJSON feature (or index row) for **polyline overlays**; keep using **`lat`/`lng`** for markers and radius logic.
5. **Handle missing geometry:** meta lists routes with no shape; UI should degrade gracefully (label + point only, no fake line).

Existing helpers (read-only reference for you):

- `apps/web/lib/reporting/routeLookup.ts` — expects the four route keys.
- `apps/web/lib/mapLayers/transportRouteLayer.ts` — styling helpers; may need actual geometry wiring elsewhere.

---

## 5) Known limitations (set expectations)

- **Not every normalized route has a polyline** — some GTFS rows lack usable `shape_id` / `shapes.txt` data. Counts are in geometry meta.
- **Fixture fallback** (`source: fixture_fallback`): normalized routes come from `transport_routes_vic_subset.json`; **IDs will not match** GTFS-derived `vic_gtfs_*` slugs, so **geometry_count_resolved may be 0** unless you also ship fixture-aligned geometry (Agent F does not invent that).
- **Large GeoJSON** — consider lazy load, CDN, or vector tile simplification later; MVP can load whole file only if acceptable for demo devices.

---

## 6) Feedback loop (orchestrator ↔ Agent E ↔ Agent F)

1. **You (Agent E)** read this file + [README_transport_gtfs_vic.md](./README_transport_gtfs_vic.md).
2. **You** list concrete questions or change requests for Agent F, for example:
   - different index shape, extra meta fields, NDGeoJSON split, bbox filter, smaller public subset, NDJSON stream, etc.
3. **Orchestrator** pastes that list into a new message to **Agent F** (allowlist: `scripts/ingest/**`, `services/api/main.py` ingestion wiring only, `docs/agents/MVP_2DAY_DUY.md`).
4. **Agent F** implements or explains blockers; orchestrator returns the reply to you.
5. When **you** are satisfied the data contract supports the map integration, tell the orchestrator **Agent E is happy** — then Agent F is **free to go** on this transport deliverable unless new scope is opened.

---

## 7) Quick validation you can run

```bash
python3 - <<'PY'
import json
from pathlib import Path
p = Path("/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson")
d = json.loads(p.read_text())
assert d["type"] == "FeatureCollection"
need = {"route_type", "route_external_id", "route_label", "geometry_ref"}
for f in d["features"][:5]:
    assert set(f["properties"].keys()) == need
    assert f["properties"]["route_type"] in ("bus", "train", "tram")
print("ok", len(d["features"]), "features")
PY
```

If scratch paths differ on your machine, set `TRANSPORT_DATA_ROOT` and re-run the one-command ingest, then adjust paths in this doc mentally to match `transport_route_geometries_vic.meta.json` → `data_root` / `scratch_geojson`.
