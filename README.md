# TerraMind AI

A 3D city explorer for India: real terrain, real OpenStreetMap buildings and
places, live weather, air quality and alerts — anywhere you fly or search.
Home view is Vijayawada.

No accounts or API keys are required.

## Quick start

**Backend** (Python 3.11+):

```bash
cd apps/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000  (docs at /docs)
```

**Frontend** (Node 20+), from the repo root in a second terminal:

```bash
npm install
npm run dev:web                        # http://localhost:5173
```

Other scripts: `npm run build:web`, `npm run lint:web`, `npm run preview:web`.
Backend tests: `cd apps/api && pip install -r requirements-dev.txt && pytest`.

The dev server proxies `/api` and `/health` to `http://localhost:8000`.

## What you see, and where it comes from

| Feature | Source | Notes |
| --- | --- | --- |
| Satellite / street / dark base maps | Esri World Imagery, OpenStreetMap, CARTO | Free tiles; attribution shown on the map |
| 3D terrain | Mapzen Terrain Tiles (AWS Open Data) | Decoded in the browser; no token |
| 3D buildings | OpenStreetMap via Overpass | Streamed in ~1.2 km tiles around the camera, cached on disk |
| Hospitals, schools, police, transport… | OpenStreetMap via Overpass | Same tiles as buildings |
| Place search (all of India) | OpenStreetMap Nominatim | Rate-limited to 1 request/second server-side |
| Weather and 24 h forecast | Open-Meteo | Follows the area you are viewing |
| Air quality | Open-Meteo air-quality (CAMS model) | India National AQI computed from CPCB breakpoints |
| Alerts | Computed by TerraMind | IMD rainfall and CPCB AQI thresholds on the forecast; not official warnings |

**Honest limits.** Buildings exist wherever OpenStreetMap volunteers have mapped
them; coverage is dense in most Indian cities and thinner in rural areas. Only a
minority of buildings record a height or floor count. The rest use a typical
height for their type, and the details panel says so. Air-quality values are
model estimates, not monitoring-station readings.

**Optional:** set `VITE_CESIUM_ION_TOKEN` in `apps/web/.env.local` to use
Cesium World Terrain instead of the free terrain tiles.

## API

| Endpoint | Description |
| --- | --- |
| `GET /`, `GET /health` | Service info and health |
| `GET /api/weather?latitude=&longitude=` | Current conditions + next 24 hours |
| `GET /api/air-quality?latitude=&longitude=` | Pollutants and India National AQI |
| `GET /api/alerts?latitude=&longitude=` | Heat, rain, storm, wind and air alerts |
| `GET /api/places/search?q=` | Places in India |
| `GET /api/places/reverse?latitude=&longitude=` | Locality / city at a point |
| `GET /api/tiles/15/{x}/{y}` | OSM buildings (with heights) and places for one map tile |

Without coordinates, environment endpoints default to Vijayawada. See
[docs/architecture.md](docs/architecture.md) for the structure.
