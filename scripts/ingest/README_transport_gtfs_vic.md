# Victoria GTFS route ingestion (MVP-safe)

This runbook defines the **real raw-data acquisition** path for Melbourne/Victoria public transport routes.

It replaces prototype-only route subset generation with an official source fetch + normalization flow, while preserving deterministic fallback behavior for demos and CI.

## Chosen data source

- **Primary source:** Victoria **GTFS Schedule** open data feed.
- **Why:** best fit for MVP reliability and reproducibility:
  - static schedule archive is easy to snapshot and reprocess deterministically
  - no per-request HMAC signing workflow during normalization
  - includes trains, trams, and buses needed for `route_type` alignment

## Source constraints

### PTV Timetable API (not selected for this ingestion path)

- Requires developer ID + API key and signed requests.
- Higher operational overhead for this MVP lane.

### GTFS Schedule (selected)

- Coverage includes metropolitan/regional train, tram, and bus schedules.
- Publisher notes update cadence as weekly / as-needed.
- Treated as static archive input for route key normalization.

### GTFS Realtime (not selected)

- Requires API key via `KeyID` request header.
- Published per-mode rate limits (for example: 24 calls / 60s for train/tram/bus feeds).

### Usage constraints

- Use data under the provider's stated open-data terms (CC BY 4.0 attribution requirement).
- Include attribution when sharing derivative datasets externally.

## Data install location (team default)

Large downloaded files must live in scratch storage:

```text
/scratch/s224714149/sidework
```

Script defaults:

- `TRANSPORT_DATA_ROOT=/scratch/s224714149/sidework`
- GTFS working dir under root: `urban_shield/transport_gtfs`
- Final zip path: `/scratch/s224714149/sidework/urban_shield/transport_gtfs/gtfs_schedule.zip`

Optional override env vars:

- `TRANSPORT_DATA_ROOT` (preferred root override)
- `VIC_GTFS_DATA_DIR` (explicit full ingest directory override)
- `VIC_GTFS_SCHEDULE_URL` (source URL override)

## One-time setup

From repo root:

```bash
mkdir -p /scratch/s224714149/sidework/urban_shield/transport_gtfs
```

## Commands to run ingestion

From repo root:

```bash
# Fully automated (recommended): create dir + download + unzip + normalize + route geometries + fallback
PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py
```

Legacy/manual split commands:

```bash
PYTHONPATH=services/api python scripts/ingest/fetch_transport_gtfs_vic.py --extract
PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
```

## Output artifacts

### Scratch artifacts (non-repo large files)

- `/scratch/s224714149/sidework/urban_shield/transport_gtfs/gtfs_schedule.zip`
- `/scratch/s224714149/sidework/urban_shield/transport_gtfs/gtfs_fetch.meta.json`
- `/scratch/s224714149/sidework/urban_shield/transport_gtfs/gtfs_extracted/`
- `/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson` — **authoritative** route `LineString` / `MultiLineString` GeoJSON for map rendering
- `/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.meta.json` — coverage report (`geometry_count_resolved`, `geometry_count_missing`, `missing_geometry_examples`, `fallback_used`, `data_root`)
- `/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometry_index_vic.json` — join index keyed by `geometry_ref` and `route_external_id` (each entry contains all four route keys)

### Repo artifacts (normalized output for downstream)

- `scripts/ingest/transport_routes_vic_normalized.json`
- `scripts/ingest/transport_routes_vic_normalized.meta.json`
- `scripts/ingest/transport_route_geometries_vic.meta.json` — same schema as scratch meta (generated; gitignored like normalized outputs)
- `scripts/ingest/transport_route_geometry_index_vic.json` — same as scratch index (generated; gitignored)

**GeoJSON in repo:** the full `transport_route_geometries_vic.geojson` is often tens of MB. If it exceeds the internal size threshold, it is **not** copied into `scripts/ingest/`; use the scratch path from meta `scratch_geojson` or copy manually:

```bash
cp /scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson scripts/ingest/
```

Normalized JSON schema:

- `version`
- `source`
- `generated_at`
- `region`
- `routes[]` with:
  - `route_type` (`bus` | `train` | `tram`)
  - `route_external_id` (stable unique join key)
  - `route_label` (display-only label)
  - `geometry_ref` (stable geometry pointer)

## Error and fallback behavior

- If GTFS fetch fails:
  - fetch script returns non-zero unless `--normalize` is provided.
  - when `--normalize --with-fallback` is used, the normalizer writes fallback output from `transport_routes_vic_subset.json`.
- If GTFS zip is missing/invalid:
  - normalizer fails unless `--with-fallback` is provided.
  - with fallback enabled, output is still written with:
    - `source: fixture_fallback`
    - `fallback_used: true` in meta
    - `fallback_error` set to the primary failure reason

**Geometry + fallback:** when `source` is `fixture_fallback`, geometry is **not** synthesized. GeoJSON contains only features built from real GTFS shapes; fixture route IDs will not match GTFS slugs, so `geometry_count_resolved` may be `0` while index/geojson files remain valid (empty collection / empty index maps).

## Recreate this run (for collaborators)

1. Ensure scratch path exists and is writable (`/scratch/s224714149/sidework`).
2. Run one-shot command:
   - `PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py`
3. Verify:
   - `scripts/ingest/transport_routes_vic_normalized.json` exists
   - `scripts/ingest/transport_routes_vic_normalized.meta.json` exists
   - meta has `fallback_used: false` when GTFS fetch succeeded, else `true`.

## Handoff notes

- **Agent-E (integration):** consume `transport_routes_vic_normalized.json` using existing route lookup expectations (`route_external_id`, `geometry_ref`).
- **Agent-A/Khoa (contract):** `libs/schemas/incident.ts` currently allows `route_type?: string | null`; ingestion emits only `bus|train|tram`, so schema tightening is recommended on contract lane.
