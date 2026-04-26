# MVP 2-Day Sprint — Status Board

This file is updated by sprint lead at checkpoint times only.

Checkpoint cadence:
- Day 1: mid-day, end-of-day
- Day 2: mid-day, pre-demo

## Global Status

- Sprint state: `NOT_STARTED`
- Core path state: `PENDING`
- Stretch path state: `PENDING`

## Branch Assignments and Allowed Writes

- Duy: `mvp2day/duy-data-ingest` -> `scripts/ingest_social.py`, `scripts/ingest/**`, `services/api/main.py`, `docs/agents/MVP_2DAY_DUY.md`
- Khoa: `mvp2day/khoa-data-contract` -> `services/api/routes/incidents.py`, `services/api/models.py`, `libs/schemas/incident.ts`, `docs/agents/MVP_2DAY_KHOA.md`
- Duc: `mvp2day/duc-route-planning` -> `apps/web/lib/routing/**`, `apps/web/app/map/page.tsx` (route UI only), `docs/agents/MVP_2DAY_DUC.md`
- Vishnu: `mvp2day/vishnu-safety-scoring` -> `apps/web/lib/safety/**`, `apps/web/app/map/page.tsx` (safety UI only), `docs/agents/MVP_2DAY_VISHNU.md`

Merge order standard: Khoa -> Duy -> Duc -> Vishnu.

## Task Rollup

- `T0` Interface freeze: `PENDING` | Primary: Khoa | Backup: Duy
- `T1` Ingestion pipeline: `PENDING` | Primary: Duy | Backup: Khoa
- `T2` Extraction/classification: `PENDING` | Primary: Khoa | Backup: Duy
- `T3` Route alternatives: `PENDING` | Primary: Duc | Backup: Vishnu
- `T4` Safety scoring integration: `PENDING` | Primary: Vishnu | Backup: Duc
- `T5` Route inspection output: `PENDING` | Primary: Vishnu | Backup: Duc
- `T6` End-to-end demo: `PENDING` | Primary: Duc | Backup: Duy
- `T7` Public transport stretch: `PENDING` | Primary: Duy | Backup: Khoa

## Collaborator Snapshot

- Duy: `0/7 DONE`
- Khoa: `0/7 DONE`
- Duc: `0/7 DONE`
- Vishnu: `0/7 DONE`

## Active Blockers

- None

## Accepted Implementation Deltas

- None

## Open Conflict Candidates

- None

## Takeover Events

- None

## Notes

- Detailed progress remains in each collaborator file:
  - `docs/agents/MVP_2DAY_DUY.md`
  - `docs/agents/MVP_2DAY_KHOA.md`
  - `docs/agents/MVP_2DAY_DUC.md`
  - `docs/agents/MVP_2DAY_VISHNU.md`
- Before checkpoint close, sprint lead must reconcile:
  - each collaborator `DELTA` entries into `Accepted Implementation Deltas`,
  - each collaborator `CONFLICT_SCAN` entries into `Open Conflict Candidates` when risk exists.
