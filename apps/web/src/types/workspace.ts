export type BaseLayerId = 'imagery' | 'terrain' | 'osm-buildings'
export type BaseLayerStatus = 'loading' | 'ready' | 'unavailable' | 'error'

export interface BaseLayerState {
  id: BaseLayerId
  name: string
  source: string
  status: BaseLayerStatus
  message: string | null
}

export type BuildingColorMode = 'risk' | 'height' | 'use'

export interface CameraState {
  latitude: number
  longitude: number
  /** Metres above the WGS84 ellipsoid. */
  height: number
  headingDeg: number
  pitchDeg: number
}

/** Imperative API the 3D workspace exposes to the rest of the app. */
export interface WorkspaceHandle {
  flyToEntity: (entityId: string) => void
  flyToLocation: (latitude: number, longitude: number) => void
  flyHome: () => void
}
