"""Deterministic Melbourne/Geelong place lookup for ingestion."""
from __future__ import annotations

import re

PLACE_COORDS: dict[str, tuple[float, float]] = {
    "melbourne cbd": (-37.8136, 144.9631),
    "melbourne": (-37.8136, 144.9631),
    "flinders street": (-37.8183, 144.9671),
    "southern cross": (-37.8183, 144.9525),
    "docklands": (-37.8152, 144.9469),
    "southbank": (-37.8230, 144.9655),
    "carlton": (-37.8001, 144.9671),
    "fitzroy": (-37.7984, 144.9780),
    "richmond": (-37.8230, 144.9980),
    "collingwood": (-37.8021, 144.9887),
    "st kilda": (-37.8676, 144.9809),
    "brunswick": (-37.7667, 144.9617),
    "footscray": (-37.8000, 144.9000),
    "dandenong": (-37.9875, 145.2141),
    "box hill": (-37.8189, 145.1250),
    "sunshine": (-37.7885, 144.8321),
    "werribee": (-37.9000, 144.6600),
    "geelong cbd": (-38.1499, 144.3606),
    "geelong": (-38.1499, 144.3606),
    "corio": (-38.0833, 144.3667),
    "waurn ponds": (-38.1997, 144.2983),
    "newtown": (-38.1535, 144.3360),
    "belmont": (-38.1748, 144.3425),
}


def lookup_place(text: str) -> tuple[str, float, float] | None:
    lowered = text.lower()
    for place, (lat, lng) in sorted(PLACE_COORDS.items(), key=lambda item: len(item[0]), reverse=True):
        if re.search(rf"\b{re.escape(place)}\b", lowered):
            return place, lat, lng
    return None

