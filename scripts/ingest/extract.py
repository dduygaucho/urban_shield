"""Shared extraction, scoring, and matching logic for crawled incidents."""
from __future__ import annotations

import hashlib
import html
import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

_ROOT = Path(__file__).resolve().parents[2]
_API = _ROOT / "services" / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from routes.incidents import classify_duration, classify_incident_type, normalize_incident_payload  # noqa: E402

from .llm_verifier import verify_candidate_with_llm

SourceCategory = Literal["news", "social"]

MIN_STANDALONE_CONFIDENCE = 0.40
VERIFIED_CONFIDENCE = 0.75
MATCH_RADIUS_M = 500.0

SPORTS_CONTEXT_TERMS = {
    "afl",
    "a-league",
    "basketball",
    "blues",
    "coach",
    "club",
    "derby",
    "dockers",
    "draft",
    "fc",
    "fixture",
    "footy",
    "freo",
    "fremantle",
    "game",
    "goal",
    "league",
    "match",
    "player",
    "premiership",
    "quarter",
    "rd",
    "review",
    "round",
    "score",
    "season",
    "smurf",
    "stadium",
    "team",
    "vs",
}

PUBLIC_SAFETY_TERMS = {
    "arrest",
    "assault",
    "attack",
    "break-in",
    "burglary",
    "crime",
    "emergency",
    "harass",
    "incident",
    "intoxicated",
    "police",
    "robbery",
    "stolen",
    "suspicious",
    "theft",
    "threat",
    "unsafe",
    "victim",
    "violence",
    "weapon",
}


@dataclass(frozen=True)
class RawSourceItem:
    source_category: SourceCategory
    source_name: str
    title: str
    text: str
    url: str
    published_at: datetime | None = None


@dataclass(frozen=True)
class IncidentCandidate:
    source_category: SourceCategory
    source_name: str
    source_url: str
    source_fingerprint: str
    type: str
    timestamp: datetime
    lat: float
    lng: float
    duration_class: str
    confidence: float
    verification_status: str
    verification_reason: str
    title: str
    description: str
    place_name: str
    evidence_source: str


def clean_text(value: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(no_tags)).strip()


def normalized_hash(*parts: str) -> str:
    text = " ".join(clean_text(part).lower() for part in parts if part)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9-]+", value.lower()) if token}


def is_blocked_context(item: RawSourceItem, full_text: str) -> bool:
    text_tokens = _tokens(full_text)
    source_tokens = _tokens(item.source_name)
    sports_hits = text_tokens & SPORTS_CONTEXT_TERMS
    if not sports_hits:
        return False
    if source_tokens & SPORTS_CONTEXT_TERMS:
        return True
    safety_hits = text_tokens & PUBLIC_SAFETY_TERMS
    return len(sports_hits) >= 2 and len(safety_hits) <= 1


def evidence_sources_to_set(value: str | None) -> set[str]:
    if not value:
        return set()
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {v.strip() for v in value.split(",") if v.strip()}
    if isinstance(parsed, list):
        return {str(v) for v in parsed if str(v).strip()}
    return set()


def evidence_sources_to_text(values: set[str]) -> str:
    return json.dumps(sorted(values), separators=(",", ":"))


def _status_for(confidence: float) -> str:
    return "verified" if confidence >= VERIFIED_CONFIDENCE else "needs_review"


def _score(item: RawSourceItem, has_place: bool, matched_type: bool) -> tuple[float, list[str]]:
    score = 0.25 if item.source_category == "social" else 0.35
    reasons = [f"source={item.source_category}"]
    if matched_type:
        score += 0.25
        reasons.append("incident_keyword")
    if has_place:
        score += 0.25
        reasons.append("known_place")
    if item.url:
        score += 0.10
        reasons.append("source_url")
    if item.published_at:
        score += 0.05
        reasons.append("timestamp")
    return min(score, 0.95), reasons


def candidate_from_item(item: RawSourceItem, place_lookup) -> IncidentCandidate | None:
    title = clean_text(item.title)
    body = clean_text(item.text)
    full_text = f"{title} {body}".strip()
    if is_blocked_context(item, full_text):
        return None
    incident_type = classify_incident_type(full_text)
    place = place_lookup(full_text)
    if not incident_type or not place:
        return None

    place_name, lat, lng = place
    confidence, reasons = _score(item, has_place=True, matched_type=True)
    if confidence < MIN_STANDALONE_CONFIDENCE:
        return None

    timestamp = item.published_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    duration_class = classify_duration(full_text)
    llm_decision = verify_candidate_with_llm(
        source_category=item.source_category,
        source_name=item.source_name,
        title=title,
        text=body,
        matched_place=place_name,
        local_type=incident_type,
        local_duration=duration_class,
        local_confidence=confidence,
    )
    if llm_decision is not None:
        if not llm_decision.is_incident:
            return None
        incident_type = llm_decision.incident_type or incident_type
        duration_class = llm_decision.duration_class or duration_class
        confidence = max(confidence, llm_decision.confidence)
        reasons.append(f"llm={llm_decision.reason}")

    payload = normalize_incident_payload(
        {
            "source": item.source_name,
            "type": incident_type,
            "timestamp": timestamp,
            "lat": lat,
            "lng": lng,
            "duration_class": duration_class,
            "confidence": confidence,
            "description": full_text,
        }
    )
    fingerprint = normalized_hash(item.url or "", item.source_name, title)
    evidence_source = f"{item.source_category}:{item.source_name}"
    return IncidentCandidate(
        source_category=item.source_category,
        source_name=item.source_name,
        source_url=item.url,
        source_fingerprint=fingerprint,
        type=payload["type"],
        timestamp=payload["timestamp"],
        lat=payload["lat"],
        lng=payload["lng"],
        duration_class=payload["duration_class"],
        confidence=payload["confidence"] or confidence,
        verification_status=_status_for(confidence),
        verification_reason=";".join(reasons + [f"place={place_name}"]),
        title=title,
        description=full_text[:2000],
        place_name=place_name,
        evidence_source=evidence_source,
    )


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(min(1, math.sqrt(a)))


def text_similarity(a: str, b: str) -> float:
    a_tokens = {t for t in re.split(r"[^a-z0-9]+", a.lower()) if len(t) > 3}
    b_tokens = {t for t in re.split(r"[^a-z0-9]+", b.lower()) if len(t) > 3}
    if not a_tokens or not b_tokens:
        return 0.0
    return len(a_tokens & b_tokens) / len(a_tokens | b_tokens)


def candidate_matches_incident(candidate: IncidentCandidate, incident: Any) -> bool:
    if getattr(incident, "type", None) != candidate.type:
        return False
    if haversine_m(candidate.lat, candidate.lng, incident.lat, incident.lng) > MATCH_RADIUS_M:
        return False
    window_hours = 168 if candidate.duration_class == "long_term" else 24
    existing_ts = getattr(incident, "timestamp", None) or getattr(incident, "created_at", None)
    if existing_ts and existing_ts.tzinfo is None:
        existing_ts = existing_ts.replace(tzinfo=timezone.utc)
    if existing_ts and abs((candidate.timestamp - existing_ts).total_seconds()) > window_hours * 3600:
        return False
    if candidate.place_name and candidate.place_name in (incident.description or "").lower():
        return True
    return text_similarity(candidate.description, incident.description or "") >= 0.18


def strengthened_confidence(current: float | None, candidate: IncidentCandidate) -> float:
    base = current if current is not None else 0.0
    boost = 0.18 if candidate.source_category == "news" else 0.12
    return min(0.95, max(base, candidate.confidence) + boost)
