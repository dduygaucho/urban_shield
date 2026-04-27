#!/usr/bin/env bash
# Local smoke test for FastAPI (health + transport GeoJSON route).
# Usage: from repo root, with API running (e.g. uvicorn in services/api).
#   ./scripts/smoke_deploy_local.sh
#   NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 ./scripts/smoke_deploy_local.sh

set -euo pipefail

API_BASE="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:8000}"
API_BASE="${API_BASE%/}"

echo "== GET ${API_BASE}/health"
code=$(curl -sS -o /tmp/urban_shield_health.json -w "%{http_code}" "${API_BASE}/health")
if [[ "$code" != "200" ]]; then
  echo "FAIL: expected HTTP 200, got ${code}"
  exit 1
fi
cat /tmp/urban_shield_health.json
echo ""

echo "== GET (first byte) ${API_BASE}/data/transport_route_geometries_vic.geojson"
# Ranged GET avoids downloading ~95MB; HEAD may return 405 on some FastAPI/FileResponse setups.
code=$(curl -sS -o /dev/null -w "%{http_code}" --range 0-0 "${API_BASE}/data/transport_route_geometries_vic.geojson")
if [[ "$code" != "200" && "$code" != "206" ]]; then
  echo "FAIL: expected HTTP 200 or 206 for GeoJSON, got ${code} (set TRANSPORT_ROUTE_GEOJSON_PATH or ensure LFS file exists)"
  exit 1
fi
curl -sS -D- -o /dev/null --range 0-0 "${API_BASE}/data/transport_route_geometries_vic.geojson" | head -n 12

echo ""
echo "OK: health and GeoJSON endpoints respond."
