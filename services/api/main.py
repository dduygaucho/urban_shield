"""FastAPI application entrypoint."""
import os
import asyncio
import subprocess
import sys
import threading
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from database import Base, engine, settings
from models import Incident  # noqa: F401 - register model
from routes import incidents

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

app = FastAPI(title="UrbanShield API", version="0.1.0")

_origins_env = settings.cors_origins.strip()
if _origins_env:
    _origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
else:
    _origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incidents.router)


@app.get("/health")
def health():
    return {"status": "ok"}


def _transport_route_geometries_path() -> Path:
    """Agent-F output on scratch by default; override with TRANSPORT_ROUTE_GEOJSON_PATH."""
    override = os.getenv("TRANSPORT_ROUTE_GEOJSON_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    return Path(
        "/scratch/s224714149/sidework/urban_shield/transport_gtfs/transport_route_geometries_vic.geojson"
    )


@app.get("/data/transport_route_geometries_vic.geojson")
def transport_route_geometries_geojson():
    """Serve VIC route LineStrings for the web map (large file; not in Next bundle)."""
    path = _transport_route_geometries_path()
    if not path.is_file():
        return Response(
            status_code=404,
            content="GeoJSON not found. Run Agent-F ingest or set TRANSPORT_ROUTE_GEOJSON_PATH.",
            media_type="text/plain",
        )
    return FileResponse(
        path,
        media_type="application/geo+json",
        filename="transport_route_geometries_vic.geojson",
    )


def _maybe_transport_ingest_on_startup() -> None:
    """Optional: refresh GTFS-derived route artifacts (see scripts/ingest/README_transport_gtfs_vic.md)."""
    flag = os.getenv("ENABLE_TRANSPORT_INGEST_ON_STARTUP", "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return
    root = Path(__file__).resolve().parents[2]
    script = root / "scripts" / "ingest" / "run_transport_ingest_vic.py"
    if not script.is_file():
        return

    def _run() -> None:
        subprocess.run(
            [sys.executable, str(script)],
            cwd=str(root),
            check=False,
        )

    threading.Thread(target=_run, daemon=True, name="transport-gtfs-ingest").start()


@app.on_event("startup")
async def on_startup():
    Base.metadata.create_all(bind=engine)
    from scripts.ingest.service import ingest_enabled, scheduled_ingest_loop

    if ingest_enabled():
        app.state.ingest_task = asyncio.create_task(scheduled_ingest_loop())


@app.on_event("shutdown")
async def on_shutdown():
    task = getattr(app.state, "ingest_task", None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    _maybe_transport_ingest_on_startup()
