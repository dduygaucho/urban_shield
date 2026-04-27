"""SQLAlchemy ORM models for incidents."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def _default_incident_type(context):
    return context.get_current_parameters().get("category") or "suspicious"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="user_report")
    type: Mapped[str] = mapped_column(String(32), nullable=False, default=_default_incident_type)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    duration_class: Mapped[str] = mapped_column(String(16), nullable=False, default="short_term")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verification_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    verification_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    evidence_sources: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Compatibility fields retained for the existing map UI and fixed demo API.
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Optional transport route linkage (point incidents omit these).
    # API contract restricts route_type to bus|train|tram when set; column remains plain string.
    route_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    route_external_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    route_label: Mapped[str | None] = mapped_column(String(256), nullable=True)
    geometry_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
