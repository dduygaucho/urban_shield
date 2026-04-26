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

## Allowed Ownership

You may modify only:
- `scripts/ingest_social.py`
- `scripts/ingest/**`
- `services/api/main.py` (ingestion wiring only)
- your own notes in this file

Do not modify routing/scoring modules.

Backup relationship:
- Primary owner: Duy
- Backup owner: Khoa (can take over any `DUY-*` task when needed)

## Interfaces You Must Respect

Output incident payload must provide:
- `id`, `source`, `type`, `timestamp`, `lat`, `lng`, `duration_class`, optional `confidence`

Do not break the shared contract defined in `docs/agents/MVP_2DAY_ORCHESTRATION.md`.

## Task Checklist

### Day 1 (Core)
- [ ] `DUY-1` Build connector A (real limited feed or simulated source) (`PENDING`, depends on `KHOA-1`)
- [ ] `DUY-2` Implement scheduled batch ingestion trigger (`PENDING`, depends on `KHOA-1`)
- [ ] `DUY-3` Produce normalized incident records from connector A (`PENDING`, depends on `KHOA-1`, `KHOA-3`)
- [ ] `DUY-4` Add malformed-record guardrails and logging (`PENDING`, parallel with `DUC-*`, `VISHNU-*`)

### Day 2 (Integration + Demo)
- [ ] `DUY-5` Provide deterministic replay fixture for integration testing (`PENDING`)
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
