# UrbanShield — feature registry & ownership

**Rule:** each developer edits only their files; merge via PR. Do **not** change the fixed `/incidents` API JSON shapes.

| Feature | Owner | Branch | Paths | Status |
|--------|-------|--------|-------|--------|
| Backend API + DB | Person 1 | `feature/backend-api` | `services/api/main.py`, `services/api/models.py`, `services/api/routes/incidents.py`, `services/api/database.py` | Done |
| Map UI | Person 2 | `feature/map-ui` | `apps/web/app/map/page.tsx`, `apps/web/app/map/mapColors.ts` | Done |
| Report UI | Person 3 | `feature/report-ui` | `apps/web/app/report/page.tsx` | Done |
| Integration + schemas + landing | Person 4 | `feature/integration` | `apps/web/lib/api.ts`, `apps/web/app/page.tsx`, `libs/schemas/incident.ts` | Done |
| Optional social ingest | Person 4 | `feature/integration` | `scripts/ingest_social.py` | Done |
| Docs & env templates | Team | `main` / docs PR | `README.md`, `FEATURE_REGISTRY.md`, `*.env.example`, `environment.yml` | Done |

## Checklist before merge

- [ ] API matches contract (`POST` / `GET` incidents)
- [ ] `.env` / `.env.local` not committed
- [ ] `npm run build` passes in `apps/web`
- [ ] Manual E2E: report → appears on map (same area + radius + time window)
