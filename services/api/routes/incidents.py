"""Incidents API - normalization, classification, and fixed incident contract."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Mapping

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from database import get_db
from models import Incident

router = APIRouter(prefix="/incidents", tags=["incidents"])

IncidentType = Literal["crime", "harassment", "intoxication", "suspicious", "violence"]
DurationClass = Literal["short_term", "long_term"]
# Transport-linked incidents only: matches GTFS-normalized route modes (VIC pipeline).
TransportRouteType = Literal["bus", "train", "tram"]
_TRANS_MODES: frozenset[str] = frozenset({"bus", "train", "tram"})

DEFAULT_SOURCE = "user_report"
DEFAULT_DURATION_CLASS: DurationClass = "short_term"
DESCRIPTION_FALLBACK = "Reported from UrbanShield"

TYPE_KEYWORDS: dict[IncidentType, tuple[str, ...]] = {
    "crime": ("crime", "robbery", "theft", "stolen", "break-in", "burglary"),
    "harassment": ("harassment", "harassed", "abuse", "threat", "catcall"),
    "intoxication": ("intoxication", "intoxicated", "drunk", "alcohol", "drug"),
    "suspicious": ("suspicious", "loitering", "unsafe", "hazard", "concern"),
    "violence": ("violence", "violent", "fight", "assault", "attack", "weapon"),
}

DURATION_KEYWORDS: dict[DurationClass, tuple[str, ...]] = {
    "long_term": (
        "ongoing",
        "recurring",
        "repeated",
        "daily",
        "weekly",
        "weeks",
        "months",
        "construction",
        "roadworks",
        "closure",
        "flooding",
        "outage",
    ),
    "short_term": (
        "now",
        "today",
        "tonight",
        "active",
        "currently",
        "just",
        "fight",
        "attack",
        "robbery",
        "drunk",
        "suspicious",
    ),
}

LEGACY_TO_CANONICAL_COLUMNS = {
    "source": ("VARCHAR(64)", "'user_report'"),
    "type": ("VARCHAR(32)", "category"),
    "timestamp": ("DATETIME", "created_at"),
    "duration_class": ("VARCHAR(16)", "'short_term'"),
    "confidence": ("FLOAT", "NULL"),
    "source_category": ("VARCHAR(32)", "NULL"),
    "source_url": ("TEXT", "NULL"),
    "source_fingerprint": ("VARCHAR(128)", "NULL"),
    "verification_status": ("VARCHAR(32)", "NULL"),
    "verification_reason": ("TEXT", "NULL"),
    "evidence_count": ("INTEGER", "1"),
    "evidence_sources": ("TEXT", "NULL"),
    # Optional transport metadata (nullable for legacy point-only rows).
    "route_type": ("VARCHAR(64)", "NULL"),
    "route_external_id": ("VARCHAR(128)", "NULL"),
    "route_label": ("VARCHAR(256)", "NULL"),
    "geometry_ref": ("VARCHAR(256)", "NULL"),
}


class IncidentCreate(BaseModel):
    source: str | None = None
    type: IncidentType | None = None
    timestamp: datetime | None = None
    duration_class: DurationClass | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)

    # Existing map UI still sends category/description.
    category: IncidentType | None = None
    description: str | None = None
    lat: float
    lng: float

    # Optional transport route metadata (additive; point reports omit all of these).
    # route_type: only bus | train | tram when present; omitted for point-only reports.
    route_type: TransportRouteType | None = None
    route_external_id: str | None = None
    route_label: str | None = None
    geometry_ref: str | None = None

    @field_validator("route_type", mode="before")
    @classmethod
    def _normalize_create_route_type(cls, v: Any) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in _TRANS_MODES:
            raise ValueError("route_type must be one of: bus, train, tram")
        return s

    @model_validator(mode="after")
    def validate_incident_type(self) -> "IncidentCreate":
        if not self.type and not self.category:
            inferred = classify_incident_type(self.description or "")
            if not inferred:
                raise ValueError("Either type or category is required")
            self.type = inferred
        return self


class IncidentOut(BaseModel):
    id: str
    source: str
    type: str
    timestamp: datetime
    duration_class: DurationClass
    confidence: float | None = None
    source_category: str | None = None
    source_url: str | None = None
    verification_status: str | None = None
    verification_reason: str | None = None
    evidence_count: int = 1
    evidence_sources: str | None = None

    # Compatibility fields for current map UI consumers.
    category: str
    description: str
    lat: float
    lng: float
    created_at: datetime

    route_type: TransportRouteType | None = None
    route_external_id: str | None = None
    route_label: str | None = None
    geometry_ref: str | None = None

    @field_validator("route_type", mode="before")
    @classmethod
    def _lenient_out_route_type(cls, v: Any) -> str | None:
        """Legacy DB may contain unexpected strings; do not break GET for bad rows."""
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s in _TRANS_MODES:
            return s
        return None

    model_config = {"from_attributes": True}


def classify_incident_type(text_value: str) -> IncidentType | None:
    text_lower = text_value.lower()
    for incident_type, keywords in TYPE_KEYWORDS.items():
        if any(keyword in text_lower for keyword in keywords):
            return incident_type
    return None


def classify_duration(text_value: str) -> DurationClass:
    text_lower = text_value.lower()
    for duration_class, keywords in DURATION_KEYWORDS.items():
        if any(keyword in text_lower for keyword in keywords):
            return duration_class
    return DEFAULT_DURATION_CLASS


def _coerce_datetime(value: Any) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return datetime.now(timezone.utc)
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        parsed = datetime.fromisoformat(raw)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    raise ValueError("timestamp must be an ISO datetime, epoch value, or datetime object")


def _first_present(payload: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = payload.get(key)
        if value is not None and value != "":
            return value
    return None


def _optional_str(payload: Mapping[str, Any], *keys: str) -> str | None:
    value = _first_present(payload, *keys)
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _optional_transport_route_type(payload: Mapping[str, Any]) -> TransportRouteType | None:
    """Parse optional route_type; reject invalid values (additive: omitted/empty = None)."""
    s = _optional_str(payload, "route_type")
    if s is None:
        return None
    key = s.lower()
    if key not in _TRANS_MODES:
        raise ValueError("route_type must be one of: bus, train, tram")
    return key  # type: ignore[return-value]


def normalize_incident_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize connector/API input into the canonical incident shape."""
    description = str(_first_present(payload, "description", "text", "title", "summary") or "").strip()
    incident_type = _first_present(payload, "type", "category", "incident_type")
    if not incident_type:
        incident_type = classify_incident_type(description)
    if incident_type not in TYPE_KEYWORDS:
        raise ValueError("type must be one of: crime, harassment, intoxication, suspicious, violence")

    lat = _first_present(payload, "lat", "latitude")
    lng = _first_present(payload, "lng", "lon", "longitude")
    if lat is None or lng is None:
        raise ValueError("lat and lng are required")

    duration_class = _first_present(payload, "duration_class", "duration")
    if duration_class not in DURATION_KEYWORDS:
        duration_class = classify_duration(description)

    source = str(_first_present(payload, "source", "provider") or DEFAULT_SOURCE).strip() or DEFAULT_SOURCE
    timestamp = _coerce_datetime(_first_present(payload, "timestamp", "created_at", "time"))
    confidence = _first_present(payload, "confidence", "score")
    confidence_value = None if confidence is None else float(confidence)
    if confidence_value is not None and not 0 <= confidence_value <= 1:
        raise ValueError("confidence must be between 0 and 1")

    canonical = {
        "source": source,
        "type": incident_type,
        "timestamp": timestamp,
        "lat": float(lat),
        "lng": float(lng),
        "duration_class": duration_class,
        "confidence": confidence_value,
        "route_type": _optional_transport_route_type(payload),
        "route_external_id": _optional_str(payload, "route_external_id"),
        "route_label": _optional_str(payload, "route_label"),
        "geometry_ref": _optional_str(payload, "geometry_ref"),
    }
    validate_canonical_incident(canonical)
    return canonical


def validate_canonical_incident(incident: Mapping[str, Any]) -> None:
    required = ("source", "type", "timestamp", "lat", "lng", "duration_class")
    missing = [field for field in required if incident.get(field) is None or incident.get(field) == ""]
    if missing:
        raise ValueError(f"Missing required incident fields: {', '.join(missing)}")
    if incident["type"] not in TYPE_KEYWORDS:
        raise ValueError("Invalid incident type")
    if incident["duration_class"] not in DURATION_KEYWORDS:
        raise ValueError("Invalid duration_class")
    lat = float(incident["lat"])
    lng = float(incident["lng"])
    if not -90 <= lat <= 90:
        raise ValueError("lat must be between -90 and 90")
    if not -180 <= lng <= 180:
        raise ValueError("lng must be between -180 and 180")


def _ensure_incident_columns(db: Session) -> None:
    """Add canonical columns for local SQLite DBs created before this contract."""
    if db.bind is None or db.bind.dialect.name != "sqlite":
        return
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(incidents)")).all()}
    for column, (column_type, fallback_sql) in LEGACY_TO_CANONICAL_COLUMNS.items():
        if column in columns:
            continue
        db.execute(text(f"ALTER TABLE incidents ADD COLUMN {column} {column_type}"))
        db.execute(text(f"UPDATE incidents SET {column} = {fallback_sql} WHERE {column} IS NULL"))
    db.commit()


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlamb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlamb / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(a)))


@router.post("", response_model=IncidentOut)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)):
    _ensure_incident_columns(db)
    raw = payload.model_dump()
    raw["type"] = raw.get("type") or raw.get("category")
    raw["description"] = (raw.get("description") or DESCRIPTION_FALLBACK).strip()
    canonical = normalize_incident_payload(raw)
    row = Incident(
        id=str(uuid.uuid4()),
        source=canonical["source"],
        type=canonical["type"],
        timestamp=canonical["timestamp"],
        duration_class=canonical["duration_class"],
        confidence=canonical["confidence"],
        category=canonical["type"],
        description=raw["description"],
        lat=canonical["lat"],
        lng=canonical["lng"],
        created_at=canonical["timestamp"],
        route_type=canonical.get("route_type"),
        route_external_id=canonical.get("route_external_id"),
        route_label=canonical.get("route_label"),
        geometry_ref=canonical.get("geometry_ref"),
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
    _ensure_incident_columns(db)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    stmt = select(Incident).where(Incident.timestamp >= cutoff).order_by(Incident.timestamp.desc())
    rows = list(db.scalars(stmt).all())
    out: list[Incident] = []
    for row in rows:
        if _haversine_m(lat, lng, row.lat, row.lng) <= radius:
            out.append(row)
    return out
