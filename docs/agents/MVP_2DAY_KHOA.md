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
- [x] `KHOA-1` Implement normalization from raw connector payload to canonical incident object (`DONE`, urgent unblocker for Duy)
- [x] `KHOA-2` Implement keyword-based duration classification proxy (`DONE`, prerequisite-first)
- [x] `KHOA-3` Add schema validation checks before store write (`DONE`, urgent unblocker for Duy)
- [x] `KHOA-4` Prepare classification dictionary and fallback behavior (`DONE`, can run parallel with `DUY-1`, `DUY-2`)

### Day 2 (Integration + Demo)
- [x] `KHOA-5` Validate Duy connector output compatibility (`DONE`)
- [x] `KHOA-6` Deliver stable incident snapshot output for routing team (`DONE`)
- [x] `KHOA-7` Tune classification examples for demo clarity (`DONE`)

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
- `KHOA-1` DONE | 2026-04-26T21:58:21+10:00 | `normalize_incident_payload()` accepts connector/API payload aliases and returns canonical `source/type/timestamp/lat/lng/duration_class/confidence`.
- `KHOA-2` DONE | 2026-04-26T21:58:21+10:00 | `classify_duration()` maps deterministic short/long keyword dictionaries with `short_term` fallback.
- `KHOA-3` DONE | 2026-04-26T21:58:21+10:00 | `validate_canonical_incident()` runs before API store write and checks required fields, allowed values, coordinate ranges, and confidence range.
- `KHOA-4` DONE | 2026-04-26T21:58:21+10:00 | Classification dictionaries added for incident type and duration with explicit fallback behavior.
- `KHOA-5` DONE | 2026-04-26T21:58:21+10:00 | Existing Duy script shape remains compatible through ORM defaults; normalized connector aliases support `source/provider`, `type/category/incident_type`, `timestamp/created_at/time`, `lat/latitude`, `lng/lon/longitude`.
- `KHOA-6` DONE | 2026-04-26T21:58:21+10:00 | API response and `CanonicalIncidentRecord` expose stable snapshot fields for routing/scoring teams while retaining map UI compatibility fields.
- `KHOA-7` DONE | 2026-04-26T21:58:21+10:00 | Demo keyword examples tuned for `ongoing/recurring/roadworks/closure/flooding` long-term and `now/today/active/fight/robbery/drunk/suspicious` short-term.

## Takeover Notes (required while task is IN_PROGRESS)

For each active task, keep this one-line log updated:
- `NEXT: <task-id> | files=<paths> | next_step=<one line> | risk=<one line>`
- `NEXT: none | files=none | next_step=handoff to Duy/Duc/Vishnu | risk=backend runtime not executed locally because Python/Conda are unavailable on PATH`

If Duy takes over:
- add `TAKEOVER: DUY | <task-id> | <timestamp>`

## Assumptions Log (required before implementation)

Record one line per assumption:
- `ASSUMPTION: <task-id> | <assumption> | <impact-if-wrong>`
- `ASSUMPTION: KHOA-1 | Raw connector payloads may use common aliases such as category/type, created_at/timestamp, latitude/lat, longitude/lng | If Duy emits different names, add aliases in normalize_incident_payload before DUY-6 signoff.`
- `ASSUMPTION: KHOA-2 | Unknown duration evidence should default to short_term for MVP safety and demo simplicity | If long-lived hazards dominate the feed, Duy/Vishnu may need a stricter unknown state later.`
- `ASSUMPTION: KHOA-3 | Existing map UI must remain compatible with category/description/created_at during this branch | If the UI switches fully to canonical fields, compatibility aliases can be removed in a later integration window.`
- `ASSUMPTION: KHOA-5 | Duy's current script may still construct Incident rows directly before it adopts normalization helpers | ORM defaults keep that path from failing, but direct rows should still be upgraded by Duy for full metadata fidelity.`

## Implementation Delta Log (required if implementation differs)

Record one line whenever delivered behavior differs from planned behavior:
- `DELTA: <task-id> | planned=<...> | actual=<...> | reason=<...> | downstream=<who/what>`
- `DELTA: KHOA-1 | planned=canonical incident only | actual=canonical fields plus legacy category/description/created_at compatibility | reason=current map UI still consumes legacy fields | downstream=Duc/Vishnu should use canonical fields; map can continue using legacy fields until integration.`
- `DELTA: KHOA-6 | planned=single IncidentRecord type with required canonical fields | actual=CanonicalIncidentRecord is strict; UI-facing IncidentRecord allows partial canonical fields for optimistic local markers | reason=map creates temporary records before server response | downstream=use CanonicalIncidentRecord for routing/scoring snapshots.`

## Conflict Scan Log (required before DONE)

Record one line per completed task:
- `CONFLICT_SCAN: <task-id> | files=<paths> | overlap=<none|possible> | interface=<ok|risk> | action=<none|follow-up>`
- `CONFLICT_SCAN: KHOA-1 | files=services/api/routes/incidents.py,libs/schemas/incident.ts | overlap=none | interface=ok | action=none`
- `CONFLICT_SCAN: KHOA-2 | files=services/api/routes/incidents.py | overlap=none | interface=ok | action=none`
- `CONFLICT_SCAN: KHOA-3 | files=services/api/routes/incidents.py,services/api/models.py | overlap=none | interface=ok | action=none`
- `CONFLICT_SCAN: KHOA-4 | files=services/api/routes/incidents.py | overlap=none | interface=ok | action=none`
- `CONFLICT_SCAN: KHOA-5 | files=services/api/routes/incidents.py,services/api/models.py | overlap=possible | interface=ok | action=Duy should adopt normalize_incident_payload for final DUY-3/DUY-6 writes`
- `CONFLICT_SCAN: KHOA-6 | files=libs/schemas/incident.ts,services/api/routes/incidents.py | overlap=none | interface=ok | action=none`
- `CONFLICT_SCAN: KHOA-7 | files=services/api/routes/incidents.py,docs/agents/MVP_2DAY_KHOA.md | overlap=none | interface=ok | action=none`
