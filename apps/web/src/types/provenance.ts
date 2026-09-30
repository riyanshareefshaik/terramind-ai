/** Where a value comes from. Rendered next to every data point in the UI. */
export type Provenance = 'LIVE' | 'SIMULATED' | 'ESTIMATED' | 'HISTORICAL' | 'UNAVAILABLE'

export interface DataSource {
  provenance: Provenance
  source: string
  description: string | null
  updated_at: string | null
}

export interface GeoPoint {
  latitude: number
  longitude: number
}
