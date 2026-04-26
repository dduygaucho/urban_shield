# Khoa — Data Extraction and Classification Work Packet (2-Day MVP)

Primary role: Data Crawling (Normalization + classification + schema guardrails).

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
- [ ] `KHOA-1` Implement normalization from raw connector payload to canonical incident object (`PENDING`, prerequisite-first)
- [ ] `KHOA-2` Implement keyword-based duration classification proxy (`PENDING`, prerequisite-first)
- [ ] `KHOA-3` Add schema validation checks before store write (`PENDING`, prerequisite-first)
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
