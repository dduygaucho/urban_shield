# UrbanShield

Safety navigation demo: **report incidents** and **view them on a map** (Next.js + FastAPI + SQLite).

## Repo layout

| Path | Owner (parallel work) |
|------|------------------------|
| `services/api/` | Backend (Person 1) |
| `apps/web/app/map/` | Map UI (Person 2) |
| `apps/web/app/report/` | Report UI (Person 3) |
| `apps/web/lib/`, `apps/web/app/page.tsx`, `libs/schemas/` | Integration (Person 4) |
| `scripts/ingest_social.py` | Optional ingestion (Person 4) |

See [FEATURE_REGISTRY.md](./FEATURE_REGISTRY.md) for branches and ownership detail.

**Multi-agent (Cursor):** use [docs/agents/README.md](./docs/agents/README.md) — Phase A runbook: [docs/agents/phase-a/HUMAN_ORCHESTRATION.md](./docs/agents/phase-a/HUMAN_ORCHESTRATION.md).

## Fixed API contract (do not change)

### `POST /incidents`

Request body:

```json
{
  "category": "crime | harassment | intoxication | suspicious | violence",
  "description": "string",
  "lat": 0,
  "lng": 0
}
```

### `GET /incidents`

Query parameters:

- `lat` — center latitude  
- `lng` — center longitude  
- `radius` — meters  
- `hours` — time window (only incidents newer than `now - hours`)

Response: JSON array of:

```json
{
  "id": "uuid",
  "category": "crime",
  "description": "text",
  "lat": 0,
  "lng": 0,
  "created_at": "2025-01-01T00:00:00Z"
}
```

## Secrets / environment (unified for collaborators)

**Never commit real API keys.** Only commit `*.example` files.

1. **Backend** — copy template and edit locally:

   ```bash
   cp services/api/.env.example services/api/.env
   ```

   Optional: set `CORS_ORIGINS=http://localhost:3000` (comma-separated list). Leave unset for permissive local dev (`*`).

2. **Frontend** — copy template and edit locally:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_MAPBOX_TOKEN`.

`.gitignore` excludes `.env`, `.env.local`, and `apps/web/.env*local` so keys stay off Git.

## Python environment (Conda, reproducible)

On this server, load Anaconda then create/update the env from the repo root:

```bash
module load Anaconda3
conda activate base   # if needed
conda env create -f environment.yml    # first time: creates `urban_shield`
# or, after dependency bumps:
conda env update -f environment.yml

conda activate urban_shield
```

`environment.yml` installs packages from `services/api/requirements.txt` via `pip`.

After activation, the env typically resolves to a path like `~/.conda/envs/urban_shield` (exact path depends on your Conda installation).

### Run API

```bash
cd services/api
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `GET http://localhost:8000/health`

## Frontend (Node)

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional: Reddit ingestion

Requires the same DB as the API (see `services/api/.env`). From **repo root**:

```bash
module load Anaconda3
conda activate urban_shield
PYTHONPATH=services/api python scripts/ingest_social.py
```

Most posts **will not** include coordinates — the script only inserts rows when it finds a naive `(lat, lng)` pattern in text (demo-only).

## Demo flow

1. Start API (`uvicorn`) and web (`npm run dev`).
2. Open **Report**, allow geolocation, submit an incident.
3. Open **Map**, allow geolocation, use **Refresh** — marker should appear within your search radius/time window.

## License

MIT (or replace with your team’s choice).
