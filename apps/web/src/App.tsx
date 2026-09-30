import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import { StateMessage } from './components/common/StateMessage'
import { AppHeader } from './components/header/AppHeader'
import { SearchBox } from './components/header/SearchBox'
import { AlertsPanel } from './components/panels/AlertsPanel'
import { AnalyticsPanel } from './components/panels/AnalyticsPanel'
import { EntityInspector } from './components/panels/EntityInspector'
import { LayerManager } from './components/panels/LayerManager'
import { WeatherPanel } from './components/panels/WeatherPanel'
import { config } from './config/env'
import { useResource } from './hooks/useResource'
import { api } from './services/api'
import type { TwinEntity } from './types/twin'
import type { BaseLayerState, BuildingColorMode, WorkspaceHandle } from './types/workspace'

// CesiumJS is several megabytes; load it in its own chunk so the shell renders first.
const CesiumWorkspace = lazy(() => import('./components/workspace/CesiumWorkspace'))

type InsightTab = 'inspect' | 'alerts' | 'analytics'

const WEATHER_REFRESH_MS = 10 * 60 * 1000
const HEALTH_REFRESH_MS = 30 * 1000
const NO_ENTITIES: TwinEntity[] = []

async function fetchTwin(signal: AbortSignal) {
  const [layers, entities] = await Promise.all([api.twinLayers(signal), api.twinEntities(signal)])
  return { layers: layers.layers, entities: entities.entities }
}

export default function App() {
  const health = useResource(api.health, HEALTH_REFRESH_MS)
  const weather = useResource(api.weather, WEATHER_REFRESH_MS)
  const twin = useResource(fetchTwin)
  const alerts = useResource(api.alerts)
  const analytics = useResource(api.analytics)

  const workspace = useRef<WorkspaceHandle>(null)
  const [baseLayers, setBaseLayers] = useState<BaseLayerState[]>([])
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [colorMode, setColorMode] = useState<BuildingColorMode>('risk')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<InsightTab>('inspect')

  const entities = twin.data?.entities ?? NO_ENTITIES
  const twinLayers = twin.data?.layers ?? null
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities])
  const selected = selectedId ? (entityById.get(selectedId) ?? null) : null

  // Layer defaults come from the providers; the user's toggles override them.
  const visibility = useMemo(() => {
    const defaults: Record<string, boolean> = {}
    for (const layer of baseLayers) defaults[layer.id] = true
    for (const layer of twinLayers ?? []) defaults[layer.id] = layer.available && layer.default_visible
    return { ...defaults, ...overrides }
  }, [baseLayers, twinLayers, overrides])

  const simulatedLayersVisible = (twinLayers ?? []).some(
    (layer) => layer.provenance === 'SIMULATED' && visibility[layer.id],
  )

  const toggleLayer = useCallback((layerId: string, visible: boolean) => {
    setOverrides((current) => ({ ...current, [layerId]: visible }))
  }, [])

  const handleSceneSelect = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) setTab('inspect')
  }, [])

  /** Select from outside the 3D view: make its layer visible, then fly to it. */
  const focusEntity = useCallback(
    (id: string) => {
      const entity = entityById.get(id)
      if (!entity) return
      setOverrides((current) => ({ ...current, [entity.layer_id]: true }))
      setSelectedId(id)
      setTab('inspect')
      // Wait a frame so the layer's visibility change has reached the scene.
      requestAnimationFrame(() => workspace.current?.flyToEntity(id))
    },
    [entityById],
  )

  const apiStatus = health.data ? 'online' : health.error ? 'offline' : 'checking'
  const alertCount = alerts.data?.alerts.filter((a) => a.severity !== 'info').length ?? 0

  return (
    <div className="app">
      <AppHeader
        locationName={config.home.name}
        apiStatus={apiStatus}
        ionConfigured={config.cesiumIonToken !== null}
        search={
          <SearchBox
            entities={entities}
            onSelectEntity={focusEntity}
            onFlyToLocation={(lat, lon) => workspace.current?.flyToLocation(lat, lon)}
          />
        }
      />

      <main className="layout">
        <aside className="sidebar sidebar--left">
          <LayerManager
            baseLayers={baseLayers}
            twinLayers={twinLayers}
            twinError={twin.error}
            twinLoading={twin.loading}
            onRetry={twin.reload}
            visibility={visibility}
            onToggle={toggleLayer}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
          />
          <WeatherPanel weather={weather} />
        </aside>

        <section className="stage" aria-label="3D city workspace">
          <Suspense fallback={<StateMessage kind="loading">Loading 3D engine…</StateMessage>}>
            <CesiumWorkspace
              ref={workspace}
              entities={entities}
              visibility={visibility}
              colorMode={colorMode}
              selectedId={selectedId}
              simulatedLayersVisible={simulatedLayersVisible}
              onSelect={handleSceneSelect}
              onBaseLayersChange={setBaseLayers}
            />
          </Suspense>
        </section>

        <aside className="sidebar sidebar--right">
          <section className="panel insights">
            <div className="tabs" role="tablist" aria-label="Insights">
              {(['inspect', 'alerts', 'analytics'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? 'is-active' : ''}
                  onClick={() => setTab(id)}
                >
                  {id === 'inspect' ? 'Inspector' : id === 'alerts' ? 'Alerts' : 'Analytics'}
                  {id === 'alerts' && alertCount > 0 && <span className="tabs__count">{alertCount}</span>}
                </button>
              ))}
            </div>
            <div className="panel__body" role="tabpanel">
              {tab === 'inspect' && (
                <EntityInspector
                  entity={selected}
                  layerName={twinLayers?.find((l) => l.id === selected?.layer_id)?.name ?? null}
                  onFlyTo={(id) => workspace.current?.flyToEntity(id)}
                  onClear={() => setSelectedId(null)}
                />
              )}
              {tab === 'alerts' && <AlertsPanel alerts={alerts} onSelectEntity={focusEntity} />}
              {tab === 'analytics' && <AnalyticsPanel analytics={analytics} />}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}
