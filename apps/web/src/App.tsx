import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { StateMessage } from './components/common/StateMessage'
import { SearchBox } from './components/SearchBox'
import { AlertsTab } from './components/sidebar/AlertsTab'
import { DetailsTab } from './components/sidebar/DetailsTab'
import { LayersTab } from './components/sidebar/LayersTab'
import { OverviewTab } from './components/sidebar/OverviewTab'
import { TopBar } from './components/TopBar'
import { config } from './config/env'
import { useResource } from './hooks/useResource'
import { api, type LatLon } from './services/api'
import type { LayerSettings, MapHandle, Selection, ViewFocus } from './types/workspace'

// CesiumJS is several megabytes; load it in its own chunk so the shell renders first.
const MapView = lazy(() => import('./components/map/MapView'))

type Tab = 'overview' | 'layers' | 'details' | 'alerts'

const WEATHER_REFRESH_MS = 10 * 60 * 1000
const HEALTH_REFRESH_MS = 30 * 1000
/** Refresh area weather once the view moves this far… */
const REFOCUS_DISTANCE_M = 2_000
/** …and the locality name sooner, since neighbourhoods are small. */
const RENAME_DISTANCE_M = 400
const LAYERS_KEY = 'terramind.layers'

const DEFAULT_LAYERS: LayerSettings = {
  basemap: 'satellite',
  terrain: true,
  buildings: true,
  places: true,
  colorMode: 'natural',
}

function loadLayers(): LayerSettings {
  try {
    const saved = window.localStorage.getItem(LAYERS_KEY)
    return saved ? { ...DEFAULT_LAYERS, ...(JSON.parse(saved) as Partial<LayerSettings>) } : DEFAULT_LAYERS
  } catch {
    return DEFAULT_LAYERS
  }
}

function metresBetween(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export default function App() {
  const map = useRef<MapHandle>(null)
  const [layers, setLayers] = useState<LayerSettings>(loadLayers)
  const [focus, setFocus] = useState<LatLon>({ latitude: config.home.latitude, longitude: config.home.longitude })
  const [areaFocus, setAreaFocus] = useState<LatLon>(focus)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYERS_KEY, JSON.stringify(layers))
    } catch {
      // Storage unavailable (private mode); settings just won't persist.
    }
  }, [layers])

  const health = useResource(api.health, HEALTH_REFRESH_MS)
  const weather = useResource(
    useCallback((signal: AbortSignal) => api.weather(focus, signal), [focus]),
    WEATHER_REFRESH_MS,
  )
  const air = useResource(
    useCallback((signal: AbortSignal) => api.airQuality(focus, signal), [focus]),
    WEATHER_REFRESH_MS,
  )
  const alerts = useResource(
    useCallback((signal: AbortSignal) => api.alerts(focus, signal), [focus]),
    WEATHER_REFRESH_MS,
  )
  const area = useResource(useCallback((signal: AbortSignal) => api.areaName(areaFocus, signal), [areaFocus]))

  const handleViewChange = useCallback((view: ViewFocus) => {
    // Only follow the view at city scale; from orbit the "centre" means little.
    if (view.range > 60_000) return
    const next = { latitude: Number(view.latitude.toFixed(4)), longitude: Number(view.longitude.toFixed(4)) }
    setFocus((current) => (metresBetween(current, view) > REFOCUS_DISTANCE_M ? next : current))
    setAreaFocus((current) => (metresBetween(current, view) > RENAME_DISTANCE_M ? next : current))
  }, [])

  const handleSelect = useCallback((next: Selection | null) => {
    setSelection(next)
    if (next) setTab('details')
  }, [])

  const updateLayers = useCallback((patch: Partial<LayerSettings>) => {
    setLayers((current) => ({ ...current, ...patch }))
  }, [])

  const placeName = area.data?.name ?? area.data?.city ?? (area.loading ? '…' : config.home.name)
  const alertCount = alerts.data?.alerts.length ?? 0
  const offline = health.error !== null && health.data === null

  return (
    <div className="app">
      <TopBar
        search={
          <SearchBox
            onPlace={(place) => map.current?.flyToPlace(place)}
            onCoordinates={(lat, lon) => map.current?.flyToLocation(lat, lon)}
          />
        }
        placeName={placeName}
        weather={weather.data}
        air={air.data}
        offline={offline}
      />

      <main className="layout">
        <aside className="sidebar" aria-label="Area information">
          <div className="tabs" role="tablist">
            {(
              [
                ['overview', 'Overview'],
                ['layers', 'Layers'],
                ['details', 'Details'],
                ['alerts', 'Alerts'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'is-active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
                {id === 'alerts' && alertCount > 0 && <span className="tabs__count">{alertCount}</span>}
              </button>
            ))}
          </div>
          <div className="sidebar__body" role="tabpanel">
            {tab === 'overview' && <OverviewTab area={area.data} weather={weather} air={air} />}
            {tab === 'layers' && <LayersTab layers={layers} onChange={updateLayers} />}
            {tab === 'details' && (
              <DetailsTab
                selection={selection}
                onFlyTo={() => map.current?.flyToSelection()}
                onClear={() => map.current?.clearSelection()}
              />
            )}
            {tab === 'alerts' && (
              <AlertsTab alerts={alerts} placeName={placeName} timeZone={weather.data?.location.timezone ?? null} />
            )}
          </div>
        </aside>

        <section className="stage" aria-label="3D map">
          <Suspense fallback={<StateMessage kind="loading">Loading 3D map…</StateMessage>}>
            <MapView ref={map} layers={layers} onSelect={handleSelect} onViewChange={handleViewChange} />
          </Suspense>
        </section>
      </main>
    </div>
  )
}
