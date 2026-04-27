"""FastAPI application entrypoint."""
import asyncio
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
