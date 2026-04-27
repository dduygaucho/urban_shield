# Agent-A Context (Contract + Backend Alignment after Agent-F)

This file is a focused handoff for **Agent-A** to update contract/backend behavior based on the completed Agent-F transport ingestion work.

## 1) What Agent-F has completed

Real raw-data acquisition path for VIC transport routes is working and automated:

- `scripts/ingest/run_transport_ingest_vic.py` (one-command orchestrator)
- `scripts/ingest/fetch_transport_gtfs_vic.py` (download + extract support)
- `scripts/ingest/normalize_transport_routes.py` (normalization from VIC GTFS, including nested mode zips)
- `scripts/ingest/README_transport_gtfs_vic.md` (runbook + constraints)

Default data location:

- `/scratch/s224714149/sidework/urban_shield/transport_gtfs`

Generated outputs:

- `scripts/ingest/transport_routes_vic_normalized.json`
- `scripts/ingest/transport_routes_vic_normalized.meta.json`
- Scratch route geometry (map rendering, authoritative large GeoJSON):
  - `/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson`
  - `/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.meta.json`
  - `/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometry_index_vic.json`
- Repo handoff copies (generated; same names under `scripts/ingest/` when present — typically meta + index; full GeoJSON may be scratch-only if over size threshold):
  - `scripts/ingest/transport_route_geometries_vic.meta.json`
  - `scripts/ingest/transport_route_geometry_index_vic.json`

Latest verified run produced:

- `source = gtfs_vic_schedule`
- `fallback_used = false`
- `route_count = 1000`
- route types present: `bus`, `train`, `tram`
- geometry pipeline: `geometry_count_resolved` / `geometry_count_missing` recorded in `transport_route_geometries_vic.meta.json` (no synthetic polylines; missing routes listed in `missing_geometry_examples`)

## 2) Alignment gate (already satisfied by Agent-F outputs)

Route artifact semantics are:

- `route_type`: exactly `bus|train|tram`
- `route_external_id`: stable unique join key
- `route_label`: display-only label
- `geometry_ref`: stable geometry pointer
- Incident anchor fields remain `lat/lng` (canonical)

## 3) Backend/contract status update (latest)

This section reflects backend updates now present in repo and should be used by Agent-A as current truth:

- `libs/schemas/incident.ts`
  - now defines `TRANSPORT_ROUTE_TYPES = ["bus", "train", "tram"]`
  - uses `TransportRouteType` for `route_type` in both canonical and create payload types
- `services/api/routes/incidents.py`
  - now defines `TransportRouteType = Literal["bus", "train", "tram"]`
  - validates/normalizes `route_type` for create payloads
  - rejects invalid values (for example `ferry`) with clear validation error
  - keeps GET output lenient for legacy rows by coercing invalid historical strings to `null`
- `services/api/models.py`
  - keeps DB column type as nullable string (no schema migration needed)
  - documents API-layer restriction to `bus|train|tram`

Net: the earlier `route_type` typing mismatch has been addressed in API + shared schema layers.

## 4) Recommended Agent-A focus now (owner allowlist)

Agent-A scope (from orchestration docs) includes:

- `services/api/routes/incidents.py`
- `services/api/models.py`
- `libs/schemas/incident.ts`
- `docs/agents/MVP_2DAY_KHOA.md`

Current focus after transport typing alignment:

1. **Preserve strict transport semantics**
   - Keep `route_type` constrained to `bus|train|tram` in TS and API request paths.
   - Keep `route_external_id`, `route_label`, `geometry_ref` semantics unchanged.

2. **Protect backward compatibility**
   - Point-only incidents must continue to work unchanged.
   - Legacy DB rows with non-canonical transport strings should not break GET responses.

3. **Coordinate with geometry producer output**
   - Agent-F geometry artifacts are keyed by `geometry_ref` and `route_external_id`.
   - Keep backend contract additive; do not repurpose or rename those keys.

## 5) Non-goals for Agent-A

- Do not alter Agent-F ingestion scripts under `scripts/ingest/` for this task.
- Do not change frontend map rendering in this handoff.
- Do not add DB schema fields beyond current transport metadata set.

## 6) Quick validation checklist for Agent-A

After changes, verify:

1. Payload with `route_type="tram"` is accepted.
2. Payload with `route_type="ferry"` is rejected.
3. Payload without any transport fields is accepted.
4. Legacy row with unexpected `route_type` still returns safely (null/omitted semantics preserved).
5. `lat/lng` semantics remain unchanged.

## 7) Useful command context for repro

From repo root:

```bash
PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py
```

If scratch is not writable in your environment:

```bash
TRANSPORT_DATA_ROOT=/tmp/urban_shield_data PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py
```

Agent-A should treat this ingestion output as source-of-truth evidence that `route_type` values are constrained and stable.

## 8) Ongoing sync protocol (important)

When Agent-F updates transport ingestion/geometry behavior, update this context file with a short delta block:

- `DELTA_DATE`: ISO timestamp
- `FILES_CHANGED`: list of relevant Agent-F files
- `BACKEND_IMPACT`: `none` or explicit contract/API implications
- `ACTION_FOR_AGENT_A`: exact follow-up tasks (or `none`)

This keeps Agent-A aligned without re-reading the full ingestion pipeline each time.

### Latest delta (geometry producer)

- `DELTA_DATE`: 2026-04-27
- `FILES_CHANGED`: `scripts/ingest/normalize_transport_routes.py`, `scripts/ingest/README_transport_gtfs_vic.md`, `scripts/ingest/README_transport_fixture.md`, `scripts/ingest/run_transport_ingest_vic.py`, `.gitignore`
- `BACKEND_IMPACT`: **none** — geometry artifacts are static files + scratch outputs; incident contract keys unchanged (`route_type`, `route_external_id`, `route_label`, `geometry_ref`; `lat`/`lng` canonical).
- `ACTION_FOR_AGENT_A`: optional — if the API should serve GeoJSON, add a **new** static route or file-serving path in Agent-A allowlist (do not rename incident fields). Otherwise frontend loads scratch/repo paths per runbook.
