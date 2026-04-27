# Safety-Aware Routing MVP Demo Script

## Preconditions

- Web app env configured (`apps/web/.env.local`) with:
  - `NEXT_PUBLIC_MAPBOX_TOKEN`
  - `NEXT_PUBLIC_API_BASE_URL`
- API server running and returning incidents.
- Transport geometry endpoint reachable at:
  - `${NEXT_PUBLIC_API_BASE_URL}/data/transport_route_geometries_vic.geojson`

## Demo Flow

1. Open `/map`.
2. Verify default behavior:
   - Map loads.
   - Suspicious activity markers/zones are visible (all incidents in current viewport query).
3. Tap `Plan Route` in the action dock.
4. Set `Start point` and `Destination` (search or map center buttons).
5. Toggle between `Walk` and `Bus`, then click `Find safer routes`.
6. Verify route options:
   - Ranked by safety score (highest first).
   - Route cards show distance, duration, safety score, incident count.
7. Expand a route card:
   - Incident details include `type`, `recorded time`, `source`, `description`.
8. Select a route:
   - Map highlights route geometry.
   - Incident markers/zones focus on route-relevant incidents.
9. Tap `Report Incident` in the action dock:
   - Existing report flow still works.
   - Submit a report and verify it appears with recorded timestamp.
10. Tap `Walk With Peer`:
    - Placeholder panel shows `Coming soon`.

## Acceptance Checks

- Default map mode shows all incidents from query results.
- Route mode shows route candidates and safety ranking.
- After route selection, only route-relevant incidents render on map.
- Every route incident detail row includes recorded time.
- Build passes (`npm --prefix apps/web run build`).

