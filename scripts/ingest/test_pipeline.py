"""Unit tests for the ingestion extraction and corroboration rules."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from .extract import (
    RawSourceItem,
    candidate_from_item,
    candidate_matches_incident,
    evidence_sources_to_set,
    evidence_sources_to_text,
    strengthened_confidence,
)
from .places import lookup_place


class IngestPipelineTests(unittest.TestCase):
    def test_news_candidate_extracts_place_type_and_confidence(self) -> None:
        item = RawSourceItem(
            source_category="news",
            source_name="fixture-news",
            title="Robbery reported near Flinders Street",
            text="Police say the incident happened today near Flinders Street in Melbourne.",
            url="https://example.test/robbery",
            published_at=datetime(2026, 4, 27, tzinfo=timezone.utc),
        )

        candidate = candidate_from_item(item, lookup_place)

        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.type, "crime")
        self.assertEqual(candidate.duration_class, "short_term")
        self.assertGreaterEqual(candidate.confidence, 0.75)
        self.assertEqual(candidate.verification_status, "verified")

    def test_missing_known_place_is_skipped(self) -> None:
        item = RawSourceItem(
            source_category="social",
            source_name="reddit:test",
            title="Suspicious activity",
            text="Something suspicious happened somewhere unspecified.",
            url="https://reddit.test/post",
        )

        self.assertIsNone(candidate_from_item(item, lookup_place))

    def test_sports_post_with_place_name_is_skipped(self) -> None:
        item = RawSourceItem(
            source_category="social",
            source_name="reddit:FremantleFC",
            title="Rd 7 vs Carlton smurf review",
            text="Fremantle player review after the AFL match against Carlton.",
            url="https://www.reddit.com/r/FremantleFC/comments/1swset1/rd_7_vs_carlton_smurf_review/",
            published_at=datetime(2026, 4, 27, tzinfo=timezone.utc),
        )

        self.assertIsNone(candidate_from_item(item, lookup_place))

    def test_independent_source_can_match_existing_incident(self) -> None:
        item = RawSourceItem(
            source_category="social",
            source_name="reddit:test",
            title="Fight near Geelong station",
            text="A fight is active near Geelong.",
            url="https://reddit.test/fight",
            published_at=datetime(2026, 4, 27, tzinfo=timezone.utc),
        )
        candidate = candidate_from_item(item, lookup_place)
        assert candidate is not None
        incident = SimpleNamespace(
            type="violence",
            lat=candidate.lat,
            lng=candidate.lng,
            timestamp=candidate.timestamp,
            created_at=candidate.timestamp,
            description="News report: fight near geelong station",
        )

        self.assertTrue(candidate_matches_incident(candidate, incident))
        self.assertGreater(strengthened_confidence(0.55, candidate), 0.55)

    def test_evidence_sources_round_trip(self) -> None:
        text = evidence_sources_to_text({"news:abc", "social:reddit"})

        self.assertEqual(evidence_sources_to_set(text), {"news:abc", "social:reddit"})


if __name__ == "__main__":
    unittest.main()
