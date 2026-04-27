#!/usr/bin/env python3
"""Run the shared news/social ingestion pipeline once.

The scheduled API service uses the same code path when INGEST_ENABLED=true.
"""
from __future__ import annotations

from ingest.service import run_ingest_once


def main() -> None:
    result = run_ingest_once()
    print(
        "Ingest complete. "
        f"fetched={result.fetched} candidates={result.candidates} "
        f"inserted={result.inserted} strengthened={result.strengthened} "
        f"skipped={result.skipped} errors={result.errors}"
    )


if __name__ == "__main__":
    main()
