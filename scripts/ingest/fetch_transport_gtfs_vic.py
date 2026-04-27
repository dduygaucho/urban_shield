#!/usr/bin/env python3
"""
Download Victoria GTFS Schedule zip to scratch (not the git repo).

Default data root:
  /scratch/s224714149/sidework

Default data directory:
  /scratch/s224714149/sidework/urban_shield/transport_gtfs/

Overrides:
  TRANSPORT_DATA_ROOT (preferred root override)
  VIC_GTFS_DATA_DIR (explicit full dir override)

See README_transport_gtfs_vic.md for collaborator setup.

From repo root:
  PYTHONPATH=services/api python scripts/ingest/fetch_transport_gtfs_vic.py
  PYTHONPATH=services/api python scripts/ingest/fetch_transport_gtfs_vic.py --extract --normalize --with-fallback
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import httpx

_ROOT = Path(__file__).resolve().parents[2]
_INGEST = _ROOT / "scripts" / "ingest"

DEFAULT_DATA_ROOT = "/scratch/s224714149/sidework"
DEFAULT_DATA_SUBDIR = "urban_shield/transport_gtfs"
DEFAULT_SCHEDULE_URL = (
    "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/"
    "resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip"
)

ZIP_NAME = "gtfs_schedule.zip"
FETCH_META_NAME = "gtfs_fetch.meta.json"
EXTRACT_DIR_NAME = "gtfs_extracted"
USER_AGENT = "UrbanShieldTransportIngest/1.0 (research; contact project maintainers)"


def data_dir() -> Path:
    explicit = os.environ.get("VIC_GTFS_DATA_DIR", "").strip()
    if explicit:
        return Path(explicit).expanduser()
    root = os.environ.get("TRANSPORT_DATA_ROOT", DEFAULT_DATA_ROOT).strip() or DEFAULT_DATA_ROOT
    return Path(root).expanduser() / DEFAULT_DATA_SUBDIR


def schedule_url() -> str:
    return os.environ.get("VIC_GTFS_SCHEDULE_URL", DEFAULT_SCHEDULE_URL).strip()


def sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def fetch_zip(dest_dir: Path, url: str) -> tuple[Path, str, str]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / ZIP_NAME
    tmp = dest_dir / f"{ZIP_NAME}.part"
    fetched_at = datetime.now(timezone.utc).isoformat()
    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(timeout=600.0, follow_redirects=True, headers=headers) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            with tmp.open("wb") as f:
                for chunk in resp.iter_bytes():
                    f.write(chunk)
    tmp.replace(out)
    digest = sha256_file(out)
    meta = {
        "source_url": url,
        "fetched_at": fetched_at,
        "sha256": digest,
        "zip_path": str(out),
    }
    (dest_dir / FETCH_META_NAME).write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return out, digest, fetched_at


def extract_zip(zip_path: Path, dest_dir: Path) -> Path:
    out_dir = dest_dir / EXTRACT_DIR_NAME
    tmp_dir = dest_dir / f"{EXTRACT_DIR_NAME}.tmp"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(tmp_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    tmp_dir.replace(out_dir)
    return out_dir


def run_normalize(with_fallback: bool) -> int:
    cmd = [sys.executable, str(_INGEST / "normalize_transport_routes.py")]
    if with_fallback:
        cmd.append("--with-fallback")
    return subprocess.call(cmd, cwd=str(_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Victoria GTFS Schedule to scratch storage.")
    parser.add_argument(
        "--extract",
        action="store_true",
        help="Extract gtfs_schedule.zip into gtfs_extracted/ after download.",
    )
    parser.add_argument(
        "--normalize",
        action="store_true",
        help="Run normalize_transport_routes.py after a successful fetch.",
    )
    parser.add_argument(
        "--with-fallback",
        action="store_true",
        help="Pass --with-fallback to the normalizer (when used with --normalize).",
    )
    args = parser.parse_args()
    ddir = data_dir()
    url = schedule_url()
    out: Path | None = None
    try:
        out, digest, _ = fetch_zip(ddir, url)
        print(f"GTFS fetch OK: {out} sha256={digest}", flush=True)
    except Exception as e:
        print(f"GTFS fetch FAILED: {e}", file=sys.stderr, flush=True)
        if args.normalize:
            return run_normalize(with_fallback=args.with_fallback)
        return 1

    if args.extract and out is not None:
        try:
            extracted = extract_zip(out, ddir)
            print(f"GTFS extract OK: {extracted}", flush=True)
            meta_path = ddir / FETCH_META_NAME
            if meta_path.is_file():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                meta["extracted_dir"] = str(extracted)
                meta["extracted_at"] = datetime.now(timezone.utc).isoformat()
                meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        except Exception as e:
            print(f"GTFS extract FAILED: {e}", file=sys.stderr, flush=True)
            if not args.normalize:
                return 1

    if args.normalize:
        return run_normalize(with_fallback=args.with_fallback)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
