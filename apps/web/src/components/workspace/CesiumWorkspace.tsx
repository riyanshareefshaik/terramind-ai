import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { config } from '../../config/env'
import { TwinSceneController } from '../../cesium/TwinSceneController'
import type { TwinEntity } from '../../types/twin'
import type {
  BaseLayerState,
  BuildingColorMode,
  CameraState,
  WorkspaceHandle,
} from '../../types/workspace'
import { MapLegend } from './MapLegend'
import { MapToolbar } from './MapToolbar'
import { TelemetryBar } from './TelemetryBar'

export interface CesiumWorkspaceProps {
  entities: TwinEntity[]
  visibility: Record<string, boolean>
  colorMode: BuildingColorMode
  selectedId: string | null
  simulatedLayersVisible: boolean
  onSelect: (entityId: string | null) => void
  onBaseLayersChange: (layers: BaseLayerState[]) => void
  ref?: Ref<WorkspaceHandle>
}

/** The 3D city workspace. All Cesium access goes through TwinSceneController. */
export default function CesiumWorkspace({
  entities,
  visibility,
  colorMode,
  selectedId,
  simulatedLayersVisible,
  onSelect,
  onBaseLayersChange,
  ref,
}: CesiumWorkspaceProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<TwinSceneController | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [camera, setCamera] = useState<CameraState | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  // Keep the latest callbacks without re-creating the viewer when they change.
  const callbacks = useRef({ onSelect, onBaseLayersChange })
  useEffect(() => {
    callbacks.current = { onSelect, onBaseLayersChange }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let controller: TwinSceneController
    try {
      controller = new TwinSceneController({
        container,
        ionToken: config.cesiumIonToken,
        home: config.home,
        onSelect: (id) => callbacks.current.onSelect(id),
        onCameraChange: setCamera,
        onBaseLayersChange: (layers) => callbacks.current.onBaseLayersChange(layers),
      })
    } catch (error) {
      // Most commonly: WebGL is unavailable or disabled in this browser.
      // oxlint-disable-next-line react/set-state-in-effect -- reporting an external init failure
      setInitError(error instanceof Error ? error.message : String(error))
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- publishing the external viewer instance
    setScene(controller)
    return () => {
      setScene(null)
      controller.destroy()
    }
  }, [])

  useEffect(() => {
    scene?.setEntities(entities)
  }, [scene, entities])

  useEffect(() => {
    if (!scene) return
    for (const [layerId, visible] of Object.entries(visibility)) scene.setLayerVisibility(layerId, visible)
  }, [scene, visibility])

  useEffect(() => {
    scene?.setBuildingColorMode(colorMode)
  }, [scene, colorMode])

  useEffect(() => {
    scene?.select(selectedId)
  }, [scene, selectedId, entities])

  useImperativeHandle(
    ref,
    () => ({
      flyToEntity: (id) => scene?.flyToEntity(id),
      flyToLocation: (latitude, longitude) => scene?.flyToLocation(latitude, longitude),
      flyHome: () => scene?.flyHome(),
    }),
    [scene],
  )

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frameRef.current?.requestFullscreen()
  }

  return (
    <div className="workspace" ref={frameRef}>
      <div className="workspace__canvas" ref={containerRef} />
      {initError ? (
        <div className="workspace__fallback" role="alert">
          <strong>3D view unavailable</strong>
          <span>
            The Cesium viewer could not start. Your browser may not support WebGL, or it is
            disabled. ({initError})
          </span>
        </div>
      ) : (
        <>
          {simulatedLayersVisible && (
            <div className="workspace__notice" role="note">
              <span className="provenance provenance--simulated">SIMULATED</span>
              Twin layers show synthetic demo data, not real city conditions.
            </div>
          )}
          <MapToolbar
            disabled={!scene}
            fullscreen={fullscreen}
            fullscreenSupported={document.fullscreenEnabled}
            onHome={() => scene?.flyHome()}
            onZoom={(direction) => scene?.zoom(direction)}
            onTilt={(delta) => scene?.tilt(delta)}
            onTopDown={() => scene?.topDown()}
            onNorth={() => scene?.resetNorth()}
            onToggleFullscreen={toggleFullscreen}
          />
          <MapLegend colorMode={colorMode} visibility={visibility} />
          <TelemetryBar camera={camera} />
        </>
      )}
    </div>
  )
}
