// TypeScript mirrors of the TerraMind API schemas (apps/api/app/schemas).

export interface WeatherResponse {
  location: { latitude: number; longitude: number; elevation_m: number | null; timezone: string | null }
  current: {
    observed_at: string | null
    temperature_c: number | null
    apparent_temperature_c: number | null
    humidity_pct: number | null
    wind_speed_kmh: number | null
    wind_gusts_kmh: number | null
    wind_direction_deg: number | null
    precipitation_mm: number | null
    cloud_cover_pct: number | null
    pressure_hpa: number | null
    uv_index: number | null
    weather_code: number | null
    condition: string
    is_day: boolean | null
  }
  today: {
    temperature_max_c: number | null
    temperature_min_c: number | null
    sunrise: string | null
    sunset: string | null
  }
  hourly: HourlyForecast[]
}

export interface HourlyForecast {
  time: string
  temperature_c: number | null
  apparent_temperature_c: number | null
  precipitation_mm: number | null
  precipitation_probability_pct: number | null
  wind_gusts_kmh: number | null
  weather_code: number | null
}

export type AqiCategory =
  | 'Good'
  | 'Satisfactory'
  | 'Moderately polluted'
  | 'Poor'
  | 'Very poor'
  | 'Severe'

export interface Pollutant {
  id: string
  label: string
  unit: string
  current: number | null
  average: number | null
  averaging_hours: number
  sub_index: number | null
}

export interface AirQualityResponse {
  latitude: number
  longitude: number
  observed_at: string | null
  aqi: number | null
  category: AqiCategory | null
  dominant_pollutant: string | null
  pollutants: Pollutant[]
}

export interface Alert {
  id: string
  severity: 'advisory' | 'warning' | 'severe'
  category: 'heat' | 'rain' | 'storm' | 'wind' | 'air'
  title: string
  message: string
  starts_at: string | null
}

export interface AlertsResponse {
  latitude: number
  longitude: number
  alerts: Alert[]
  sources_failed: string[]
}

export interface Place {
  id: string
  name: string
  context: string
  kind: string
  latitude: number
  longitude: number
  /** south, west, north, east */
  bbox: [number, number, number, number] | null
}

export interface AreaName {
  latitude: number
  longitude: number
  name: string | null
  locality: string | null
  city: string | null
  district: string | null
  state: string | null
}

// -- Map tiles (GeoJSON) -----------------------------------------------------

export type BuildingKind = 'residential' | 'commercial' | 'industrial' | 'public' | 'religious' | 'other'
export type HeightSource = 'tagged' | 'levels' | 'estimated'
export type PlaceCategory =
  | 'health'
  | 'education'
  | 'emergency'
  | 'transport'
  | 'government'
  | 'commerce'
  | 'worship'
  | 'landmark'

export interface BuildingFeature {
  type: 'Feature'
  id: string
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
  properties: {
    name: string | null
    kind: BuildingKind
    height: number
    height_source: HeightSource
    levels: number | null
    area_m2: number
    tags: Record<string, string>
  }
}

export interface PlaceFeature {
  type: 'Feature'
  id: string
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    name: string | null
    category: PlaceCategory
    tags: Record<string, string>
  }
}

export interface MapTile {
  z: number
  x: number
  y: number
  bbox: [number, number, number, number]
  fetched_at: string
  buildings: { type: 'FeatureCollection'; features: BuildingFeature[] }
  places: { type: 'FeatureCollection'; features: PlaceFeature[] }
}
