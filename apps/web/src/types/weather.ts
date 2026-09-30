import type { DataSource } from './provenance'

export interface WeatherResponse {
  location: {
    latitude: number
    longitude: number
    name: string | null
    elevation_m: number | null
    timezone: string | null
  }
  current: {
    observed_at: string | null
    temperature_c: number | null
    apparent_temperature_c: number | null
    humidity_pct: number | null
    wind_speed_kmh: number | null
    wind_direction_deg: number | null
    precipitation_mm: number | null
    cloud_cover_pct: number | null
    weather_code: number | null
    condition: string
    is_day: boolean | null
  }
  data_source: DataSource
}
