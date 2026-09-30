function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return value && Number.isFinite(parsed) ? parsed : fallback
}

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() ?? ''

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  /** Optional: upgrades terrain to Cesium World Terrain. Everything works without it. */
  cesiumIonToken: ionToken && ionToken !== 'YOUR_CESIUM_TOKEN' ? ionToken : null,
  home: {
    name: import.meta.env.VITE_HOME_NAME || 'Vijayawada',
    latitude: numberOr(import.meta.env.VITE_HOME_LATITUDE, 16.5062),
    longitude: numberOr(import.meta.env.VITE_HOME_LONGITUDE, 80.648),
  },
} as const
