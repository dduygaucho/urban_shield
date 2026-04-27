# UrbanShield

Safety navigation demo: **report incidents** and **view them on a map** (Next.js + FastAPI + SQLite).

## Repo layout

| Path | Owner (parallel work) |
|------|------------------------|
| `services/api/` | Backend (Person 1) |
| `apps/web/app/map/` | Map UI (Person 2) |
| `apps/web/app/report/` | Report redirect / help (Person 3); reporting UX lives on `/map` |
| `apps/web/lib/`, `apps/web/app/page.tsx`, `libs/schemas/` | Integration (Person 4) |
| `scripts/ingest/`, `scripts/ingest_social.py` | News/social incident crawling (Person 4) |
| `scripts/ingest/README_transport_gtfs_vic.md` | Victoria GTFS schedule ingest (scratch disk + normalized route index) |

**News/social incident crawling:** scheduled RSS + Reddit ingestion is documented in [docs/CRAWLING_INGESTION.md](./docs/CRAWLING_INGESTION.md). It extracts likely incidents, scores confidence, and strengthens incidents when independent sources corroborate the same event.

**Victoria public transport (GTFS):** large `gtfs_schedule.zip` downloads must live on scratch, not in git. Default path and full runbook: [scripts/ingest/README_transport_gtfs_vic.md](./scripts/ingest/README_transport_gtfs_vic.md). Quick start after clone:

```bash
mkdir -p /scratch/s224714149/sidework/urban_shield/transport_gtfs
PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
```

See [FEATURE_REGISTRY.md](./FEATURE_REGISTRY.md) for branches and ownership detail.

**Collaborator handoff (status + per-role next tasks + roadmap):** [instruction.md](./instruction.md).

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

   Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_MAPBOX_TOKEN`. The Mapbox value must be a **public** token (`pk.…`), not a secret token (`sk.…`); see [Mapbox token docs](https://docs.mapbox.com/accounts/guides/access-tokens/).

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

The web app depends on **`mapbox-gl`** and **`@mapbox/mapbox-gl-geocoder`** (place search in the map report sheet). Both are listed in `apps/web/package.json`.

Open [http://localhost:3000](http://localhost:3000).

## Optional: News / Social Crawling

Requires the same DB as the API and reads crawler config from `services/api/.env`.

Scheduled mode:

```bash
cd services/api
# set INGEST_ENABLED=true in .env first
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Manual one-shot mode from **repo root**:

```bash
module load Anaconda3
conda activate urban_shield
PYTHONPATH=services/api python scripts/ingest_social.py
```

Full crawler behavior, env vars, confidence scoring, corroboration rules, and tests are in [docs/CRAWLING_INGESTION.md](./docs/CRAWLING_INGESTION.md).

## Demo flow

1. Start API (`uvicorn`) and web (`npm run dev`).
2. Open **`/map`**, allow geolocation when prompted.
3. Tap **➕ Report** (bottom-right). In the bottom sheet pick a category (and optional details), then **Report incident**.
4. You should see a success toast and a new marker on the map (optimistic update). **Refresh** reloads incidents from the API within the current map center and time/radius window.

The **`/report`** route only redirects to the map with a short help message (reporting is map-first).

## License

MIT (or replace with your team’s choice).
