"""Incidents API — fixed contract (do not change request/response shapes)."""
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Incident

router = APIRouter(prefix="/incidents", tags=["incidents"])

IncidentCategory = Literal["crime", "harassment", "intoxication", "suspicious", "violence"]


class IncidentCreate(BaseModel):
    category: IncidentCategory
    description: str = Field(..., min_length=1)
    lat: float
    lng: float


class IncidentOut(BaseModel):
    id: str
    category: str
    description: str
    lat: float
    lng: float
    created_at: datetime

    model_config = {"from_attributes": True}


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlamb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlamb / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(a)))


@router.post("", response_model=IncidentOut)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    row = Incident(
        id=str(uuid.uuid4()),
        category=payload.category,
        description=payload.description,
        lat=payload.lat,
        lng=payload.lng,
        created_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=list[IncidentOut])
def list_incidents(
    lat: float = Query(..., description="Center latitude"),
    lng: float = Query(..., description="Center longitude"),
    radius: float = Query(..., gt=0, description="Radius in meters"),
    hours: float = Query(..., gt=0, description="Time window in hours"),
    db: Session = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    stmt = select(Incident).where(Incident.created_at >= cutoff).order_by(Incident.created_at.desc())
    rows = list(db.scalars(stmt).all())
    out: list[Incident] = []
    for row in rows:
        if _haversine_m(lat, lng, row.lat, row.lng) <= radius:
            out.append(row)
    return out
