#!/usr/bin/env python3
"""
One-command Victoria transport ingestion for Agent-F.

This wrapper automates the full MVP-safe path:
1) ensure scratch data directory exists
2) download GTFS schedule zip
3) extract zip (for local inspection/debug)
4) normalize routes to stable keys
5) emit real GTFS route geometries (GeoJSON + join index + meta) under scratch and small repo handoffs
6) fall back deterministically to fixture subset on source failure

From repo root:
  PYTHONPATH=services/api python scripts/ingest/run_transport_ingest_vic.py
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_INGEST = _ROOT / "scripts" / "ingest"

DEFAULT_DATA_ROOT = "/scratch/s224714149/sidework"
DEFAULT_DATA_SUBDIR = "urban_shield/transport_gtfs"


def data_dir() -> Path:
    explicit = os.environ.get("VIC_GTFS_DATA_DIR", "").strip()
    if explicit:
        return Path(explicit).expanduser()
    root = os.environ.get("TRANSPORT_DATA_ROOT", DEFAULT_DATA_ROOT).strip() or DEFAULT_DATA_ROOT
    return Path(root).expanduser() / DEFAULT_DATA_SUBDIR


def run_cmd(cmd: list[str]) -> int:
    print(f"$ {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd, cwd=str(_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="Automated VIC transport ingestion (fetch+extract+normalize+fallback).")
    parser.add_argument(
        "--no-extract",
        action="store_true",
        help="Skip zip extraction step.",
    )
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="Disable deterministic fallback on normalize step.",
    )
    args = parser.parse_args()

    ddir = data_dir()
    ddir.mkdir(parents=True, exist_ok=True)
    print(f"Transport ingest data dir: {ddir}", flush=True)

    fetch_cmd = [sys.executable, str(_INGEST / "fetch_transport_gtfs_vic.py")]
    if not args.no_extract:
        fetch_cmd.append("--extract")
    fetch_cmd.append("--normalize")
    if not args.no_fallback:
        fetch_cmd.append("--with-fallback")

    rc = run_cmd(fetch_cmd)
    if rc != 0:
        return rc

    print("Transport ingestion complete.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
