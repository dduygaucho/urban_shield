#!/usr/bin/env python3
"""
Optional Reddit keyword ingestion (Person 4 ONLY).

- Uses Reddit's public JSON endpoints with a descriptive User-Agent (required).
- Keyword match only; no ML.
- Skips posts without a usable approximate location (this minimal version does not geocode).

Run from repo root (after conda activate + API .env in place):

  PYTHONPATH=services/api python scripts/ingest_social.py

Requires same SQLite DB as the API (see services/api/.env DATABASE_URL).
"""
from __future__ import annotations

import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Resolve imports as services/api package
_ROOT = Path(__file__).resolve().parent.parent
_API = _ROOT / "services" / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from database import SessionLocal  # noqa: E402
from models import Incident  # noqa: E402

KEYWORDS = ["fight", "robbery", "drunk", "suspicious", "attack"]
REDDIT_SEARCH = "https://www.reddit.com/search.json"

# Map matched keyword flavor to API category enum
KEYWORD_TO_CATEGORY = {
    "fight": "violence",
    "attack": "violence",
    "robbery": "crime",
    "drunk": "intoxication",
    "suspicious": "suspicious",
}


def pick_category(text: str) -> str | None:
    low = text.lower()
    for kw in KEYWORDS:
        if kw in low:
            return KEYWORD_TO_CATEGORY.get(kw) or "suspicious"
    return None


def extract_lat_lng(text: str) -> tuple[float, float] | None:
    """
    Very naive: match patterns like (37.77, -122.42) or 37.77,-122.42 in post body.
    Most Reddit posts won't have coordinates — those are skipped.
    """
    patterns = [
        r"\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)",
        r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if not m:
            continue
        a, b = float(m.group(1)), float(m.group(2))
        # Heuristic: lat in [-90,90], lng in [-180,180]; try both orderings
        if -90 <= a <= 90 and -180 <= b <= 180:
            return a, b
        if -90 <= b <= 90 and -180 <= a <= 180:
            return b, a
    return None


def fetch_posts(client: httpx.Client, query: str, limit: int = 25) -> list[dict]:
    r = client.get(
        REDDIT_SEARCH,
        params={"q": query, "sort": "new", "limit": limit, "restrict_sr": "false"},
        timeout=30.0,
    )
    r.raise_for_status()
    data = r.json()
    children = data.get("data", {}).get("children", [])
    return [c.get("data", {}) for c in children if c.get("kind") == "t3"]


def main() -> None:
    ua = "UrbanShieldIngest/0.1 (class project; contact: your-team@example.com)"
    inserted = 0
    with httpx.Client(headers={"User-Agent": ua}) as client:
        db = SessionLocal()
        try:
            seen_links: set[str] = set()
            for kw in KEYWORDS:
                posts = fetch_posts(client, kw)
                for p in posts:
                    title = (p.get("title") or "").strip()
                    body = (p.get("selftext") or "").strip()
                    full = f"{title}\n{body}"
                    cat = pick_category(full)
                    if not cat:
                        continue
                    coords = extract_lat_lng(full)
                    if not coords:
                        continue
                    lat, lng = coords
                    link = p.get("permalink") or ""
                    if link in seen_links:
                        continue
                    seen_links.add(link)
                    desc = f"[reddit:{kw}] {title}"[:2000]
                    row = Incident(
                        id=str(uuid.uuid4()),
                        category=cat,
                        description=desc,
                        lat=lat,
                        lng=lng,
                        created_at=datetime.now(timezone.utc),
                    )
                    db.add(row)
                    inserted += 1
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    print(f"Ingest complete. Inserted rows: {inserted}")


if __name__ == "__main__":
    main()
