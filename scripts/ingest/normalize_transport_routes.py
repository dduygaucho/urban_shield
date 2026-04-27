#!/usr/bin/env python3
"""
Normalize Victoria GTFS Schedule routes.txt into stable UrbanShield route keys.

Reads zip from:
  - VIC_GTFS_DATA_DIR/gtfs_schedule.zip (if set), else
  - TRANSPORT_DATA_ROOT/urban_shield/transport_gtfs/gtfs_schedule.zip
See README_transport_gtfs_vic.md.
Writes:
  scripts/ingest/transport_routes_vic_normalized.json
  scripts/ingest/transport_routes_vic_normalized.meta.json
  scratch + repo geometry artifacts (see README_transport_gtfs_vic.md).

With --with-fallback, uses transport_routes_vic_subset.json if GTFS is missing or unusable.

From repo root:
  PYTHONPATH=services/api python scripts/ingest/normalize_transport_routes.py --with-fallback
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
_INGEST = _ROOT / "scripts" / "ingest"

DEFAULT_DATA_ROOT = "/scratch/s224714149/sidework"
DEFAULT_DATA_SUBDIR = "urban_shield/transport_gtfs"
ZIP_NAME = "gtfs_schedule.zip"
FETCH_META_NAME = "gtfs_fetch.meta.json"
SUBSET_FIXTURE = _INGEST / "transport_routes_vic_subset.json"
OUT_JSON = _INGEST / "transport_routes_vic_normalized.json"
OUT_META = _INGEST / "transport_routes_vic_normalized.meta.json"

# Route geometry artifacts (Agent-F geometry producer)
SCRATCH_GEOJSON = "transport_route_geometries_vic.geojson"
SCRATCH_GEO_META = "transport_route_geometries_vic.meta.json"
SCRATCH_GEO_INDEX = "transport_route_geometry_index_vic.json"
REPO_GEOJSON = _INGEST / "transport_route_geometries_vic.geojson"
REPO_GEO_META = _INGEST / "transport_route_geometries_vic.meta.json"
REPO_GEO_INDEX = _INGEST / "transport_route_geometry_index_vic.json"
REPO_GEOJSON_MAX_BYTES = 15 * 1024 * 1024  # copy to repo only if under this size


def data_dir() -> Path:
    explicit = os.environ.get("VIC_GTFS_DATA_DIR", "").strip()
    if explicit:
        return Path(explicit).expanduser()
    root = os.environ.get("TRANSPORT_DATA_ROOT", DEFAULT_DATA_ROOT).strip() or DEFAULT_DATA_ROOT
    return Path(root).expanduser() / DEFAULT_DATA_SUBDIR


def _slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "unknown"


def map_gtfs_route_type(route_type_raw: str) -> str | None:
    """Map GTFS route_type integer (or string) to bus|train|tram; None if unsupported."""
    try:
        n = int(float(str(route_type_raw).strip()))
    except (TypeError, ValueError):
        return None
    if n == 0 or n == 900:
        return "tram"
    if n in (1, 2) or 100 <= n <= 199:
        return "train"
    if n in (3, 11) or 700 <= n <= 899:
        return "bus"
    return None


def _route_label(row: dict[str, str]) -> str:
    short = (row.get("route_short_name") or "").strip()
    long = (row.get("route_long_name") or "").strip()
    if short and long:
        return f"{short} — {long}"
    return short or long or (row.get("route_id") or "").strip() or "Unknown route"


def _read_agencies(z: zipfile.ZipFile, routes_member: str) -> dict[str, str]:
    """Load agency_id -> agency_name for the folder containing this routes.txt."""
    names = set(z.namelist())
    candidates: list[str] = []
    if "/" in routes_member:
        prefix = routes_member.rsplit("/", 1)[0]
        candidates.append(f"{prefix}/agency.txt")
    candidates.append("agency.txt")
    agency_path = next((c for c in candidates if c in names), "")
    if not agency_path:
        prefix = routes_member.rsplit("/", 1)[0] if "/" in routes_member else ""
        for name in sorted(names):
            if name.endswith("/agency.txt") and (not prefix or name.startswith(prefix + "/")):
                agency_path = name
                break
    if agency_path not in names:
        return {}
    text = z.read(agency_path).decode("utf-8-sig", errors="replace")
    rdr = csv.DictReader(io.StringIO(text))
    out: dict[str, str] = {}
    for row in rdr:
        aid = (row.get("agency_id") or "").strip()
        name = (row.get("agency_name") or "").strip()
        if aid:
            out[aid] = name or aid
    return out


def _routes_paths(z: zipfile.ZipFile) -> list[str]:
    return sorted(n for n in z.namelist() if n.endswith("routes.txt"))


def _normalize_routes_from_zip(z: zipfile.ZipFile, feed_tag: str = "") -> list[dict[str, str]]:
    routes_out: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    paths = _routes_paths(z)
    if not paths:
        return routes_out

    for rtp in paths:
        agencies = _read_agencies(z, rtp)
        text = z.read(rtp).decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            if not route_id:
                continue
            agency_id = (row.get("agency_id") or "").strip()
            if not agency_id and len(agencies) == 1:
                agency_id = next(iter(agencies.keys()))
            rt = map_gtfs_route_type(row.get("route_type") or "3")
            if rt is None:
                continue
            ext = _slug(f"vic_gtfs_{feed_tag}_{agency_id}_{route_id}")
            if ext in seen_ids:
                continue
            seen_ids.add(ext)
            label = _route_label(row)
            geom = f"geom_{ext}_v1"
            routes_out.append(
                {
                    "route_type": rt,
                    "route_external_id": ext,
                    "route_label": label,
                    "geometry_ref": geom,
                }
            )
    return routes_out


def normalize_from_gtfs_zip(zip_path: Path) -> tuple[list[dict[str, str]], dict[str, Any]]:
    fetch_meta: dict[str, Any] = {}
    fetch_meta_path = zip_path.parent / FETCH_META_NAME
    if fetch_meta_path.is_file():
        fetch_meta = json.loads(fetch_meta_path.read_text(encoding="utf-8"))

    routes_out: list[dict[str, str]] = []
    seen_global: set[str] = set()

    with zipfile.ZipFile(zip_path, "r") as z:
        # Case 1: flat GTFS with routes.txt directly in archive.
        direct = _normalize_routes_from_zip(z, feed_tag="root")
        for row in direct:
            ext = row["route_external_id"]
            if ext in seen_global:
                continue
            seen_global.add(ext)
            routes_out.append(row)

        # Case 2: Victoria archive-of-archives (e.g. 1/google_transit.zip, 3/google_transit.zip).
        nested_zip_members = sorted(n for n in z.namelist() if n.endswith(".zip"))
        for member in nested_zip_members:
            try:
                blob = z.read(member)
                with zipfile.ZipFile(io.BytesIO(blob), "r") as inner:
                    feed_tag = member.rsplit("/", 1)[0] if "/" in member else Path(member).stem
                    rows = _normalize_routes_from_zip(inner, feed_tag=feed_tag)
                    for row in rows:
                        ext = row["route_external_id"]
                        if ext in seen_global:
                            continue
                        seen_global.add(ext)
                        routes_out.append(row)
            except zipfile.BadZipFile:
                continue

        if not routes_out:
            raise ValueError("No routes.txt found in GTFS zip (including nested feed zips)")

    routes_out.sort(key=lambda r: (r["route_type"], r["route_external_id"]))
    meta: dict[str, Any] = {
        "source_url": fetch_meta.get("source_url"),
        "fetched_at": fetch_meta.get("fetched_at"),
        "gtfs_zip_sha256": fetch_meta.get("sha256"),
        "gtfs_zip_path": str(zip_path),
        "route_count": len(routes_out),
        "fallback_used": False,
        "data_dir": str(zip_path.parent),
    }
    return routes_out, meta


def load_fixture_fallback() -> tuple[list[dict[str, str]], dict[str, Any]]:
    data = json.loads(SUBSET_FIXTURE.read_text(encoding="utf-8"))
    routes = data.get("routes") or []
    meta = {
        "source_url": None,
        "fetched_at": None,
        "gtfs_zip_sha256": None,
        "gtfs_zip_path": None,
        "route_count": len(routes),
        "fallback_used": True,
        "data_dir": str(data_dir()),
        "fixture_path": str(SUBSET_FIXTURE),
    }
    return routes, meta


def _first_csv_member(z: zipfile.ZipFile, suffix: str) -> str | None:
    cands = sorted(n for n in z.namelist() if n.endswith(suffix))
    return cands[0] if cands else None


def _parse_trips_route_to_shapes(z: zipfile.ZipFile) -> dict[str, list[str]]:
    """route_id -> ordered unique non-empty shape_ids from trips.txt."""
    path = _first_csv_member(z, "trips.txt")
    if not path:
        return {}
    text = z.read(path).decode("utf-8-sig", errors="replace")
    rdr = csv.DictReader(io.StringIO(text))
    out: dict[str, list[str]] = {}
    for row in rdr:
        rid = (row.get("route_id") or "").strip()
        sid = (row.get("shape_id") or "").strip()
        if not rid or not sid:
            continue
        if rid not in out:
            out[rid] = []
        if sid not in out[rid]:
            out[rid].append(sid)
    return out


def _parse_shapes(z: zipfile.ZipFile) -> dict[str, list[tuple[float, float]]]:
    """shape_id -> list of (lat, lng) in shape_pt_sequence order."""
    path = _first_csv_member(z, "shapes.txt")
    if not path:
        return {}
    text = z.read(path).decode("utf-8-sig", errors="replace")
    rdr = csv.DictReader(io.StringIO(text))
    buckets: dict[str, list[tuple[int, float, float]]] = {}
    for row in rdr:
        sid = (row.get("shape_id") or "").strip()
        if not sid:
            continue
        try:
            seq = int(float(str(row.get("shape_pt_sequence") or "0").strip()))
        except (TypeError, ValueError):
            seq = 0
        try:
            lat = float(str(row.get("shape_pt_lat") or "").strip())
            lng = float(str(row.get("shape_pt_lon") or "").strip())
        except (TypeError, ValueError):
            continue
        buckets.setdefault(sid, []).append((seq, lat, lng))
    out: dict[str, list[tuple[float, float]]] = {}
    for sid, pts in buckets.items():
        pts.sort(key=lambda t: t[0])
        coords: list[tuple[float, float]] = []
        for _, lat, lng in pts:
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                continue
            if coords and coords[-1] == (lat, lng):
                continue
            coords.append((lat, lng))
        if len(coords) >= 2:
            out[sid] = coords
    return out


def _linestrings_from_shape_ids(
    shape_ids: list[str],
    shapes: dict[str, list[tuple[float, float]]],
) -> list[list[list[float]]]:
    """GeoJSON LineString coordinates (lng, lat) for each shape_id with >=2 points."""
    lines: list[list[list[float]]] = []
    for sid in shape_ids:
        pts = shapes.get(sid)
        if not pts or len(pts) < 2:
            continue
        lines.append([[lng, lat] for lat, lng in pts])
    return lines


def _geometry_from_lines(lines: list[list[list[float]]]) -> dict[str, Any] | None:
    if not lines:
        return None
    if len(lines) == 1:
        return {"type": "LineString", "coordinates": lines[0]}
    return {"type": "MultiLineString", "coordinates": lines}


def _collect_geometries_one_zip(
    z: zipfile.ZipFile,
    feed_tag: str,
    allowed_exts: frozenset[str],
) -> dict[str, dict[str, Any]]:
    """Map route_external_id -> GeoJSON geometry dict for routes in this feed zip."""
    trips = _parse_trips_route_to_shapes(z)
    shapes = _parse_shapes(z)
    if not trips or not shapes:
        return {}

    out_geom: dict[str, dict[str, Any]] = {}
    paths = _routes_paths(z)
    for rtp in paths:
        agencies = _read_agencies(z, rtp)
        text = z.read(rtp).decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            if not route_id:
                continue
            agency_id = (row.get("agency_id") or "").strip()
            if not agency_id and len(agencies) == 1:
                agency_id = next(iter(agencies.keys()))
            rt = map_gtfs_route_type(row.get("route_type") or "3")
            if rt is None:
                continue
            ext = _slug(f"vic_gtfs_{feed_tag}_{agency_id}_{route_id}")
            if ext not in allowed_exts:
                continue
            shape_ids = trips.get(route_id) or []
            lines = _linestrings_from_shape_ids(shape_ids, shapes)
            geom = _geometry_from_lines(lines)
            if geom is not None:
                out_geom[ext] = geom
    return out_geom


def collect_route_geometries_from_gtfs_zip(
    zip_path: Path,
    routes: list[dict[str, str]],
) -> dict[str, dict[str, Any]]:
    """route_external_id -> GeoJSON geometry object (LineString or MultiLineString)."""
    allowed = frozenset(r["route_external_id"] for r in routes)
    merged: dict[str, dict[str, Any]] = {}

    with zipfile.ZipFile(zip_path, "r") as z:
        for ext, geom in _collect_geometries_one_zip(z, "root", allowed).items():
            if ext not in merged:
                merged[ext] = geom

        nested_zip_members = sorted(n for n in z.namelist() if n.endswith(".zip"))
        for member in nested_zip_members:
            try:
                blob = z.read(member)
                with zipfile.ZipFile(io.BytesIO(blob), "r") as inner:
                    feed_tag = member.rsplit("/", 1)[0] if "/" in member else Path(member).stem
                    for ext, geom in _collect_geometries_one_zip(inner, feed_tag, allowed).items():
                        if ext not in merged:
                            merged[ext] = geom
            except zipfile.BadZipFile:
                continue
    return merged


def emit_route_geometry_artifacts(
    zip_path: Path | None,
    routes: list[dict[str, str]],
    source: str,
    fallback_used: bool,
    scratch_root: Path,
) -> None:
    """
    Write GeoJSON FeatureCollection + join index + meta to scratch and small handoffs to repo.
    Only includes features with real GTFS-resolved geometry; never invents coordinates.
    """
    generated_at = datetime.now(timezone.utc).isoformat()
    # Use logical path (symlink target may differ on shared compute, e.g. /scratch -> /vast).
    data_root = str(scratch_root)

    ext_to_route: dict[str, dict[str, str]] = {r["route_external_id"]: r for r in routes}
    geometries: dict[str, dict[str, Any]] = {}
    if zip_path is not None and zip_path.is_file() and source == "gtfs_vic_schedule" and not fallback_used:
        try:
            geometries = collect_route_geometries_from_gtfs_zip(zip_path, routes)
        except Exception as e:
            print(f"Geometry extraction warning: {e}", file=sys.stderr, flush=True)
            geometries = {}

    features: list[dict[str, Any]] = []
    for ext, r in ext_to_route.items():
        geom = geometries.get(ext)
        if not geom:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "route_type": r["route_type"],
                    "route_external_id": r["route_external_id"],
                    "route_label": r["route_label"],
                    "geometry_ref": r["geometry_ref"],
                },
                "geometry": geom,
            }
        )
    features.sort(key=lambda f: f["properties"]["route_external_id"])

    fc: dict[str, Any] = {"type": "FeatureCollection", "features": features}
    scratch_geo = scratch_root / SCRATCH_GEOJSON
    scratch_root.mkdir(parents=True, exist_ok=True)
    geo_str = json.dumps(fc, ensure_ascii=False)
    scratch_geo.write_text(geo_str + "\n", encoding="utf-8")

    resolved_exts = {f["properties"]["route_external_id"] for f in features}
    route_count_total = len(routes)
    geometry_count_resolved = len(features)
    geometry_count_missing = route_count_total - geometry_count_resolved
    missing_examples: list[dict[str, str]] = []
    for r in routes:
        if r["route_external_id"] in resolved_exts:
            continue
        missing_examples.append(
            {
                "route_external_id": r["route_external_id"],
                "geometry_ref": r["geometry_ref"],
                "route_type": r["route_type"],
                "route_label": r["route_label"],
            }
        )
        if len(missing_examples) >= 50:
            break

    by_geom: dict[str, dict[str, str]] = {}
    by_ext: dict[str, dict[str, str]] = {}
    for f in features:
        p = f["properties"]
        by_geom[p["geometry_ref"]] = {
            "route_type": p["route_type"],
            "route_external_id": p["route_external_id"],
            "route_label": p["route_label"],
            "geometry_ref": p["geometry_ref"],
        }
        by_ext[p["route_external_id"]] = {
            "route_type": p["route_type"],
            "route_external_id": p["route_external_id"],
            "route_label": p["route_label"],
            "geometry_ref": p["geometry_ref"],
        }
    index_doc = {
        "version": "1",
        "generated_at": generated_at,
        "by_geometry_ref": by_geom,
        "by_route_external_id": by_ext,
    }

    nbytes = scratch_geo.stat().st_size
    geo_meta: dict[str, Any] = {
        "generated_at": generated_at,
        "source": source,
        "fallback_used": fallback_used,
        "route_count_total": route_count_total,
        "geometry_count_resolved": geometry_count_resolved,
        "geometry_count_missing": geometry_count_missing,
        "missing_geometry_examples": missing_examples,
        "data_root": data_root,
        "scratch_geojson": str(scratch_geo),
        "scratch_index": str(scratch_root / SCRATCH_GEO_INDEX),
    }
    if nbytes <= REPO_GEOJSON_MAX_BYTES:
        REPO_GEOJSON.write_text(geo_str + "\n", encoding="utf-8")
        geo_meta["repo_geojson"] = str(REPO_GEOJSON)
    else:
        if REPO_GEOJSON.is_file():
            REPO_GEOJSON.unlink()
        geo_meta["repo_geojson"] = None
        geo_meta["repo_geojson_note"] = (
            f"GeoJSON too large for repo copy ({nbytes} bytes > {REPO_GEOJSON_MAX_BYTES}). "
            f"Use scratch file: {scratch_geo}"
        )

    scratch_meta = scratch_root / SCRATCH_GEO_META
    scratch_index = scratch_root / SCRATCH_GEO_INDEX
    scratch_meta.write_text(json.dumps(geo_meta, indent=2) + "\n", encoding="utf-8")
    scratch_index.write_text(json.dumps(index_doc, indent=2) + "\n", encoding="utf-8")
    REPO_GEO_META.write_text(json.dumps(geo_meta, indent=2) + "\n", encoding="utf-8")
    REPO_GEO_INDEX.write_text(json.dumps(index_doc, indent=2) + "\n", encoding="utf-8")

    print(
        f"Geometry artifacts: resolved={geometry_count_resolved} missing={geometry_count_missing} "
        f"scratch={scratch_geo}",
        flush=True,
    )


def write_outputs(
    routes: list[dict[str, str]],
    source: str,
    meta_extra: dict[str, Any],
) -> None:
    generated_at = datetime.now(timezone.utc).isoformat()
    doc = {
        "version": "1",
        "source": source,
        "generated_at": generated_at,
        "region": "Victoria_Australia",
        "routes": routes,
    }
    OUT_JSON.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    meta = {
        "generated_at": generated_at,
        "normalized_path": str(OUT_JSON),
        **meta_extra,
    }
    OUT_META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize Victoria GTFS routes to UrbanShield keys.")
    parser.add_argument(
        "--with-fallback",
        action="store_true",
        help="On failure, write normalized output from transport_routes_vic_subset.json.",
    )
    args = parser.parse_args()

    ddir = data_dir()
    zip_path = ddir / ZIP_NAME

    try:
        if not zip_path.is_file():
            raise FileNotFoundError(f"Missing GTFS zip: {zip_path}")
        routes, meta = normalize_from_gtfs_zip(zip_path)
        if not routes:
            raise ValueError("No routes produced from GTFS")
        write_outputs(routes, "gtfs_vic_schedule", meta)
        emit_route_geometry_artifacts(
            zip_path,
            routes,
            "gtfs_vic_schedule",
            bool(meta.get("fallback_used")),
            ddir,
        )
        print(f"Normalized {len(routes)} routes from GTFS -> {OUT_JSON}", flush=True)
        return 0
    except Exception as e:
        print(f"GTFS normalize failed: {e}", file=sys.stderr, flush=True)
        if not args.with_fallback:
            return 1
        try:
            routes, meta = load_fixture_fallback()
            meta["fallback_error"] = str(e)
            write_outputs(routes, "fixture_fallback", meta)
            emit_route_geometry_artifacts(
                zip_path if zip_path.is_file() else None,
                routes,
                "fixture_fallback",
                True,
                ddir,
            )
            print(
                f"Wrote fallback normalized routes ({len(routes)}) -> {OUT_JSON}",
                flush=True,
            )
            return 0
        except Exception as e2:
            print(f"Fallback failed: {e2}", file=sys.stderr, flush=True)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
