# Vishnu — Safety Scoring Work Packet (2-Day MVP)

Primary role: Route Planning (incident-route matching + safety score/ranking).

## Branch Assignment

- Primary branch: `mvp2day/vishnu-safety-scoring`
- Integration base: `main`
- Backup executor on this branch when needed: Duc

## Team Branch and Allowlist Matrix (read-only reference)

- Vishnu -> `mvp2day/vishnu-safety-scoring` -> `apps/web/lib/safety/**`, `apps/web/app/map/page.tsx` (safety UI only), `docs/agents/MVP_2DAY_VISHNU.md`
- Duc -> `mvp2day/duc-route-planning` -> `apps/web/lib/routing/**`, `apps/web/app/map/page.tsx` (route UI only), `docs/agents/MVP_2DAY_DUC.md`
- Khoa -> `mvp2day/khoa-data-contract` -> `services/api/routes/incidents.py`, `services/api/models.py`, `libs/schemas/incident.ts`, `docs/agents/MVP_2DAY_KHOA.md`
- Duy -> `mvp2day/duy-data-ingest` -> `scripts/ingest_social.py`, `scripts/ingest/**`, `services/api/main.py`, `docs/agents/MVP_2DAY_DUY.md`

Merge order reference: Khoa -> Duy -> Duc -> Vishnu.

## Hybrid Execution Priority

Urgent unblocker tasks from Vishnu:
- `VISHNU-3` is urgent because it unblocks `DUC-5` and `DUC-7`.

Vishnu dependency gates:
- `VISHNU-1` depends on `DUC-4`.
- `VISHNU-5` depends on `DUY-5` and stable data schema from Khoa (`KHOA-6`).

Can start immediately (no waiting):
- `VISHNU-2`, `VISHNU-3`, `VISHNU-4`, `VISHNU-6`, `VISHNU-7` scaffold work.

## Allowed Ownership

You may modify only:
- `apps/web/lib/safety/**`
- `apps/web/app/map/page.tsx` (safety score rendering only, in serial merge window)
- your own notes in this file

Do not modify ingestion connectors or extraction classifiers.

Backup relationship:
- Primary owner: Vishnu
- Backup owner: Duc (can take over any `VISHNU-*` task when needed)

## Interfaces You Must Respect

Input dependencies:
- incident snapshots from Duy/Khoa
- route candidates from Duc

Output requirements:
- numeric `safety_score`
- rankable route list
- `incident_refs`
- human-readable `explanation`

## Task Checklist

### Day 1 (Core)
- [ ] `VISHNU-1` Implement incident proximity matching against route geometry (`PENDING`, depends on `DUC-4`)
- [ ] `VISHNU-2` Implement simple weighted safety scoring formula (`PENDING`)
- [ ] `VISHNU-3` Implement route ranking and explanation fields (`PENDING`, urgent unblocker for Duc)
- [ ] `VISHNU-4` Define scoring defaults for missing/low-confidence data (`PENDING`)

### Day 2 (Integration + Demo)
- [ ] `VISHNU-5` Integrate with real incident snapshots from data team (`PENDING`, depends on `KHOA-6` and `DUY-5`)
- [ ] `VISHNU-6` Validate score behavior on low-risk vs high-risk test scenarios (`PENDING`)
- [ ] `VISHNU-7` Prepare route inspection output for demo narrative (`PENDING`)

## AI Planning Mode: Micro-task Split Template

When any `VISHNU-*` task is too large, split into:
- `VISHNU-<n>-A` output + files + done criteria
- `VISHNU-<n>-B` output + files + done criteria
- `VISHNU-<n>-C` output + files + done criteria

Only split inside this file. Do not create ad hoc side documents.

## Deliverables

- Transparent and deterministic safety score behavior.
- Route ranking output with clear rationale.
- Demo-ready inspection details per route.

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

If Duc takes over:
- add `TAKEOVER: DUC | <task-id> | <timestamp>`

## Assumptions Log (required before implementation)

Record one line per assumption:
- `ASSUMPTION: <task-id> | <assumption> | <impact-if-wrong>`

## Implementation Delta Log (required if implementation differs)

Record one line whenever delivered behavior differs from planned behavior:
- `DELTA: <task-id> | planned=<...> | actual=<...> | reason=<...> | downstream=<who/what>`

## Conflict Scan Log (required before DONE)

Record one line per completed task:
- `CONFLICT_SCAN: <task-id> | files=<paths> | overlap=<none|possible> | interface=<ok|risk> | action=<none|follow-up>`
