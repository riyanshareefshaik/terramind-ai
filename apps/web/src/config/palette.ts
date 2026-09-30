import type { BuildingEntity, RiskLevel, SensorEntity } from '../types/twin'

/** Colours shared by the 3D scene and the 2D legends so they always agree. */
export const palette = {
  selected: '#22d3ee',
  risk: {
    low: '#3ddc97',
    moderate: '#f5c542',
    high: '#f08a24',
    critical: '#e5484d',
  } satisfies Record<RiskLevel, string>,
  use: {
    residential: '#5fa8ff',
    commercial: '#b18cff',
    mixed: '#3ddc97',
    civic: '#f5c542',
    industrial: '#9aa5b1',
  } satisfies Record<BuildingEntity['use'], string>,
  heightRamp: ['#1d4d3c', '#a8f5d2'] as const,
  congestion: ['#3ddc97', '#f5c542', '#e5484d'] as const,
  sensorStatus: {
    online: '#3ddc97',
    degraded: '#f5c542',
    offline: '#8b949e',
  } satisfies Record<SensorEntity['status'], string>,
  hazard: {
    flood: '#3b82f6',
    heat: '#f97316',
  },
} as const

/** Height (m) at which the building height ramp saturates. */
export const HEIGHT_RAMP_MAX_M = 120
