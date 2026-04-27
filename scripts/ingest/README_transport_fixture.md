# Transport prototype fixtures (Victoria subset)

Static data for the transport-incident UX prototype: **not** live PTV/GTFS feeds and **not** full network coverage.

## Real GTFS ingestion (separate from this fixture)

For **authoritative** route keys from Victoria GTFS Schedule (large zip on **scratch**, normalized JSON under `scripts/ingest/`), see **[README_transport_gtfs_vic.md](./README_transport_gtfs_vic.md)**.

**Data install location (team):** large downloads go under `/scratch/s224714149/sidework/urban_shield/transport_gtfs/` by default (`TRANSPORT_DATA_ROOT` + subdir, or explicit `VIC_GTFS_DATA_DIR`). For automatic download + unzip + normalize output, run:

`PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py`

That run also emits **route geometry** artifacts under scratch (`transport_route_geometries_vic.geojson`, index, meta) aligned to `geometry_ref` / `route_external_id` in the normalized route list. See [README_transport_gtfs_vic.md](./README_transport_gtfs_vic.md).

## Files

| File | Purpose |
|------|---------|
| `transport_routes_vic_subset.json` | 15 curated metro routes (tram / train / bus) with stable join keys. |
| `transport_incidents_fixture.json` | Deterministic sample incidents: canonical point fields + optional transport metadata + map UI compatibility fields. |

## Route model (stable keys)

Each entry under `routes` includes:

- **`route_type`**: `tram` | `train` | `bus`
- **`route_external_id`**: stable string ID for joins (unique in this file).
- **`route_label`**: human-readable service/line label for UI copy.
- **`geometry_ref`**: opaque stable token naming a geometry bundle (e.g. GeoJSON path or asset key). **This repo’s fixture does not ship actual geometry files**; consumers treat `geometry_ref` as a lookup key for a future static asset or proxy.

`route_external_id` and `geometry_ref` are **one-to-one** in the subset (no duplicates).

## Incident model

- **Canonical anchor**: `lat`, `lng` remain the source of truth for map placement and radius queries.
- **Canonical API-oriented fields** (align with shared incident contract): `id`, `source`, `type`, `timestamp`, `lat`, `lng`, `duration_class`, optional `confidence`.  
  `type` uses the same category enum as the rest of the app (`crime`, `harassment`, `intoxication`, `suspicious`, `violence`).
- **Optional transport add-ons** (when present, should match a row in the route subset): `route_type`, `route_external_id`, `route_label`, `geometry_ref`.
- **Map UI compatibility** (optional on fixtures, useful for demos): `category`, `description`, `created_at`. If the map only knows point + category, transport fields are ignored until a transport layer joins them.

## Determinism

- All IDs, timestamps, coordinates, and optional `confidence` values are **fixed** for replay and integration tests.
- `source` is consistently `fixture_transport_v1` for every row in the incident fixture.

## Prototype simplifications

1. **Static subset only** — ~15 routes; many real services are omitted by design.
2. **Labels are illustrative** — names resemble public route branding; data is **not** guaranteed to match current timetables or realignment.
3. **No real-time** — no delays, diversions, or live vehicle positions.
4. **No bundled geometries** — `geometry_ref` is a stable placeholder until static GeoJSON (or similar) is added elsewhere.
5. **Nearest point-on-route** (when implemented upstream) may adjust display anchors; fixtures still supply explicit `lat`/`lng` for tests.

## Fallback behavior (for integrators / UX)

| Case | Expected handling |
|------|-------------------|
| **No transport keys** on an incident | Render as a normal point incident only; no route highlight. Example: `vic_fix_inc_edge_no_route`. |
| **`route_external_id` not in subset** | Treat as “route not found” / outside prototype dataset: show point + user messaging; do not invent geometry. Example: `vic_fix_inc_edge_unknown_route` (`vic_train_z999_not_in_subset`). |
| **Partial transport keys** (e.g. id without label) | Prefer lookup from subset by `route_external_id`; if missing, fall back to provided label or generic “Unknown route”. |
| **`geometry_ref` missing in asset store** | Same as unknown route for line overlay; point remains valid. |
| **Unknown `category` for map markers** | Map may use a neutral marker color (e.g. slate gray) when category is not in the known palette. |

## Consistency rules

- For every incident that **should** resolve to a route overlay, `route_external_id` (and recommended: `route_type`, `route_label`, `geometry_ref`) must **exactly** match an entry in `transport_routes_vic_subset.json`.
- Edge-case rows intentionally **violate** this rule for testing; see IDs above.

## Quick counts

- Routes: **15** (5 tram, 5 train, 5 bus).
- Incidents: **17** (15 linked one-to-one with distinct routes, 2 edge cases).
