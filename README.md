# TerraMind AI

An urban digital-twin platform: a CesiumJS 3D city workspace backed by a FastAPI
service for weather, twin entities, layers, alerts and analytics.

```
3D CITY → DATA LAYERS → SELECT ENTITY → INSPECT DATA → ANALYZE → (ASK AI → SIMULATE)
```

## Quick start

**Backend** (Python 3.11+):

```bash
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000  (docs at /docs)
```

**Frontend** (Node 20+), from the repo root:

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # optionally add VITE_CESIUM_ION_TOKEN
npm run dev:web                                # http://localhost:5173
```

Other scripts: `npm run build:web`, `npm run lint:web`, `npm run preview:web`.
Backend tests: `cd apps/api && pip install -r requirements-dev.txt && pytest`.

The dev server proxies `/api` and `/health` to `http://localhost:8000`, so no
CORS setup is needed locally.

### Cesium ion token

Without `VITE_CESIUM_ION_TOKEN` the workspace uses OpenStreetMap imagery on a
smooth globe. With a token (free at https://ion.cesium.com/tokens) it adds
**Cesium World Terrain**, **Cesium OSM Buildings** and Bing aerial imagery.
The layer manager shows which base layers are available and why.

## Data provenance

Every payload carries a provenance label, shown next to the data in the UI:

| Label | Meaning |
| --- | --- |
| `LIVE` | Fetched from a live external provider (today: Open-Meteo weather) |
| `SIMULATED` | Synthetic demo data — **not** a real-world measurement |
| `ESTIMATED` | Derived or modelled from other data |
| `HISTORICAL` | Past records |
| `UNAVAILABLE` | No provider connected, or it failed |

Today only weather is real. Buildings, roads, sensors, hazard zones, alerts and
analytics come from the **demo provider** (`apps/api/app/services/twin/demo.py`):
a deterministic synthetic district with every name prefixed "Demo". Traffic,
official air quality and utilities are listed as `UNAVAILABLE` layers until real
providers are connected.

## API

| Endpoint | Description |
| --- | --- |
| `GET /`, `GET /health` | Service info and health |
| `GET /api/weather?latitude=&longitude=` | Current conditions (LIVE, Open-Meteo); defaults to Hyderabad |
| `GET /api/twin/layers` | Layer catalogue with provenance and availability |
| `GET /api/twin/entities?layer=&type=&q=` | Twin entities (building, road, sensor, risk_zone) |
| `GET /api/twin/entities/{id}` | One entity |
| `GET /api/alerts` | Rule-based alerts over twin entities |
| `GET /api/analytics` | KPIs and distributions |

See [docs/architecture.md](docs/architecture.md) for the structure and how to
plug in real data.
