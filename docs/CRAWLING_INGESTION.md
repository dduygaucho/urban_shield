# News and Social Incident Crawling

UrbanShield can crawl RSS news feeds and Reddit search results, extract likely safety incidents, and write them into the same SQLite-backed `incidents` table used by the map.

By default, the crawler is deterministic: it uses keyword rules, a local Melbourne/Geelong place dictionary, confidence scoring, and independent-source corroboration. You can optionally enable an online LLM verifier to reduce false positives such as sports posts that mention suburbs or teams.

## What It Does

The ingestion pipeline:

1. Fetches RSS/Atom items from `INGEST_RSS_FEEDS`.
2. Fetches Reddit posts from `INGEST_REDDIT_QUERIES`.
3. Cleans title/body text.
4. Classifies incident type and duration with the canonical backend rules.
5. Finds a known Melbourne/Geelong place from `scripts/ingest/places.py`.
6. Optionally asks an online LLM verifier whether the candidate is a real public-safety incident.
7. Scores confidence and verification status.
8. Inserts a new incident or strengthens an existing matching incident.

Core files:

- `scripts/ingest/connectors.py` - RSS and Reddit fetchers.
- `scripts/ingest/extract.py` - extraction, confidence scoring, matching, and evidence helpers.
- `scripts/ingest/llm_verifier.py` - optional online LLM verification.
- `scripts/ingest/places.py` - deterministic place-to-coordinate lookup.
- `scripts/ingest/service.py` - database write, duplicate handling, strengthening, and scheduler loop.
- `scripts/ingest_social.py` - manual one-shot entrypoint using the shared pipeline.

## Environment

Copy the backend template if you have not already:

```bash
cp services/api/.env.example services/api/.env
```

Relevant settings live in `services/api/.env`:

```env
INGEST_ENABLED=false
INGEST_INTERVAL_SECONDS=1800
INGEST_RSS_FEEDS=
INGEST_REDDIT_QUERIES=melbourne fight,melbourne robbery,geelong suspicious,melbourne attack
LLM_VERIFIER_ENABLED=false
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=
LLM_MODEL=
LLM_MIN_CONFIDENCE=0.60
LLM_TIMEOUT_SECONDS=20
```

`services/api/database.py` loads this file through the shared `settings` object. The API and crawler read ingestion settings from that object, not from shell-only environment variables.

### RSS Feeds

`INGEST_RSS_FEEDS` is comma-separated:

```env
INGEST_RSS_FEEDS=https://example.com/local-news.rss,https://example.com/police-updates.xml
```

Leave it empty to run Reddit-only while testing.

### Reddit Queries

`INGEST_REDDIT_QUERIES` is comma-separated:

```env
INGEST_REDDIT_QUERIES=melbourne robbery,melbourne fight,geelong suspicious
```

The Reddit connector uses Reddit's public search JSON endpoint with a descriptive User-Agent.

### Optional LLM Verifier

The LLM verifier runs only after local rules find a plausible candidate. It is designed to catch false positives where a place name appears in a non-incident context, for example a sports match review mentioning Carlton.

Enable it in `services/api/.env`:

```env
LLM_VERIFIER_ENABLED=true
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_api_key_here
LLM_MODEL=your_model_name_here
LLM_MIN_CONFIDENCE=0.60
LLM_TIMEOUT_SECONDS=20
```

The endpoint must accept OpenAI-compatible chat-completions requests and return JSON. The verifier asks for:

```json
{
  "is_incident": true,
  "incident_type": "crime",
  "duration_class": "short_term",
  "confidence": 0.82,
  "reason": "Reports a robbery near Carlton, not a sports match."
}
```

If the verifier rejects the candidate, the crawler skips it. If the verifier is disabled, missing config, times out, or fails, the crawler falls back to deterministic local rules.

## Running

### Scheduled With API

Enable ingestion:

```env
INGEST_ENABLED=true
INGEST_INTERVAL_SECONDS=1800
```

Start the API:

```bash
cd services/api
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

On startup, FastAPI creates the background ingestion task. Each run logs a compact summary:

```text
UrbanShield ingest: {"candidates":1,"errors":0,"fetched":12,"inserted":1,"skipped":11,"strengthened":0}
```

### Manual One-Shot Run

From repo root:

```bash
PYTHONPATH=services/api python scripts/ingest_social.py
```

This uses the same pipeline as the scheduled service and prints:

```text
Ingest complete. fetched=12 candidates=1 inserted=1 strengthened=0 skipped=11 errors=0
```

## Confidence and Verification

Candidates are accepted only when they include both:

- an incident keyword, such as robbery, fight, suspicious, attack, drunk, harassment; and
- a known place from `scripts/ingest/places.py`.

Confidence is deterministic:

- news starts higher than social,
- incident keywords add confidence,
- known place matches add confidence,
- source URL and timestamp add smaller boosts.
- when enabled, the LLM verifier can raise confidence or reject a candidate.

Status values:

- `verified` - confidence is `>= 0.75`.
- `needs_review` - confidence is accepted but below `0.75`.
- candidates below `0.40` are skipped unless later logic raises them through corroboration.

## Duplicate and Corroboration Behavior

The crawler does not blindly insert every article or post.

- Exact repeats are skipped by `source_fingerprint`.
- A candidate can strengthen an existing incident when type, location, time window, and text/place similarity match.
- Independent sources count as corroboration. For example, `news:ABC` and `social:reddit:melbourne robbery` can strengthen the same incident.
- Repeated evidence from the same source does not boost confidence again.

Strengthening updates:

- `confidence`
- `verification_status`
- `verification_reason`
- `evidence_count`
- `evidence_sources`

## Incident Metadata

Crawled incidents store the normal map-compatible fields plus source metadata:

```text
source_category
source_url
source_fingerprint
verification_status
verification_reason
evidence_count
evidence_sources
```

The API response includes these fields through `GET /incidents`, while retaining the existing map fields such as `category`, `description`, `lat`, `lng`, and `created_at`.

## Tests

Run the extraction tests from repo root with the backend Python environment active:

```bash
conda activate urban_shield
python -m unittest scripts.ingest.test_pipeline
```

Expected output:

```text
....
----------------------------------------------------------------------
Ran 4 tests in ...
OK
```

If you see `ModuleNotFoundError: No module named 'fastapi'`, activate the project environment first. The tests import the canonical backend classification helpers.

## Common Issues

No incidents are inserted:

- Check that the text contains both an incident keyword and a known place.
- Add missing suburbs or landmarks to `scripts/ingest/places.py`.
- Check the run summary's `fetched`, `candidates`, and `skipped` counts.

Scheduled ingestion does not run:

- Confirm `services/api/.env` has `INGEST_ENABLED=true`.
- Restart the API after changing `.env`.
- Ensure you are starting the API through `services/api/main.py`.

RSS feed fails:

- Confirm the URL returns valid RSS or Atom XML.
- Keep `INGEST_RSS_FEEDS` comma-separated with no surrounding quotes.

Reddit fetch fails:

- Reddit may rate-limit public search.
- The scheduled loop catches connector errors and continues on the next interval.
