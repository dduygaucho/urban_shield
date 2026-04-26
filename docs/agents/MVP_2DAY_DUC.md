# Duc — Route Planning Work Packet (2-Day MVP)

Primary role: Route Planning (route alternatives + route contract).

## Allowed Ownership

You may modify only:
- `apps/web/lib/routing/**`
- `apps/web/app/map/page.tsx` (route options rendering only)
- your own notes in this file

Do not modify ingestion/extraction/classification modules.

Backup relationship:
- Primary owner: Duc
- Backup owner: Vishnu (can take over any `DUC-*` task when needed)

## Interfaces You Must Respect

Route output must include:
- `route_id`
- `geometry`
- `safety_score` (from Vishnu integration)
- `incident_refs`
- `explanation`

Generate 2-3 alternatives per request.

## Task Checklist

### Day 1 (Core)
- [ ] `DUC-1` Implement route request and base response contract (`PENDING`)
- [ ] `DUC-2` Build route candidate generator returning 2-3 alternatives (`PENDING`)
- [ ] `DUC-3` Add deterministic behavior for demo origin/destination fixtures (`PENDING`)
- [ ] `DUC-4` Document route geometry abstraction for Vishnu integration (`PENDING`, prerequisite for `VISHNU-1`)

### Day 2 (Integration + Demo)
- [ ] `DUC-5` Integrate incident references into route payload (`PENDING`, depends on `VISHNU-1`)
- [ ] `DUC-6` Validate route options are viewable and distinguishable in demo (`PENDING`)
- [ ] `DUC-7` Finalize route payload quality for stakeholder walkthrough (`PENDING`)

## AI Planning Mode: Micro-task Split Template

When any `DUC-*` task is too large, split into:
- `DUC-<n>-A` output + files + done criteria
- `DUC-<n>-B` output + files + done criteria
- `DUC-<n>-C` output + files + done criteria

Only split inside this file. Do not create ad hoc side documents.

## Deliverables

- 2-3 route alternatives per query.
- Stable route payload accepted by scoring layer.
- Demo-friendly examples showing route differences.

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

If Vishnu takes over:
- add `TAKEOVER: VISHNU | <task-id> | <timestamp>`

## Assumptions Log (required before implementation)

Record one line per assumption:
- `ASSUMPTION: <task-id> | <assumption> | <impact-if-wrong>`

## Implementation Delta Log (required if implementation differs)

Record one line whenever delivered behavior differs from planned behavior:
- `DELTA: <task-id> | planned=<...> | actual=<...> | reason=<...> | downstream=<who/what>`

## Conflict Scan Log (required before DONE)

Record one line per completed task:
- `CONFLICT_SCAN: <task-id> | files=<paths> | overlap=<none|possible> | interface=<ok|risk> | action=<none|follow-up>`
