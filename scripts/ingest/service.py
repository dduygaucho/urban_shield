"""Scheduled news/social crawling service."""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

_ROOT = Path(__file__).resolve().parents[2]
_API = _ROOT / "services" / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from database import Base, SessionLocal, engine, settings  # noqa: E402
from models import Incident  # noqa: E402
from routes.incidents import _ensure_incident_columns  # noqa: E402

from .connectors import fetch_reddit_items, fetch_rss_items
from .extract import (
    MIN_STANDALONE_CONFIDENCE,
    IncidentCandidate,
    candidate_from_item,
    candidate_matches_incident,
    evidence_sources_to_set,
    evidence_sources_to_text,
    strengthened_confidence,
)
from .places import lookup_place

DEFAULT_REDDIT_QUERIES = ["melbourne fight", "melbourne robbery", "geelong suspicious", "melbourne attack"]
DEFAULT_RSS_FEEDS: list[str] = []
USER_AGENT = "UrbanShieldIngest/0.2 (class project; scheduled news/social crawler)"


@dataclass
class IngestResult:
    fetched: int = 0
    candidates: int = 0
    inserted: int = 0
    strengthened: int = 0
    skipped: int = 0
    errors: int = 0


def _split_env(name: str, default: list[str]) -> list[str]:
    raw = getattr(settings, name.lower(), "").strip()
    if not raw:
        return default
    return [part.strip() for part in raw.split(",") if part.strip()]


def ingest_enabled() -> bool:
    return settings.ingest_enabled


def ingest_interval_seconds() -> int:
    return max(60, settings.ingest_interval_seconds)


def _find_exact_source(db: Session, candidate: IncidentCandidate) -> Incident | None:
    stmt = select(Incident).where(Incident.source_fingerprint == candidate.source_fingerprint)
    return db.scalars(stmt).first()


def _find_matching_incident(db: Session, candidate: IncidentCandidate) -> Incident | None:
    stmt = select(Incident).where(Incident.type == candidate.type).order_by(Incident.timestamp.desc()).limit(100)
    for incident in db.scalars(stmt).all():
        if candidate_matches_incident(candidate, incident):
            return incident
    return None


def _insert_candidate(db: Session, candidate: IncidentCandidate) -> None:
    evidence_sources = evidence_sources_to_text({candidate.evidence_source})
    row = Incident(
        id=str(uuid.uuid4()),
        source=candidate.source_name,
        type=candidate.type,
        timestamp=candidate.timestamp,
        duration_class=candidate.duration_class,
        confidence=candidate.confidence,
        source_category=candidate.source_category,
        source_url=candidate.source_url,
        source_fingerprint=candidate.source_fingerprint,
        verification_status=candidate.verification_status,
        verification_reason=candidate.verification_reason,
        evidence_count=1,
        evidence_sources=evidence_sources,
        category=candidate.type,
        description=candidate.description,
        lat=candidate.lat,
        lng=candidate.lng,
        created_at=candidate.timestamp,
    )
    db.add(row)


def _strengthen_incident(incident: Incident, candidate: IncidentCandidate) -> bool:
    sources = evidence_sources_to_set(incident.evidence_sources)
    if candidate.evidence_source in sources:
        return False
    sources.add(candidate.evidence_source)
    incident.evidence_sources = evidence_sources_to_text(sources)
    incident.evidence_count = max(incident.evidence_count or 1, len(sources))
    incident.confidence = strengthened_confidence(incident.confidence, candidate)
    incident.verification_status = "verified" if (incident.confidence or 0) >= 0.75 else "needs_review"
    reason_parts = [incident.verification_reason or "initial_evidence", f"corroborated_by={candidate.evidence_source}"]
    incident.verification_reason = ";".join(reason_parts)[-2000:]
    if not incident.source_url and candidate.source_url:
        incident.source_url = candidate.source_url
    return True


def store_candidate(db: Session, candidate: IncidentCandidate) -> str:
    if _find_exact_source(db, candidate):
        return "skipped"
    match = _find_matching_incident(db, candidate)
    if match is not None:
        return "strengthened" if _strengthen_incident(match, candidate) else "skipped"
    if candidate.confidence < MIN_STANDALONE_CONFIDENCE:
        return "skipped"
    _insert_candidate(db, candidate)
    return "inserted"


def run_ingest_once() -> IngestResult:
    result = IngestResult()
    Base.metadata.create_all(bind=engine)
    feeds = _split_env("INGEST_RSS_FEEDS", DEFAULT_RSS_FEEDS)
    reddit_queries = _split_env("INGEST_REDDIT_QUERIES", DEFAULT_REDDIT_QUERIES)
    with httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "application/json, application/rss+xml, */*"}) as client:
        raw_items = []
        try:
            raw_items.extend(fetch_rss_items(client, feeds))
        except Exception:
            result.errors += 1
        try:
            raw_items.extend(fetch_reddit_items(client, reddit_queries))
        except Exception:
            result.errors += 1
        result.fetched = len(raw_items)

    db = SessionLocal()
    try:
        _ensure_incident_columns(db)
        for item in raw_items:
            candidate = candidate_from_item(item, lookup_place)
            if candidate is None:
                result.skipped += 1
                continue
            result.candidates += 1
            outcome = store_candidate(db, candidate)
            if outcome == "inserted":
                result.inserted += 1
            elif outcome == "strengthened":
                result.strengthened += 1
            else:
                result.skipped += 1
        db.commit()
    except Exception:
        db.rollback()
        result.errors += 1
        raise
    finally:
        db.close()
    return result


async def scheduled_ingest_loop() -> None:
    while True:
        try:
            result = await asyncio.to_thread(run_ingest_once)
            print(f"UrbanShield ingest: {json.dumps(result.__dict__, sort_keys=True)}")
        except Exception as exc:
            print(f"UrbanShield ingest failed: {exc}")
        await asyncio.sleep(ingest_interval_seconds())
