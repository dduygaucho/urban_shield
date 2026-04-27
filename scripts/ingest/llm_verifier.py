"""Optional online LLM verification for crawled incident candidates."""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

_ROOT = Path(__file__).resolve().parents[2]
_API = _ROOT / "services" / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from database import settings  # noqa: E402

ALLOWED_TYPES = {"crime", "harassment", "intoxication", "suspicious", "violence"}
ALLOWED_DURATIONS = {"short_term", "long_term"}


@dataclass(frozen=True)
class LlmDecision:
    is_incident: bool
    incident_type: str | None
    duration_class: str | None
    confidence: float
    reason: str


def verifier_enabled() -> bool:
    return (
        settings.llm_verifier_enabled
        and bool(settings.llm_api_url.strip())
        and bool(settings.llm_api_key.strip())
        and bool(settings.llm_model.strip())
    )


def _json_from_content(content: str) -> dict[str, Any] | None:
    raw = content.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _decision_from_payload(payload: dict[str, Any]) -> LlmDecision | None:
    is_incident = bool(payload.get("is_incident"))
    incident_type = payload.get("incident_type")
    duration_class = payload.get("duration_class")
    try:
        confidence = float(payload.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None
    reason = str(payload.get("reason") or "llm_verifier").strip()[:500]
    if incident_type not in ALLOWED_TYPES:
        incident_type = None
    if duration_class not in ALLOWED_DURATIONS:
        duration_class = None
    return LlmDecision(
        is_incident=is_incident,
        incident_type=incident_type,
        duration_class=duration_class,
        confidence=max(0.0, min(1.0, confidence)),
        reason=reason,
    )


def _parse_chat_completion_response(data: dict[str, Any]) -> LlmDecision | None:
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    parsed = _json_from_content(str(content))
    if parsed is None:
        return None
    return _decision_from_payload(parsed)


def _apply_min_confidence(decision: LlmDecision) -> LlmDecision:
    if not decision.is_incident or decision.confidence >= settings.llm_min_confidence:
        return decision
    return LlmDecision(
        is_incident=False,
        incident_type=decision.incident_type,
        duration_class=decision.duration_class,
        confidence=decision.confidence,
        reason=f"llm_confidence_below_threshold:{decision.reason}",
    )


def verify_candidate_with_llm(
    *,
    source_category: str,
    source_name: str,
    title: str,
    text: str,
    matched_place: str,
    local_type: str,
    local_duration: str,
    local_confidence: float,
) -> LlmDecision | None:
    """Return an LLM decision, or None when verifier is disabled/unavailable."""
    if not verifier_enabled():
        return None

    prompt = {
        "source_category": source_category,
        "source_name": source_name,
        "title": title[:300],
        "text": text[:1200],
        "matched_place": matched_place,
        "local_type": local_type,
        "local_duration": local_duration,
        "local_confidence": round(local_confidence, 3),
    }
    messages = [
        {
            "role": "system",
            "content": (
                "You verify whether crawled news/social content describes a real public-safety "
                "incident relevant to a map. Reject sports match reviews, team discussions, jokes, "
                "politics without a concrete safety incident, and unrelated uses of place names. "
                "Return JSON only."
            ),
        },
        {
            "role": "user",
            "content": (
                "Classify this candidate. Return exactly: "
                '{"is_incident": boolean, "incident_type": "crime|harassment|intoxication|suspicious|violence|null", '
                '"duration_class": "short_term|long_term|null", "confidence": number, "reason": string}\n\n'
                f"{json.dumps(prompt, ensure_ascii=False)}"
            ),
        },
    ]
    try:
        response = httpx.post(
            settings.llm_api_url,
            headers={
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "messages": messages,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=settings.llm_timeout_seconds,
        )
        response.raise_for_status()
        decision = _parse_chat_completion_response(response.json())
        return _apply_min_confidence(decision) if decision is not None else None
    except Exception:
        return None
