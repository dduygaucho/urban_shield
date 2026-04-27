# Victoria public transport — real GTFS schedule ingestion (MVP)

This pipeline replaces **prototype-only** route metadata with **authoritative schedule-derived** route keys, while keeping the same downstream field names as the fixture contract.

## Where large data must live (team standard)

**Do not commit GTFS zips or extracted trees into the git repo.** They are large (hundreds of MB) and change weekly.

Default download and extract directory (override with `VIC_GTFS_DATA_DIR`):

```text
/scratch/s224714149/sidework/urban_shield/transport_gtfs/
```

On first run, create the parent path if needed:

```bash
mkdir -p /scratch/s224714149/sidework/urban_shield/transport_gtfs
```

Set env if your scratch layout differs:

```bash
export VIC_GTFS_DATA_DIR=/path/to/your/scratch/urban_shield/transport_gtfs
```

Small **generated** artifacts (normalized route index JSON) are written under `scripts/ingest/` so the repo and Agent-E can consume them without reading scratch.

## What to download (recreate a successful run)

### Automated (recommended)

From repo root:

```bash
PYTHONPATH=services/api python scripts/ingest/fetch_transport_gtfs_vic.py
PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
```

Or one shot:

```bash
PYTHONPATH=services/api python scripts/ingest/fetch_transport_gtfs_vic.py --normalize --with-fallback
```

### Manual (if fetch is blocked)

1. Open the official **GTFS Schedule** dataset on Transport Victoria Open Data (same feed the script uses by default).
2. Download the **GTFS zip** resource (filename is commonly `gtfs.zip`).
3. Save it to:

   ```text
   $VIC_GTFS_DATA_DIR/gtfs_schedule.zip
   ```

   With the default `VIC_GTFS_DATA_DIR`, that is:

   ```text
   /scratch/s224714149/sidework/urban_shield/transport_gtfs/gtfs_schedule.zip
   ```

4. Run normalization only:

   ```bash
   export VIC_GTFS_DATA_DIR=/scratch/s224714149/sidework/urban_shield/transport_gtfs
   PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
   ```

Override the upstream URL if the portal moves the resource (optional):

```bash
export VIC_GTFS_SCHEDULE_URL='https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip'
```

## Source choice and constraints

### Primary: GTFS Schedule (Victoria)

- **Why:** Static, file-based, no per-request signing; good for stable `route_external_id` / `geometry_ref` style pointers for the MVP.
- **Auth:** Public HTTPS download for the schedule bundle (no API key for the default zip URL).
- **Rate limits:** Treat as a normal large file download; do not run in a tight loop. Prefer **weekly** batch or on-demand refresh.
- **Refresh cadence (publisher):** Schedule GTFS is updated **weekly or as needed** (check dataset metadata on the portal for the current statement).
- **Validity window (publisher):** The bundle typically includes a **rolling window** of service days from the export date; not all future dates may be present until later drops.
- **License / attribution:** Data is published under **Creative Commons Attribution 4.0 (CC BY 4.0)**. Attribute when redistributing derived datasets or screenshots. Suggested wording (from publisher guidance): *Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.* (Adjust if your legal review requires the Department of Transport and Planning naming instead.)

### Alternative: PTV Timetable API (not used for this MVP ingest path)

- **Auth:** Developer ID + API key + **HMAC-SHA1 signature** per request.
- **Operational note:** Higher integration friction than GTFS zip for batch normalization.

### Not chosen for this path: GTFS Realtime

- **Auth:** API key via request header (portal metadata references `KeyID`).
- **Rate limits (publisher metadata):** On the order of **24 calls per 60 seconds** per mode endpoint class; suitable for operational clients, not for bulk historical reconstruction in MVP.

## Output artifacts (repo tree)

| Artifact | Location | Purpose |
|----------|----------|---------|
| Normalized route index | `scripts/ingest/transport_routes_vic_normalized.json` | Stable keys for UI / joins (`route_type`, `route_external_id`, `route_label`, `geometry_ref`). |
| Run metadata | `scripts/ingest/transport_routes_vic_normalized.meta.json` | Source URL, `fetched_at`, sha256, counts, `fallback_used`. |
| Raw zip | `$VIC_GTFS_DATA_DIR/gtfs_schedule.zip` | Cached official bundle (gitignored on scratch only; not in repo). |
| Extracted feed (optional) | `$VIC_GTFS_DATA_DIR/gtfs_extracted/` | Full tree after extract (for debugging); safe to delete to reclaim space. |

## Alignment contract (downstream)

- `route_type`: exactly `bus`, `train`, or `tram`.
- `route_external_id`: stable unique join key (string).
- `route_label`: display-only label (not the join key).
- `geometry_ref`: stable pointer token for geometry lookup (no GeoJSON bundled in-repo for MVP).
- Incidents: **`lat` / `lng` remain canonical anchors**; transport fields are optional add-ons.

## Fallback behavior

If the zip is missing, corrupt, or parsing yields no usable routes, normalization **writes** `transport_routes_vic_normalized.json` from the checked-in subset [`transport_routes_vic_subset.json`](transport_routes_vic_subset.json), sets `source` to `fixture_fallback` in the JSON and `fallback_used: true` in the meta file, and exits **0** after logging the fallback (unless the subset file itself cannot be read — then exit **1**).

## Related docs

- Prototype fixtures and UX edge cases: [`README_transport_fixture.md`](README_transport_fixture.md)
- Orchestration / ownership: [`docs/agents/MVP_2DAY_ORCHESTRATION.md`](../../docs/agents/MVP_2DAY_ORCHESTRATION.md)
- Duy runbook / handoff: [`docs/agents/MVP_2DAY_DUY.md`](../../docs/agents/MVP_2DAY_DUY.md)

## Handoff: schema typing (Agent-A / Khoa)

Shared TypeScript currently types `route_type` loosely on incidents. Tightening to `bus | train | tram` at the contract layer is recommended; ingestion here emits only those three values.
