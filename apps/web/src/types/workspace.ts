import type { BuildingFeature, PlaceFeature } from './api'
import type { Place } from './api'

export type BasemapId = 'satellite' | 'streets' | 'dark'
export type BuildingColorMode = 'natural' | 'height' | 'use'

export interface LayerSettings {
  basemap: BasemapId
  terrain: boolean
  buildings: boolean
  places: boolean
  colorMode: BuildingColorMode
}

export interface CameraState {
  latitude: number
  longitude: number
  /** Metres above the ellipsoid. */
  height: number
  headingDeg: number
  pitchDeg: number
}

/** What the camera is looking at, used to fetch area weather and names. */
export interface ViewFocus {
  latitude: number
  longitude: number
  /** Distance from camera to the focus point, metres. */
  range: number
}

export interface TileStats {
  tiles: number
  loading: number
  failed: number
  buildings: number
  places: number
  /** True when the camera is too far out to stream buildings. */
  tooFar: boolean
}

export type Selection =
  | { kind: 'building'; feature: BuildingFeature; groundElevation: number | null }
  | { kind: 'place'; feature: PlaceFeature; groundElevation: number | null }

/** Imperative API the map exposes to the rest of the app. */
export interface MapHandle {
  flyToPlace: (place: Place) => void
  flyToLocation: (latitude: number, longitude: number) => void
  flyToSelection: () => void
  flyHome: () => void
  clearSelection: () => void
}
