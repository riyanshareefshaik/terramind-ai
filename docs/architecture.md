# Architecture

## Frontend (`apps/web`)

```
src/
├── App.tsx                  data loading, layer visibility, selection state
├── config/                  env vars (env.ts) and the shared colour palette
├── types/                   TypeScript mirrors of the API schemas + workspace types
├── services/                HTTP client and typed API calls (no UI code)
├── hooks/useResource.ts     loading / error / reload / polling for any fetcher
├── cesium/                  ALL Cesium code lives here
│   ├── setup.ts             CESIUM_BASE_URL for workers and assets
│   ├── entityGraphics.ts    twin entity → Cesium graphics, colour modes, selection style
│   └── TwinSceneController  owns the Viewer: layers, entities, picking, camera
└── components/
    ├── workspace/           CesiumWorkspace (lazy-loaded), toolbar, legend, telemetry
    ├── panels/              layer manager, weather, inspector, alerts, analytics
    ├── header/              app header, entity/coordinate search
    └── common/              panel, provenance badge, state messages, icons
```

React components never touch Cesium directly. `CesiumWorkspace` creates a
`TwinSceneController` and forwards props to it (entities, visibility, colour mode,
selection), and exposes a small `WorkspaceHandle` (`flyToEntity`, `flyToLocation`,
`flyHome`). Swapping or extending the renderer only touches `src/cesium/`.

CesiumJS is lazy-loaded into its own chunk so the app shell renders first. Its
static workers and assets are copied to `/cesium` by `vite-plugin-static-copy`.

## Backend (`apps/api`)

```
app/
├── main.py                 app, CORS, routers, / and /health
├── core/config.py          settings from TERRAMIND_* env vars
├── schemas/                Pydantic models: provenance, weather, twin entities, layers
├── services/weather.py     Open-Meteo client with a short TTL cache
├── services/twin/
│   ├── base.py             TwinDataProvider protocol
│   ├── demo.py             SIMULATED synthetic district
│   └── __init__.py         provider selection (TERRAMIND_TWIN_PROVIDER)
└── api/                    weather, twin, and insights (alerts/analytics) routers
```

## Adding a real data source

1. Implement `TwinDataProvider` (e.g. a PostGIS-backed provider using
   `database/schema`), returning the same schema types with the correct
   `Provenance` on each `DataSource`.
2. Register it in `services/twin/__init__.py` and select it with
   `TERRAMIND_TWIN_PROVIDER`.
3. Mixed sources are fine: each entity carries its own `data_source`, and the
   UI labels each one individually.

The frontend needs no changes for new entities of existing types. A new entity
type needs a schema, a TypeScript type, a graphic in `entityGraphics.ts`, and an
inspector section.
