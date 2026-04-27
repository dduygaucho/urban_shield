# Duy — Data Crawling Work Packet (2-Day MVP)

Primary role: Data Crawling (Connector A + ingestion scheduling).

## Branch Assignment

- Primary branch: `mvp2day/duy-data-ingest`
- Integration base: `main`
- Backup executor on this branch when needed: Khoa

## Team Branch and Allowlist Matrix (read-only reference)

- Duy -> `mvp2day/duy-data-ingest` -> `scripts/ingest_social.py`, `scripts/ingest/**`, `services/api/main.py`, `docs/agents/MVP_2DAY_DUY.md`
- Khoa -> `mvp2day/khoa-data-contract` -> `services/api/routes/incidents.py`, `services/api/models.py`, `libs/schemas/incident.ts`, `docs/agents/MVP_2DAY_KHOA.md`
- Duc -> `mvp2day/duc-route-planning` -> `apps/web/lib/routing/**`, `apps/web/app/map/page.tsx` (route UI only), `docs/agents/MVP_2DAY_DUC.md`
- Vishnu -> `mvp2day/vishnu-safety-scoring` -> `apps/web/lib/safety/**`, `apps/web/app/map/page.tsx` (safety UI only), `docs/agents/MVP_2DAY_VISHNU.md`

Merge order reference: Khoa -> Duy -> Duc -> Vishnu.

## Hybrid Execution Priority

Urgent unblocker task from Duy:
- `DUY-5` (fixture/replay output) is urgent because it unblocks `VISHNU-5`.

Duy start gate from Khoa:
- `KHOA-1` and `KHOA-3` must be done before Duy marks `DUY-3` and `DUY-6` as done.

Can start immediately (no waiting):
- `DUY-1`, `DUY-2`, `DUY-4`, `DUY-5` as scaffold/prework.

## Allowed Ownership

You may modify only:
- `scripts/ingest_social.py`
- `scripts/ingest/**`
- `services/api/main.py` (ingestion wiring only)
- your own notes in this file

Do not modify routing/scoring modules.

## Transport GTFS acquisition (Agent-F) — scratch + runbook

**Large data (GTFS zip) must not live in the repo.** Default install directory on shared compute:

```text
/scratch/s224714149/sidework/urban_shield/transport_gtfs/
```

By default scripts use `TRANSPORT_DATA_ROOT=/scratch/s224714149/sidework` and write under `urban_shield/transport_gtfs`. Override with:

- `TRANSPORT_DATA_ROOT` (preferred root override)
- `VIC_GTFS_DATA_DIR` (explicit full data directory)

One-time directory create:

```bash
mkdir -p /scratch/s224714149/sidework/urban_shield/transport_gtfs
```

**What collaborators download:** the official Victoria **GTFS Schedule** zip (same URL as `VIC_GTFS_SCHEDULE_URL` default in code). Full constraints, licensing, manual download path, and artifact schema: [scripts/ingest/README_transport_gtfs_vic.md](../../scripts/ingest/README_transport_gtfs_vic.md).

**Commands (repo root):**

```bash
# Recommended: fully automated (download + unzip + normalize + deterministic fallback)
PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py

# Legacy split flow:
PYTHONPATH=services/api python scripts/ingest/fetch_transport_gtfs_vic.py --extract
PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
```

**Outputs (local; normalized JSON is gitignored):**

- `scripts/ingest/transport_routes_vic_normalized.json` — `routes[]` with `route_type` (`bus`|`train`|`tram`), `route_external_id`, `route_label`, `geometry_ref`
- `scripts/ingest/transport_routes_vic_normalized.meta.json` — `fallback_used`, checksum, counts
- Scratch: `gtfs_schedule.zip`, `gtfs_fetch.meta.json`

**Optional API wiring:** set `ENABLE_TRANSPORT_INGEST_ON_STARTUP=true` to run `fetch_transport_gtfs_vic.py --normalize --with-fallback` once in a background thread on API startup (see `services/api/main.py`).

**Handoff Agent-E:** consume `transport_routes_vic_normalized.json` the same way as the static subset; join keys unchanged. **Handoff Agent-A (Khoa):** tighten `route_type` in shared TS to `bus|train|tram` — ingestion emits only those values; `libs/schemas/incident.ts` still types it loosely today.

Backup relationship:
- Primary owner: Duy
- Backup owner: Khoa (can take over any `DUY-*` task when needed)

## Interfaces You Must Respect

Output incident payload must provide:
- `id`, `source`, `type`, `timestamp`, `lat`, `lng`, `duration_class`, optional `confidence`

Do not break the shared contract defined in `docs/agents/MVP_2DAY_ORCHESTRATION.md`.

## Task Checklist

### Day 1 (Core)
- [ ] `DUY-1` Build connector A (real limited feed or simulated source) (`PENDING`, can start immediately; final compatibility check after `KHOA-1`)
- [ ] `DUY-2` Implement scheduled batch ingestion trigger (`PENDING`, can start immediately; final compatibility check after `KHOA-1`)
- [ ] `DUY-3` Produce normalized incident records from connector A (`PENDING`, depends on `KHOA-1`, `KHOA-3`)
- [ ] `DUY-4` Add malformed-record guardrails and logging (`PENDING`, parallel with `DUC-*`, `VISHNU-*`)

### Day 2 (Integration + Demo)
- [ ] `DUY-5` Provide deterministic replay fixture for integration testing (`PENDING`, urgent unblocker for `VISHNU-5`)
- [ ] `DUY-6` Validate handoff payload with Khoa schema checks (`PENDING`)
- [ ] `DUY-7` Support end-to-end demo with stable ingestion run (`PENDING`)

## AI Planning Mode: Micro-task Split Template

When any `DUY-*` task is too large, split into:
- `DUY-<n>-A` output + files + done criteria
- `DUY-<n>-B` output + files + done criteria
- `DUY-<n>-C` output + files + done criteria

Only split inside this file. Do not create ad hoc side documents.

## Deliverables

- Evidence that batch ingestion runs on schedule.
- Example payload samples accepted by downstream schema validation.
- Brief handoff note to Khoa and Vishnu on data characteristics.

## Blockers

- [ ] None currently

If blocked, add one line:
- `BLOCKED: <task-id> | <reason> | <needed-from-who>`

## Completion Log

When a task is done, append one line:
- `<task-id> DONE | <timestamp> | <evidence>`

## Takeover Notes (required while task is IN_PROGRESS)

For each active task, keep this one-line log updated:
- `NEXT: <task-id> | files=<paths> | next_step=<one line> | risk=<one line>`

If Khoa takes over:
- add `TAKEOVER: KHOA | <task-id> | <timestamp>`

## Assumptions Log (required before implementation)

Record one line per assumption:
- `ASSUMPTION: <task-id> | <assumption> | <impact-if-wrong>`

## Implementation Delta Log (required if implementation differs)

Record one line whenever delivered behavior differs from planned behavior:
- `DELTA: <task-id> | planned=<...> | actual=<...> | reason=<...> | downstream=<who/what>`

## Conflict Scan Log (required before DONE)

Record one line per completed task:
- `CONFLICT_SCAN: <task-id> | files=<paths> | overlap=<none|possible> | interface=<ok|risk> | action=<none|follow-up>`
