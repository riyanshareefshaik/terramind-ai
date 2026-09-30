# Architecture

## Frontend (`apps/web`)

```
src/
├── App.tsx                  layout, layer settings, view-following area data
├── config/                  env vars, shared colour palette (map + legends)
├── types/                   API schema mirrors (api.ts), workspace types
├── services/                HTTP client and typed API calls
├── hooks/                   useResource (load/error/reload/poll), useDebounced
├── cesium/                  ALL Cesium code lives here
│   ├── MapScene.ts          owns the Viewer: layers, picking, camera, view focus
│   ├── BuildingTiles.ts     streams OSM tiles → one batched Primitive per tile
│   ├── terrain.ts           Terrarium terrain + ground-height sampling
│   └── basemaps.ts          satellite / streets / dark imagery
└── components/
    ├── map/                 MapView (lazy-loaded), controls, status, legend
    ├── sidebar/             Overview, Layers, Details, Alerts tabs, forecast chart
    └── TopBar, SearchBox
```

React never touches Cesium directly: `MapView` creates a `MapScene` and exposes a
small `MapHandle` (`flyToPlace`, `flyToLocation`, `flyToSelection`, `flyHome`,
`clearSelection`).

### Building streaming

When the camera settles within ~9 km of the ground, `BuildingTiles` requests the
zoom-15 tiles around the view centre (nearest first, 3 at a time, up to 16 per
view), keeps up to 60 in memory and evicts the least recently needed. Each
tile's buildings are extruded from their footprints at the terrain height under
them (the minimum over the footprint, so slopes never show gaps) and batched
into one `Primitive`, which keeps tens of thousands of buildings fast. Colour
modes and selection update per-instance colour attributes in place.

The view centre comes from intersecting the screen-centre ray with the
ellipsoid, not from `globe.pick`: rendered terrain tiles lag behind a camera
flight, which made picks land kilometres away.

## Backend (`apps/api`)

```
app/
├── main.py                 app, gzip, CORS, routers
├── core/                   settings (TERRAMIND_* env vars), shared HTTP client
├── schemas/                weather, air quality, alerts, places
├── services/
│   ├── osm_tiles.py        Overpass query, OSM → GeoJSON, heights, disk cache
│   ├── weather.py          Open-Meteo current + hourly
│   ├── air_quality.py      Open-Meteo CAMS + India National AQI
│   ├── alerts.py           threshold alerts from forecast + AQI
│   └── geocoding.py        Nominatim search / reverse (1 req/s)
└── api/                    weather/air/alerts, places, tiles routers
```

Each building is assigned to the tile containing its centroid, so a building on
a tile edge is returned once. Tiles are cached in `datasets/cache/osm` for 14
days; if Overpass is busy, a stale cached copy is served rather than nothing,
and the client retries failed tiles after 20 seconds. Several Overpass mirrors
are tried in order.
