import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { MapScene } from '../../cesium/MapScene'
import { config } from '../../config/env'
import { api } from '../../services/api'
import type { CameraState, LayerSettings, MapHandle, Selection, TileStats, ViewFocus } from '../../types/workspace'
import { Legend } from './Legend'
import { MapControls } from './MapControls'
import { MapStatus } from './MapStatus'

export interface MapViewProps {
  layers: LayerSettings
  onSelect: (selection: Selection | null) => void
  onViewChange: (focus: ViewFocus) => void
  ref?: Ref<MapHandle>
}

/** The 3D map. All Cesium access goes through MapScene. */
export default function MapView({ layers, onSelect, onViewChange, ref }: MapViewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<MapScene | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [camera, setCamera] = useState<CameraState | null>(null)
  const [stats, setStats] = useState<TileStats | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  const callbacks = useRef({ onSelect, onViewChange })
  useEffect(() => {
    callbacks.current = { onSelect, onViewChange }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let instance: MapScene
    try {
      instance = new MapScene({
        container,
        ionToken: config.cesiumIonToken,
        home: config.home,
        fetchTile: api.tile,
        onSelect: (selection) => callbacks.current.onSelect(selection),
        onViewChange: (focus) => callbacks.current.onViewChange(focus),
        onCameraChange: setCamera,
        onTileStats: setStats,
      })
    } catch (error) {
      // oxlint-disable-next-line react/set-state-in-effect -- reporting an external init failure
      setInitError(error instanceof Error ? error.message : String(error))
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- publishing the external viewer instance
    setScene(instance)
    return () => {
      setScene(null)
      instance.destroy()
    }
  }, [])

  useEffect(() => {
    scene?.applyLayers(layers)
  }, [scene, layers])

  useImperativeHandle(
    ref,
    () => ({
      flyToPlace: (place) => scene?.flyToPlace(place),
      flyToLocation: (latitude, longitude) => scene?.flyToLocation(latitude, longitude),
      flyToSelection: () => scene?.flyToSelection(),
      flyHome: () => scene?.flyHome(),
      clearSelection: () => scene?.clearSelection(),
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
    <div className="map" ref={frameRef}>
      <div className="map__canvas" ref={containerRef} />
      {initError ? (
        <div className="map__fallback" role="alert">
          <strong>3D map unavailable</strong>
          <span>This browser couldn’t start WebGL. Try enabling hardware acceleration. ({initError})</span>
        </div>
      ) : (
        <>
          <MapControls
            disabled={!scene}
            fullscreen={fullscreen}
            fullscreenSupported={document.fullscreenEnabled}
            onHome={() => scene?.flyHome()}
            onZoom={(direction) => scene?.zoom(direction)}
            onTilt={(delta) => scene?.tilt(delta)}
            onRotate={(delta) => scene?.rotate(delta)}
            onNorth={() => scene?.resetNorth()}
            onToggleFullscreen={toggleFullscreen}
          />
          {layers.buildings && <Legend mode={layers.colorMode} />}
          <MapStatus stats={stats} camera={camera} buildingsOn={layers.buildings} />
        </>
      )}
    </div>
  )
}
