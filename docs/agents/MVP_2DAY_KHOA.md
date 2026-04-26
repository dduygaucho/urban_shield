# Khoa — Data Extraction and Classification Work Packet (2-Day MVP)

Primary role: Data Crawling (Normalization + classification + schema guardrails).

## Branch Assignment

- Primary branch: `mvp2day/khoa-data-contract`
- Integration base: `main`
- Backup executor on this branch when needed: Duy

## Team Branch and Allowlist Matrix (read-only reference)

- Khoa -> `mvp2day/khoa-data-contract` -> `services/api/routes/incidents.py`, `services/api/models.py`, `libs/schemas/incident.ts`, `docs/agents/MVP_2DAY_KHOA.md`
- Duy -> `mvp2day/duy-data-ingest` -> `scripts/ingest_social.py`, `scripts/ingest/**`, `services/api/main.py`, `docs/agents/MVP_2DAY_DUY.md`
- Duc -> `mvp2day/duc-route-planning` -> `apps/web/lib/routing/**`, `apps/web/app/map/page.tsx` (route UI only), `docs/agents/MVP_2DAY_DUC.md`
- Vishnu -> `mvp2day/vishnu-safety-scoring` -> `apps/web/lib/safety/**`, `apps/web/app/map/page.tsx` (safety UI only), `docs/agents/MVP_2DAY_VISHNU.md`

Merge order reference: Khoa -> Duy -> Duc -> Vishnu.

## Hybrid Execution Priority

Urgent unblocker tasks from Khoa:
- `KHOA-1` and `KHOA-3` are urgent because Duy cannot finalize `DUY-3` and `DUY-6` without them.

Can start immediately (no waiting):
- `KHOA-1`, `KHOA-2`, `KHOA-3`, `KHOA-4`.

Downstream unlocked by Khoa:
- Duy core data finalization (`DUY-3`, `DUY-6`).
- Routing integration confidence for Vishnu (`VISHNU-5`) through stable schema.

## Allowed Ownership

You may modify only:
- `services/api/routes/incidents.py` (classification/validation logic only)
- `services/api/models.py` (incident data shape only)
- `libs/schemas/incident.ts`
- your own notes in this file

Do not modify route generation or scoring modules.

Timezone sequencing responsibility:
- Khoa is the prerequisite owner for data lane startup.
- Duy starts connector execution after Khoa prerequisite tasks are done.

Backup relationship:
- Primary owner: Khoa
- Backup owner: Duy (can take over any `KHOA-*` task when needed)

## Interfaces You Must Respect

Required incident fields:
- `id`, `source`, `type`, `timestamp`, `lat`, `lng`, `duration_class`, optional `confidence`

`duration_class` values must be only:
- `short_term`
- `long_term`

## Task Checklist

### Day 1 (Core)
- [ ] `KHOA-1` Implement normalization from raw connector payload to canonical incident object (`PENDING`, urgent unblocker for Duy)
- [ ] `KHOA-2` Implement keyword-based duration classification proxy (`PENDING`, prerequisite-first)
- [ ] `KHOA-3` Add schema validation checks before store write (`PENDING`, urgent unblocker for Duy)
- [ ] `KHOA-4` Prepare classification dictionary and fallback behavior (`PENDING`, can run parallel with `DUY-1`, `DUY-2`)

### Day 2 (Integration + Demo)
- [ ] `KHOA-5` Validate Duy connector output compatibility (`PENDING`)
- [ ] `KHOA-6` Deliver stable incident snapshot output for routing team (`PENDING`)
- [ ] `KHOA-7` Tune classification examples for demo clarity (`PENDING`)

## AI Planning Mode: Micro-task Split Template

When any `KHOA-*` task is too large, split into:
- `KHOA-<n>-A` output + files + done criteria
- `KHOA-<n>-B` output + files + done criteria
- `KHOA-<n>-C` output + files + done criteria

Only split inside this file. Do not create ad hoc side documents.

## Deliverables

- Canonicalized incident records with valid schema.
- Deterministic duration classification behavior.
- Handoff note for Duc/Vishnu describing available fields and caveats.

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

If Duy takes over:
- add `TAKEOVER: DUY | <task-id> | <timestamp>`

## Assumptions Log (required before implementation)

Record one line per assumption:
- `ASSUMPTION: <task-id> | <assumption> | <impact-if-wrong>`

## Implementation Delta Log (required if implementation differs)

Record one line whenever delivered behavior differs from planned behavior:
- `DELTA: <task-id> | planned=<...> | actual=<...> | reason=<...> | downstream=<who/what>`

## Conflict Scan Log (required before DONE)

Record one line per completed task:
- `CONFLICT_SCAN: <task-id> | files=<paths> | overlap=<none|possible> | interface=<ok|risk> | action=<none|follow-up>`
